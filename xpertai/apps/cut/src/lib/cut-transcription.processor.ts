import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  PluginJobProcessor,
  SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueJob,
  type ManagedQueueJobProcessor,
  type PluginContext,
  type RuntimeCapabilityRegistry,
  type SpeechToTextPermissionService
} from '@xpert-ai/plugin-sdk'
import { CUT_ANALYSIS_QUEUE_NAME, CUT_PLUGIN_NAME, CUT_TRANSCRIPTION_JOB_NAME } from './constants.js'
import { CutCaptionService } from './cut-caption.service.js'
import { normalizeCutTranscriptionContent } from './cut-transcription.js'
import type { CutScope, CutTranscriptionQueueJobData } from './types.js'
import { CUT_PLUGIN_CONTEXT } from './tokens.js'

@Injectable()
@PluginJobProcessor({
  pluginName: CUT_PLUGIN_NAME,
  queueName: CUT_ANALYSIS_QUEUE_NAME,
  jobName: CUT_TRANSCRIPTION_JOB_NAME,
  concurrency: 2
})
export class CutTranscriptionProcessor implements ManagedQueueJobProcessor<CutTranscriptionQueueJobData> {
  private speechToTextService?: SpeechToTextPermissionService

  constructor(
    private readonly captions: CutCaptionService,
    @Inject(CUT_PLUGIN_CONTEXT) private readonly pluginContext: PluginContext,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry
  ) {}

  async handle(job: ManagedQueueJob<CutTranscriptionQueueJobData>) {
    const input = requirePayload(job.data)
    const scope = scopeFromPayload(input)
    const claimed = await this.captions.beginTranscriptionJob(scope, input.projectId, input.jobId)
    if (!claimed) return
    try {
      const files = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
      if (!files) throw new Error('Workspace Files capability is unavailable for Cut transcription.')
      const file = await files.readBuffer(input.fileReference)
      const result = await this.speechToText.transcribe({
        xpertId: input.xpertId,
        tenantId: input.tenantId,
        organizationId: input.organizationId ?? null,
        file: {
          data: file.buffer,
          originalName: input.originalName,
          mimeType: input.mimeType,
          size: file.buffer.length
        }
      })
      const text = normalizeCutTranscriptionContent(result.text)
      if (!text) throw new Error('Speech-to-text returned an empty transcription.')
      await this.captions.completeTranscriptionJob(scope, {
        projectId: input.projectId,
        jobId: input.jobId,
        text,
        duration: input.duration,
        model: input.modelKey,
        changeSummary: input.changeSummary
      })
    } catch (error) {
      const attempt = job.attemptsMade + 1
      const attempts = readAttempts(job.opts)
      await this.captions.failTranscriptionJob(scope, input.projectId, input.jobId, error, attempt < attempts, attempt)
      throw error
    }
  }

  private get speechToText(): SpeechToTextPermissionService {
    this.speechToTextService ??= this.pluginContext.resolve<SpeechToTextPermissionService>(
      SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN
    )
    return this.speechToTextService
  }
}

function requirePayload(value: CutTranscriptionQueueJobData) {
  if (
    !value?.jobId ||
    !value.projectId ||
    !value.tenantId ||
    !value.xpertId ||
    !value.modelKey ||
    !value.originalName ||
    !value.mimeType ||
    !value.fileReference?.filePath
  ) {
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
