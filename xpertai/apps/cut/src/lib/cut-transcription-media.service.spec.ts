import { createHash } from 'node:crypto'

jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => undefined }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  SandboxJobsRuntimeCapability: { id: 'platform.sandbox.jobs' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES'
}))

import { SandboxJobsRuntimeCapability, WorkspaceFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { CutTranscriptionMediaService, requiresTranscriptionAudioProxy } from './cut-transcription-media.service.js'
import type { CutMediaAsset } from './entities/index.js'
import type { CutScope, CutTranscriptionQueueJobData } from './types.js'

describe('CutTranscriptionMediaService', () => {
  it('keeps small audio on the direct Workspace reference path', async () => {
    const asset = mediaAsset({ mimeType: 'audio/wav', size: 1024 })
    const repository = mediaRepository(asset)
    const service = new CutTranscriptionMediaService(repository as never)
    await expect(service.prepare(scope(), payload(asset), jest.fn())).resolves.toMatchObject({
      source: 'original',
      reference: asset.fileReference,
      size: 1024
    })
    expect(requiresTranscriptionAudioProxy(asset)).toBe(false)
  })

  it('converts video through a seekable Sandbox input and reuses the verified audio proxy', async () => {
    const asset = mediaAsset({ mimeType: 'video/quicktime', size: 600 * 1024 * 1024, originalName: '佳能采访.MOV' })
    const repository = mediaRepository(asset)
    const proxyBytes = Buffer.from('RIFF-bounded-speech-proxy')
    const proxyChecksum = sha256(proxyBytes)
    const proxyReference = {
      ...asset.fileReference,
      filePath: 'files/cut/project-a/transcription-proxies/speech.wav',
      workspacePath: '/workspace/files/cut/project-a/transcription-proxies/speech.wav'
    }
    const sandbox = {
      getActionHealth: jest.fn(async () => ({ available: true })),
      getJob: jest.fn(async () => ({ id: 'sandbox-job', progress: { progress: 0.5 } })),
      run: jest.fn(async () => ({
        id: 'sandbox-job',
        action: 'cut.prepare-transcription-audio',
        actionVersion: '1.0.0',
        outputs: [{
          path: 'speech.wav', originalName: 'speech.wav', mimeType: 'audio/wav', size: proxyBytes.length,
          sha256: proxyChecksum, reference: proxyReference
        }]
      })),
      cancel: jest.fn()
    }
    const files = { readBuffer: jest.fn(async () => ({ buffer: proxyBytes })) }
    const capabilities = {
      get: jest.fn((key) => key === SandboxJobsRuntimeCapability ? sandbox : key === WorkspaceFilesRuntimeCapability ? files : undefined)
    }
    const service = new CutTranscriptionMediaService(repository as never, capabilities as never)
    const report = jest.fn(async () => undefined)

    await expect(service.prepare(scope(), payload(asset), report)).resolves.toMatchObject({
      source: 'audio-proxy', mimeType: 'audio/wav', size: proxyBytes.length, checksum: proxyChecksum
    })
    expect(sandbox.run).toHaveBeenCalledWith(expect.objectContaining({
      action: 'cut.prepare-transcription-audio',
      actionVersion: '1.0.0',
      files: [expect.objectContaining({
        reference: asset.fileReference,
        targetPath: 'media/source.mov',
        size: asset.size,
        access: 'read-only-seekable'
      })],
      outputs: [expect.objectContaining({ path: 'speech.wav', mimeType: 'audio/wav' })]
    }))
    expect(asset.transcriptionAudioProxy).toMatchObject({ sourceChecksum: asset.checksum, reference: proxyReference })
    expect(report).toHaveBeenCalledWith('using-audio-proxy', 40, 'sandbox-job')

    await service.prepare(scope(), payload(asset), report)
    expect(files.readBuffer).toHaveBeenCalledWith(proxyReference)
    expect(sandbox.run).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('using-audio-proxy', 40)
  })
})

function mediaRepository(asset: CutMediaAsset) {
  return {
    findOne: jest.fn(async () => asset),
    save: jest.fn(async (value: CutMediaAsset) => value)
  }
}

function mediaAsset(overrides: Partial<CutMediaAsset>): CutMediaAsset {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    tenantId: 'tenant-a',
    organizationId: 'org-a',
    cutProjectId: '11111111-1111-4111-8111-111111111111',
    originalName: 'voice.wav',
    mimeType: 'audio/wav',
    size: 1024,
    checksum: 'a'.repeat(64),
    fileReference: {
      source: 'platform.workspace.files', tenantId: 'tenant-a', catalog: 'projects', projectId: 'platform-project',
      filePath: 'files/voice.wav', workspacePath: '/workspace/files/voice.wav'
    },
    ...overrides
  } as CutMediaAsset
}

function scope(): CutScope {
  return { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', assistantId: 'assistant-a' }
}

function payload(asset: CutMediaAsset): CutTranscriptionQueueJobData {
  return {
    jobId: '33333333-3333-4333-8333-333333333333',
    projectId: asset.cutProjectId,
    mediaAssetId: asset.id!,
    tenantId: asset.tenantId,
    organizationId: asset.organizationId,
    userId: 'user-a',
    assistantId: 'assistant-a',
    xpertId: 'xpert-cut',
    modelKey: 'copilot-stt:whisper-large-v3',
    fileReference: asset.fileReference,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    size: asset.size,
    checksum: asset.checksum,
    duration: 10,
    language: 'en',
    inputRevision: 3,
    changeSummary: 'Transcribed the interview.'
  }
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
