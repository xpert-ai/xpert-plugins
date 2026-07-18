import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
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
import type { FindOptionsWhere, Repository } from 'typeorm'
import {
  CUT_PLUGIN_NAME,
  CUT_TRANSCRIPTION_AUDIO_SANDBOX_ACTION,
  CUT_TRANSCRIPTION_AUDIO_SANDBOX_ACTION_VERSION
} from './constants.js'
import { CutMediaAsset } from './entities/index.js'
import type {
  CutScope,
  CutTranscriptionAudioProxy,
  CutTranscriptionQueueJobData
} from './types.js'

export const MAX_DIRECT_TRANSCRIPTION_BYTES = 250 * 1024 * 1024
const MAX_TRANSCRIPTION_AUDIO_PROXY_BYTES = 250 * 1024 * 1024
const SANDBOX_PROGRESS_POLL_INTERVAL_MS = 1_000

export type PreparedCutTranscriptionInput = {
  reference: WorkspacePortableFileReference
  originalName: string
  mimeType: string
  size: number
  checksum: string
  source: 'original' | 'audio-proxy'
}

type TranscriptionProgressReporter = (
  stage: 'preparing-audio' | 'using-audio-proxy',
  progress: number,
  sandboxJobId?: string
) => Promise<void>

type MediaScopedEntity = {
  tenantId: string
  organizationId?: string | null
}

@Injectable()
export class CutTranscriptionMediaService {
  private readonly logger = new Logger(CutTranscriptionMediaService.name)

  constructor(
    @InjectRepository(CutMediaAsset) private readonly media: Repository<CutMediaAsset>,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry,
    @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService
  ) {}

  async assertExecutionPoolAvailable(): Promise<void> {
    if (!this.queue) throw new ServiceUnavailableException('Managed Queue is unavailable for Cut audio preparation.')
    const pool = await this.queue.getExecutionPoolHealth({ executionPool: 'sandbox-browser' }).catch((error) => ({
      available: false,
      warning: messageOf(error)
    }))
    if (!pool.available) {
      throw new ServiceUnavailableException(`WORKER_UNAVAILABLE: ${pool.warning ?? 'No worker is consuming sandbox-browser.'}`)
    }
  }

  async prepare(
    scope: CutScope,
    input: CutTranscriptionQueueJobData,
    report: TranscriptionProgressReporter
  ): Promise<PreparedCutTranscriptionInput> {
    const asset = await this.media.findOne({
      where: mediaWhere<CutMediaAsset>(scope, { id: input.mediaAssetId, cutProjectId: input.projectId })
    })
    if (!asset) throw new Error('Cut transcription media is no longer available in the current tenant and organization.')
    if (asset.checksum !== input.checksum || asset.size !== input.size) {
      throw new Error('Cut transcription media changed after the task was queued.')
    }
    if (!requiresTranscriptionAudioProxy(asset)) {
      return {
        reference: asset.fileReference,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        size: asset.size,
        checksum: asset.checksum,
        source: 'original'
      }
    }

    const cached = await this.resolveCachedProxy(asset)
    if (cached) {
      await report('using-audio-proxy', 40)
      return preparedProxy(cached)
    }

    const sandbox = this.sandboxJobs()
    const health = await sandbox.getActionHealth({
      pluginName: CUT_PLUGIN_NAME,
      action: CUT_TRANSCRIPTION_AUDIO_SANDBOX_ACTION,
      actionVersion: CUT_TRANSCRIPTION_AUDIO_SANDBOX_ACTION_VERSION
    })
    if (!health.available) {
      throw new ServiceUnavailableException(
        `${health.reason ?? 'SANDBOX_ACTION_UNAVAILABLE'}: ${health.message ?? 'Cut transcription audio preparation is unavailable.'}`
      )
    }

    const sourcePath = `media/source.${mediaExtension(asset.originalName, asset.mimeType)}`
    const destination = transcriptionDestination(scope, input.projectId)
    await report('preparing-audio', 10, input.jobId)
    const stopProgressMonitor = this.startProgressMonitor(sandbox, input.jobId, report)
    const result = await sandbox.run({
      jobId: input.jobId,
      action: CUT_TRANSCRIPTION_AUDIO_SANDBOX_ACTION,
      actionVersion: CUT_TRANSCRIPTION_AUDIO_SANDBOX_ACTION_VERSION,
      idempotencyKey: `cut-stt-audio-proxy:${asset.id}:${asset.checksum}:wav-16k-mono-v1`,
      scope: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? null,
        userId: scope.userId ?? null,
        pluginName: CUT_PLUGIN_NAME,
        businessResourceType: 'cut-transcription-audio-proxy',
        businessResourceId: input.mediaAssetId
      },
      payload: {
        sourcePath: `/${sourcePath}`,
        sourceName: asset.originalName,
        sourceMimeType: asset.mimeType,
        sampleRate: 16_000,
        channels: 1
      },
      files: [{
        reference: asset.fileReference,
        targetPath: sourcePath,
        size: asset.size,
        sha256: asset.checksum,
        access: 'read-only-seekable'
      }],
      outputs: [{
        path: 'speech.wav',
        originalName: `speech-${asset.checksum.slice(0, 12)}.wav`,
        mimeType: 'audio/wav',
        destination: { ...destination, folder: `files/cut/${input.projectId}/transcription-proxies` }
      }],
      timeoutMs: 300_000
    }).finally(stopProgressMonitor)
    const output = requireOutput(result.outputs, 'speech.wav')
    if (output.size > MAX_TRANSCRIPTION_AUDIO_PROXY_BYTES) {
      throw new Error(
        `Cut transcription audio proxy exceeds ${MAX_TRANSCRIPTION_AUDIO_PROXY_BYTES} bytes; segmented transcription is required.`
      )
    }
    const proxy: CutTranscriptionAudioProxy = {
      sourceChecksum: asset.checksum,
      sourceSize: asset.size,
      reference: output.reference,
      originalName: output.originalName,
      mimeType: 'audio/wav',
      size: output.size,
      checksum: output.sha256,
      sampleRate: 16_000,
      channels: 1,
      action: result.action,
      actionVersion: result.actionVersion,
      createdAt: new Date().toISOString()
    }
    asset.transcriptionAudioProxy = proxy
    await this.media.save(asset)
    await report('using-audio-proxy', 40, result.id)
    this.logger.log(`cut.transcription.audio-proxy ${JSON.stringify({
      projectId: input.projectId,
      mediaAssetId: input.mediaAssetId,
      sourceBytes: asset.size,
      proxyBytes: output.size,
      sandboxJobId: result.id
    })}`)
    return preparedProxy(proxy)
  }

  async cancel(sandboxJobId: string): Promise<void> {
    await this.sandboxJobs().cancel({ jobId: sandboxJobId })
  }

  private async resolveCachedProxy(asset: CutMediaAsset): Promise<CutTranscriptionAudioProxy | null> {
    const proxy = asset.transcriptionAudioProxy
    if (!isMatchingProxy(proxy, asset)) return null
    const files = this.workspaceFiles()
    const resolved = await files.readBuffer(proxy.reference).catch(() => null)
    if (resolved && resolved.buffer.length === proxy.size && sha256(resolved.buffer) === proxy.checksum) return proxy
    asset.transcriptionAudioProxy = null
    await this.media.save(asset)
    return null
  }

  private startProgressMonitor(
    sandbox: SandboxJobsApi,
    jobId: string,
    report: TranscriptionProgressReporter
  ): () => Promise<void> {
    let stopped = false
    let pending = Promise.resolve()
    let lastProgress = -1
    const poll = async () => {
      if (stopped) return
      const snapshot = await sandbox.getJob({ jobId }).catch(() => null)
      const progress = snapshot?.progress?.progress
      if (typeof progress !== 'number' || !Number.isFinite(progress)) return
      const mapped = Math.min(39, Math.max(10, 10 + Math.round(progress * 29)))
      if (mapped === lastProgress) return
      lastProgress = mapped
      await report('preparing-audio', mapped, snapshot?.id ?? jobId)
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

export function requiresTranscriptionAudioProxy(asset: Pick<CutMediaAsset, 'mimeType' | 'size'>): boolean {
  return asset.mimeType.startsWith('video/') || asset.size > MAX_DIRECT_TRANSCRIPTION_BYTES
}

function isMatchingProxy(
  value: CutTranscriptionAudioProxy | null | undefined,
  asset: Pick<CutMediaAsset, 'checksum' | 'size'>
): value is CutTranscriptionAudioProxy {
  return Boolean(
    value &&
    value.sourceChecksum === asset.checksum &&
    value.sourceSize === asset.size &&
    value.mimeType === 'audio/wav' &&
    value.size > 0 &&
    value.size <= MAX_TRANSCRIPTION_AUDIO_PROXY_BYTES &&
    /^[a-f0-9]{64}$/i.test(value.checksum) &&
    value.reference?.source === 'platform.workspace.files'
  )
}

function preparedProxy(proxy: CutTranscriptionAudioProxy): PreparedCutTranscriptionInput {
  return {
    reference: proxy.reference,
    originalName: proxy.originalName,
    mimeType: proxy.mimeType,
    size: proxy.size,
    checksum: proxy.checksum,
    source: 'audio-proxy'
  }
}

function requireOutput(outputs: SandboxJobOutput[], path: string): SandboxJobOutput {
  const output = outputs.find((candidate) => candidate.path === path)
  if (!output) throw new Error(`Cut audio preparation did not return ${path}.`)
  return output
}

function mediaWhere<T extends MediaScopedEntity>(scope: CutScope, where: Partial<T>): FindOptionsWhere<T> {
  return {
    ...where,
    tenantId: scope.tenantId,
    organizationId: (scope.organizationId ?? null) as T['organizationId']
  } as FindOptionsWhere<T>
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
