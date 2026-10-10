import { Inject, Injectable } from "@nestjs/common";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage } from "@langchain/core/messages";
import { AiModelTypeEnum } from "@xpert-ai/contracts";
import {
  AssistantTaskRuntimeCapability,
  MANAGED_QUEUE_SERVICE_TOKEN,
  SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN,
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  PluginJobProcessor,
  SYSTEM_GLOBAL_SCOPE,
  type PluginContext,
  type ManagedQueueService,
  type ManagedQueueJob,
  type ManagedQueueJobContext,
  type SpeechToTextPermissionService,
  type AgentMiddlewareRuntimeServiceApi,
} from "@xpert-ai/plugin-sdk";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import {
  CONTEXT,
  PLUGIN,
  QUEUE,
  scopeSchema,
  idSchema,
  MeetingError,
  type Scope,
} from "./domain.js";
import type { Config } from "./config.js";
import { Meetings } from "./meetings.js";
import { CaptureDelivery } from "./capture-delivery.js";
import { Processing } from "./processing.js";
import { AssistantWorkflow } from "./assistant-workflow.js";
import { MeetingDocuments } from "./documents.js";

export const jobSchema = z
  .object({
    scope: scopeSchema,
    meetingId: idSchema,
    mode: z.enum(["live", "final", "assistant"]).default("final"),
  })
  .strict();
@Injectable()
export class MeetingsBackend {
  readonly meetings: Meetings;
  readonly captures: CaptureDelivery;
  readonly processing: Processing;
  readonly assistant: AssistantWorkflow;
  constructor(
    @Inject(CONTEXT) private readonly context: PluginContext<Config>,
    readonly documents: MeetingDocuments
  ) {
    const store = documents.store;
    this.meetings = new Meetings(
      store,
      async (scope, meetingId, chunk) =>
        this.enqueue(scope, meetingId, chunk ? "live" : "final"),
      context.config.failedAudioRetentionDays,
      context.config.silenceSeconds
    );
    this.captures = new CaptureDelivery(this.meetings);
    this.assistant = new AssistantWorkflow(
      store,
      (scope) => {
        const capability = this.context
          .resolve<AgentMiddlewareRuntimeServiceApi>(
            XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN
          )
          .createScopedApi({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            xpertId: scope.assistantId,
          })
          .capabilities?.get(AssistantTaskRuntimeCapability);
        if (!capability)
          throw new MeetingError("assistant_runtime_unavailable");
        return capability;
      },
      (scope, id, delay) => this.enqueue(scope, id, "assistant", delay)
    );
    this.processing = new Processing(
      store,
      {
        transcribe: async (scope, audio) => {
          const inline = this.context.config.inlineTranscription;
          if (inline) {
            const runtime = this.context
              .resolve<AgentMiddlewareRuntimeServiceApi>(
                XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN
              )
              .createScopedApi({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                userId: scope.userId,
                xpertId: scope.assistantId,
              });
            const abortController = new AbortController();
            const timer = setTimeout(() => abortController.abort(), 120000);
            try {
              const model = await runtime.createModelClient<BaseChatModel>(
                {
                  copilotId: inline.copilotId,
                  model: inline.model,
                  modelType: AiModelTypeEnum.SPEECH2TEXT,
                },
                { abortController }
              );
              const result = await model.invoke(
                [
                  new HumanMessage({
                    content: [
                      {
                        type: "input_audio",
                        input_audio: {
                          data: `data:audio/wav;base64,${audio.toString(
                            "base64"
                          )}`,
                        },
                      },
                    ],
                  }),
                ],
                { signal: abortController.signal }
              );
              if (typeof result.content !== "string")
                throw new MeetingError("transcription_response_invalid");
              return result.content;
            } finally {
              clearTimeout(timer);
            }
          }
          const stt = this.context.resolve<SpeechToTextPermissionService>(
            SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN
          );
          return (
            await stt.transcribe({
              xpertId: scope.assistantId,
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              file: {
                data: audio,
                originalName: "meeting.wav",
                mimeType: "audio/wav",
                size: audio.length,
              },
            })
          ).text;
        },
      },
      this.assistant,
      documents,
      context.config.silenceThresholdDb
    );
  }
  private async enqueue(
    scope: Scope,
    meetingId: string,
    mode: "live" | "final" | "assistant",
    delayMs = 0
  ) {
    const now = Date.now();
    // Coalesce watchers into future time buckets: uploads must not create multiplying poll loops.
    const due = Math.ceil((now + Math.max(2000, delayMs)) / 2000) * 2000;
    await this.context
      .resolve<ManagedQueueService>(MANAGED_QUEUE_SERVICE_TOKEN)
      .enqueue({
        pluginName: PLUGIN,
        queueName: QUEUE,
        jobName: "process",
        payload: { scope, meetingId, mode },
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        scopeKey: SYSTEM_GLOBAL_SCOPE,
        jobId:
          mode === "assistant"
            ? `meeting-${meetingId}-assistant-${due}`
            : `meeting-${meetingId}-${randomUUID()}`,
        attempts: 8,
        backoffMs: { type: "exponential", delay: 1000 },
        delayMs: mode === "assistant" ? due - now : delayMs,
      });
  }
}

@Injectable()
@PluginJobProcessor({
  pluginName: PLUGIN,
  queueName: QUEUE,
  jobName: "process",
  concurrency: 2,
})
export class MeetingsProcessor {
  constructor(private readonly backend: MeetingsBackend) {}
  async handle(job: ManagedQueueJob, context: ManagedQueueJobContext) {
    const data = jobSchema.parse(job.data);
    if (
      data.scope.tenantId !== context.tenantId ||
      data.scope.organizationId !== context.organizationId ||
      data.scope.userId !== context.userId
    )
      throw new MeetingError("job_scope_mismatch");
    try {
      if (data.mode === "live")
        await this.backend.processing.live(data.scope, data.meetingId);
      else if (data.mode === "assistant")
        await this.backend.assistant.tick(data.scope, data.meetingId);
      else await this.backend.processing.run(data.scope, data.meetingId);
    } catch (error) {
      if (
        data.mode === "assistant" &&
        job.attemptsMade + 1 >= Number(job.opts?.attempts ?? 1)
      ) {
        await this.backend.assistant
          .failSupervision(data.scope, data.meetingId)
          .catch(() => {});
      }
      if (
        data.mode === "final" &&
        job.attemptsMade + 1 >= Number(job.opts?.attempts ?? 1)
      ) {
        await this.backend.meetings.store
          .update(data.scope, data.meetingId, (m) => {
            if (m.processing === "queued") {
              m.processing = "failed";
              m.errorCode = "processing_failed";
            }
          })
          .catch(() => {});
      }
      throw error;
    }
  }
}
