import { Inject, Injectable, Optional } from '@nestjs/common'
import { createHash } from 'node:crypto'
import {
  PluginJobProcessor,
  SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  isSandboxJobRuntimeError,
  type ManagedQueueJob,
  type ManagedQueueJobProcessor,
  type PluginContext,
  type RuntimeCapabilityRegistry,
  type SpeechToTextPermissionService
} from '@xpert-ai/plugin-sdk'
import { CUT_ANALYSIS_QUEUE_NAME, CUT_PLUGIN_NAME, CUT_TRANSCRIPTION_JOB_NAME } from './constants.js'
import { CutCaptionService } from './cut-caption.service.js'
import { CutTranscriptionMediaService } from './cut-transcription-media.service.js'
import { CutSandboxWhisperService } from './cut-sandbox-whisper.service.js'
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
    private readonly transcriptionMedia: CutTranscriptionMediaService,
    private readonly sandboxWhisper: CutSandboxWhisperService,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry
  ) {}

  async handle(job: ManagedQueueJob<CutTranscriptionQueueJobData>) {
    const input = requirePayload(job.data)
    const scope = scopeFromPayload(input)
    const claimed = await this.captions.beginTranscriptionJob(scope, input.projectId, input.jobId)
    if (!claimed) return
    try {
      if ((input.transcriptionMode ?? 'platform') === 'sandbox_whisper') {
        const result = await this.sandboxWhisper.transcribe(scope, input, async (stage, progress, sandboxJobId) => {
          await this.captions.updateTranscriptionJobProgress(
            scope,
            input.projectId,
            input.jobId,
            stage,
            progress,
            sandboxJobId
          )
        })
        await this.captions.updateTranscriptionJobProgress(scope, input.projectId, input.jobId, 'finalizing-transcript', 90)
        await this.captions.completeTranscriptionJob(scope, {
          projectId: input.projectId,
          jobId: input.jobId,
          text: result.text,
          segments: result.segments,
          duration: result.duration,
          model: input.modelKey,
          changeSummary: input.changeSummary
        })
        await this.sandboxWhisper.deleteOutput(result.outputReference)
        return
      }
      const files = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
      if (!files) throw new Error('Workspace Files capability is unavailable for Cut transcription.')
      const prepared = await this.transcriptionMedia.prepare(scope, input, async (stage, progress, sandboxJobId) => {
        await this.captions.updateTranscriptionJobProgress(
          scope,
          input.projectId,
          input.jobId,
          stage,
          progress,
          sandboxJobId
        )
      })
      await this.captions.updateTranscriptionJobProgress(scope, input.projectId, input.jobId, 'loading-audio', 45)
      const file = await files.readBuffer(prepared.reference)
      if (file.buffer.length !== prepared.size || sha256(file.buffer) !== prepared.checksum) {
        throw new Error('Cut transcription input changed after audio preparation.')
      }
      await this.captions.updateTranscriptionJobProgress(scope, input.projectId, input.jobId, 'transcribing', 55)
      const result = await this.speechToText.transcribe({
        xpertId: input.xpertId!,
        tenantId: input.tenantId,
        organizationId: input.organizationId ?? null,
        file: {
          data: file.buffer,
          originalName: prepared.originalName,
          mimeType: prepared.mimeType,
          size: file.buffer.length
        }
      })
      const text = normalizeCutTranscriptionContent(result.text)
      if (!text) throw new Error('Speech-to-text returned an empty transcription.')
      await this.captions.updateTranscriptionJobProgress(scope, input.projectId, input.jobId, 'finalizing-transcript', 90)
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
      const willRetry = attempt < attempts && (!isSandboxJobRuntimeError(error) || error.retryable)
      const failed = await this.captions.failTranscriptionJob(scope, input.projectId, input.jobId, error, willRetry, attempt)
      if (failed.status === 'cancelled') return
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
    !value.modelKey ||
    !value.originalName ||
    !value.mimeType ||
    !Number.isSafeInteger(value.size) ||
    value.size <= 0 ||
    !/^[a-f0-9]{64}$/i.test(value.checksum) ||
    !value.fileReference?.filePath
  ) {
    throw new Error('Cut transcription queue payload is incomplete.')
  }
  const mode = value.transcriptionMode ?? 'platform'
  if (mode !== 'platform' && mode !== 'sandbox_whisper') {
    throw new Error('Cut transcription queue payload has an invalid transcription mode.')
  }
  if (mode === 'platform' && !value.xpertId) {
    throw new Error('Cut platform transcription queue payload has no Xpert id.')
  }
  return value
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function scopeFromPayload(input: CutTranscriptionQueueJobData): CutScope {
  return {
    tenantId: input.tenantId,
    organizationId: input.organizationId ?? null,
    workspaceId: input.workspaceId ?? null,
    projectId: input.platformProjectId ?? null,
    userId: input.userId ?? null,
    assistantId: input.assistantId ?? input.xpertId ?? null
  }
}

function readAttempts(options: Record<string, unknown> | undefined) {
  const value = options?.attempts
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1
}
