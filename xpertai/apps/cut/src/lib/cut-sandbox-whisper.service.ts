import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueService,
  type RuntimeCapabilityRegistry,
  type SandboxJobOutput,
  type SandboxJobsApi,
  type WorkspaceFileScope,
  type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import {
  CUT_PLUGIN_NAME,
  CUT_TRANSCRIPTION_WHISPER_MODEL,
  CUT_TRANSCRIPTION_WHISPER_SANDBOX_ACTION,
  CUT_TRANSCRIPTION_WHISPER_SANDBOX_ACTION_VERSION
} from './constants.js'
import type { CutScope, CutTranscriptSegmentData, CutTranscriptionQueueJobData } from './types.js'

const SANDBOX_PROGRESS_POLL_INTERVAL_MS = 1_000
const MAX_TRANSCRIPT_RESULT_BYTES = 10 * 1024 * 1024
const MAX_TRANSCRIPT_SEGMENTS = 5_000

type SandboxWhisperStage = 'sandbox-starting' | 'decoding-audio' | 'loading-model' | 'transcribing'

type SandboxWhisperProgressReporter = (
  stage: SandboxWhisperStage,
  progress: number,
  sandboxJobId?: string
) => Promise<void>

export type CutSandboxWhisperResult = {
  text: string
  duration: number
  model: typeof CUT_TRANSCRIPTION_WHISPER_MODEL
  language: string
  segments: Array<Pick<CutTranscriptSegmentData, 'start' | 'end' | 'text' | 'confidence' | 'speaker'>>
  outputReference: WorkspacePortableFileReference
}

@Injectable()
export class CutSandboxWhisperService {
  private readonly logger = new Logger(CutSandboxWhisperService.name)

  constructor(
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry,
    @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService
  ) {}

  async assertAvailable(): Promise<void> {
    if (!this.queue) throw new ServiceUnavailableException('Managed Queue is unavailable for Sandbox Whisper transcription.')
    const [pool, action] = await Promise.all([
      this.queue.getExecutionPoolHealth({ executionPool: 'sandbox-browser' }).catch((error) => ({
        available: false,
        warning: messageOf(error)
      })),
      this.sandboxJobs().getActionHealth({
        pluginName: CUT_PLUGIN_NAME,
        action: CUT_TRANSCRIPTION_WHISPER_SANDBOX_ACTION,
        actionVersion: CUT_TRANSCRIPTION_WHISPER_SANDBOX_ACTION_VERSION
      })
    ])
    if (!pool.available) {
      throw new ServiceUnavailableException(`WORKER_UNAVAILABLE: ${pool.warning ?? 'No worker is consuming sandbox-browser.'}`)
    }
    if (!action.available) {
      throw new ServiceUnavailableException(
        `${action.reason ?? 'SANDBOX_ACTION_UNAVAILABLE'}: ${action.message ?? 'Cut Sandbox Whisper is unavailable.'}`
      )
    }
  }

  async transcribe(
    scope: CutScope,
    input: CutTranscriptionQueueJobData,
    report: SandboxWhisperProgressReporter
  ): Promise<CutSandboxWhisperResult> {
    const sandbox = this.sandboxJobs()
    const sourcePath = `media/source.${mediaExtension(input.originalName, input.mimeType)}`
    const destination = transcriptionDestination(scope, input.projectId)
    await report('sandbox-starting', 5, input.jobId)
    const stopProgressMonitor = this.startProgressMonitor(sandbox, input.jobId, report)
    const result = await sandbox.run({
      jobId: input.jobId,
      action: CUT_TRANSCRIPTION_WHISPER_SANDBOX_ACTION,
      actionVersion: CUT_TRANSCRIPTION_WHISPER_SANDBOX_ACTION_VERSION,
      idempotencyKey: `cut-stt-sandbox-whisper:${input.mediaAssetId}:${input.checksum}:${input.language}:${CUT_TRANSCRIPTION_WHISPER_MODEL}:v1`,
      scope: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? null,
        userId: scope.userId ?? null,
        pluginName: CUT_PLUGIN_NAME,
        businessResourceType: 'cut-transcription',
        businessResourceId: input.jobId
      },
      payload: {
        sourcePath: `/${sourcePath}`,
        sourceName: input.originalName,
        sourceMimeType: input.mimeType,
        model: CUT_TRANSCRIPTION_WHISPER_MODEL,
        language: input.language
      },
      files: [{
        reference: input.fileReference,
        targetPath: sourcePath,
        size: input.size,
        sha256: input.checksum,
        access: 'read-only-seekable'
      }],
      outputs: [{
        path: 'transcript.json',
        originalName: `transcript-${input.checksum.slice(0, 12)}.json`,
        mimeType: 'application/json',
        destination: { ...destination, folder: `files/cut/${input.projectId}/transcription-results` }
      }],
      timeoutMs: 300_000
    }).finally(stopProgressMonitor)
    const output = requireOutput(result.outputs, 'transcript.json')
    if (output.size > MAX_TRANSCRIPT_RESULT_BYTES) {
      throw new Error(`Sandbox Whisper transcript exceeds ${MAX_TRANSCRIPT_RESULT_BYTES} bytes.`)
    }
    const file = await this.workspaceFiles().readBuffer(output.reference)
    if (file.buffer.length !== output.size || sha256(file.buffer) !== output.sha256) {
      throw new Error('Sandbox Whisper transcript changed after the Action completed.')
    }
    const parsed = parseResult(JSON.parse(file.buffer.toString('utf8')), input)
    this.logger.log(`cut.transcription.sandbox-whisper ${JSON.stringify({
      projectId: input.projectId,
      jobId: input.jobId,
      mediaAssetId: input.mediaAssetId,
      sandboxJobId: result.id,
      model: parsed.model,
      duration: parsed.duration,
      segmentCount: parsed.segments.length
    })}`)
    return { ...parsed, outputReference: output.reference }
  }

  async deleteOutput(reference: WorkspacePortableFileReference): Promise<void> {
    await this.workspaceFiles().deleteFile(reference).catch((error) => {
      this.logger.warn(`cut.transcription.sandbox-whisper.cleanup-failed ${JSON.stringify({ error: messageOf(error) })}`)
    })
  }

  private startProgressMonitor(
    sandbox: SandboxJobsApi,
    jobId: string,
    report: SandboxWhisperProgressReporter
  ): () => Promise<void> {
    let stopped = false
    let pending = Promise.resolve()
    let lastKey = ''
    const poll = async () => {
      if (stopped) return
      const snapshot = await sandbox.getJob({ jobId }).catch(() => null)
      const current = snapshot?.progress
      if (typeof current?.progress !== 'number' || !Number.isFinite(current.progress)) return
      const stage = normalizeStage(current.stage)
      const mapped = Math.min(88, Math.max(5, 5 + Math.round(current.progress * 83)))
      const key = `${stage}:${mapped}`
      if (key === lastKey) return
      lastKey = key
      await report(stage, mapped, snapshot?.id ?? jobId)
    }
    const schedule = () => {
      pending = pending.then(poll, poll)
      return pending
    }
    void schedule()
    const timer = setInterval(() => void schedule(), SANDBOX_PROGRESS_POLL_INTERVAL_MS)
    timer.unref()
    return async () => {
      clearInterval(timer)
      await schedule()
      stopped = true
    }
  }

  private sandboxJobs(): SandboxJobsApi {
    const sandbox = this.capabilities?.get(SandboxJobsRuntimeCapability)
    if (!sandbox) throw new ServiceUnavailableException('Platform Sandbox Jobs capability is unavailable for Cut transcription.')
    return sandbox
  }

  private workspaceFiles() {
    const files = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new ServiceUnavailableException('Workspace Files capability is unavailable for Cut transcription.')
    return files
  }
}

function parseResult(value: unknown, input: CutTranscriptionQueueJobData): Omit<CutSandboxWhisperResult, 'outputReference'> {
  if (!isRecord(value)) throw new Error('Sandbox Whisper result is not an object.')
  const duration = finiteNumber(value.duration)
  if (
    value.contractVersion !== '1' ||
    value.action !== CUT_TRANSCRIPTION_WHISPER_SANDBOX_ACTION ||
    value.actionVersion !== CUT_TRANSCRIPTION_WHISPER_SANDBOX_ACTION_VERSION ||
    value.model !== CUT_TRANSCRIPTION_WHISPER_MODEL ||
    value.language !== input.language ||
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    duration <= 0 ||
    !Array.isArray(value.segments) ||
    !value.segments.length ||
    value.segments.length > MAX_TRANSCRIPT_SEGMENTS
  ) {
    throw new Error('Sandbox Whisper result contract is incomplete or invalid.')
  }
  let previousStart = -1
  const segments = value.segments.map((segment, index) => {
    if (!isRecord(segment)) throw new Error(`Sandbox Whisper segment ${index + 1} is invalid.`)
    const start = finiteNumber(segment.start)
    const end = finiteNumber(segment.end)
    const text = typeof segment.text === 'string' ? segment.text.trim() : ''
    if (start < 0 || end <= start || end > duration + 0.5 || start < previousStart || !text || text.length > 4_000) {
      throw new Error(`Sandbox Whisper segment ${index + 1} is outside the accepted bounds.`)
    }
    previousStart = start
    return {
      start,
      end: Math.min(end, duration),
      text,
      ...(typeof segment.confidence === 'number' && Number.isFinite(segment.confidence)
        ? { confidence: Math.min(1, Math.max(0, segment.confidence)) }
        : {}),
      ...(typeof segment.speaker === 'string' && segment.speaker.trim()
        ? { speaker: segment.speaker.trim().slice(0, 160) }
        : {})
    }
  })
  return {
    text: value.text.trim(),
    duration,
    model: CUT_TRANSCRIPTION_WHISPER_MODEL,
    language: input.language,
    segments
  }
}

function normalizeStage(value: string | undefined): SandboxWhisperStage {
  if (value === 'decoding-audio' || value === 'loading-model' || value === 'transcribing') return value
  return 'sandbox-starting'
}

function requireOutput(outputs: SandboxJobOutput[], path: string): SandboxJobOutput {
  const output = outputs.find((candidate) => candidate.path === path)
  if (!output) throw new Error(`Sandbox Whisper did not return ${path}.`)
  return output
}

function transcriptionDestination(scope: CutScope, cutProjectId: string): WorkspaceFileScope {
  if (scope.projectId) {
    return {
      tenantId: scope.tenantId,
      userId: scope.userId,
      catalog: 'projects',
      scopeId: scope.projectId,
      projectId: scope.projectId
    }
  }
  const scopeId = scope.assistantId ?? cutProjectId
  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
    catalog: 'xperts',
    scopeId,
    xpertId: scopeId
  }
}

function mediaExtension(name: string, mimeType: string): string {
  const extension = name.normalize('NFKC').toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1]
  if (extension) return extension
  return ({
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac'
  } as Record<string, string>)[mimeType] ?? 'media'
}

function finiteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Sandbox Whisper result contains a non-finite time.')
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
