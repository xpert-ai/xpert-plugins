import { HumanMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { ICopilotModel } from '@xpert-ai/contracts'
import {
  CreateModelClientCommand,
  PluginJobProcessor,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueJob,
  type ManagedQueueJobProcessor,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { CUT_ANALYSIS_QUEUE_NAME, CUT_PLUGIN_NAME, CUT_TRANSCRIPTION_JOB_NAME } from './constants.js'
import { CutCaptionService } from './cut-caption.service.js'
import { normalizeCutTranscriptionContent } from './cut-transcription.js'
import type { CutScope, CutTranscriptionQueueJobData } from './types.js'

@Injectable()
@PluginJobProcessor({
  pluginName: CUT_PLUGIN_NAME,
  queueName: CUT_ANALYSIS_QUEUE_NAME,
  jobName: CUT_TRANSCRIPTION_JOB_NAME,
  concurrency: 2
})
export class CutTranscriptionProcessor implements ManagedQueueJobProcessor<CutTranscriptionQueueJobData> {
  constructor(
    private readonly captions: CutCaptionService,
    @Optional() @Inject(CommandBus) private readonly commandBus?: Pick<CommandBus, 'execute'>,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry
  ) {}

  async handle(job: ManagedQueueJob<CutTranscriptionQueueJobData>) {
    const input = requirePayload(job.data)
    const scope = scopeFromPayload(input)
    const claimed = await this.captions.beginTranscriptionJob(scope, input.projectId, input.jobId)
    if (!claimed) return
    try {
      if (!this.commandBus) throw new Error('Platform model command runtime is unavailable for Cut transcription.')
      const files = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
      if (!files) throw new Error('Workspace Files capability is unavailable for Cut transcription.')
      const file = await files.readBuffer(input.fileReference)
      const fileUrl = file.fileUrl ?? file.url
      if (!fileUrl) throw new Error('Workspace media has no provider-readable URL for speech-to-text.')
      const copilotModel: ICopilotModel = {
        ...input.copilotModel,
        tenantId: input.tenantId,
        ...(input.organizationId ? { organizationId: input.organizationId } : {})
      }
      const model = await this.commandBus.execute<CreateModelClientCommand<BaseChatModel>, BaseChatModel>(
        new CreateModelClientCommand<BaseChatModel>(copilotModel, {
          abortController: new AbortController(),
          usageCallback: () => undefined
        })
      )
      const message = await model.invoke([
        new HumanMessage({ content: [{ url: fileUrl }] })
      ])
      const text = normalizeCutTranscriptionContent(message.content)
      if (!text) throw new Error('Speech-to-text returned an empty transcription.')
      await this.captions.completeTranscriptionJob(scope, {
        projectId: input.projectId,
        jobId: input.jobId,
        text,
        duration: input.duration,
        model: `${input.copilotModel.copilotId}:${input.copilotModel.model}`,
        changeSummary: input.changeSummary
      })
    } catch (error) {
      const attempt = job.attemptsMade + 1
      const attempts = readAttempts(job.opts)
      await this.captions.failTranscriptionJob(scope, input.projectId, input.jobId, error, attempt < attempts, attempt)
      throw error
    }
  }
}

function requirePayload(value: CutTranscriptionQueueJobData) {
  if (!value?.jobId || !value.projectId || !value.tenantId || !value.xpertId || !value.fileReference?.filePath) {
    throw new Error('Cut transcription queue payload is incomplete.')
  }
  return value
}

function scopeFromPayload(input: CutTranscriptionQueueJobData): CutScope {
  return {
    tenantId: input.tenantId,
    organizationId: input.organizationId ?? null,
    workspaceId: input.workspaceId ?? null,
    projectId: input.platformProjectId ?? null,
    userId: input.userId ?? null,
    assistantId: input.assistantId ?? input.xpertId
  }
}

function readAttempts(options: Record<string, unknown> | undefined) {
  const value = options?.attempts
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1
}
