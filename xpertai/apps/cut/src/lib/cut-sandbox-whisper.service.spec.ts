import { createHash } from 'node:crypto'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES',
  SandboxJobsRuntimeCapability: { id: 'platform.sandbox.jobs' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))

import {
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { CutSandboxWhisperService } from './cut-sandbox-whisper.service.js'
import type { CutScope, CutTranscriptionQueueJobData } from './types.js'

describe('CutSandboxWhisperService', () => {
  it('runs the pinned offline Whisper Action from a seekable Workspace Reference', async () => {
    const reference = outputReference()
    const transcript = Buffer.from(JSON.stringify({
      contractVersion: '1',
      action: 'cut.transcribe-whisper',
      actionVersion: '1.0.0',
      model: 'Xenova/whisper-tiny',
      language: 'zh',
      device: 'wasm',
      duration: 2.5,
      text: '你好，Cut。',
      segments: [{ start: 0, end: 2.5, text: '你好，Cut。' }]
    }))
    const sandbox = {
      getActionHealth: jest.fn(async () => ({ available: true })),
      getJob: jest.fn(async () => ({ id: payload().jobId, progress: { progress: 0.5, stage: 'transcribing' } })),
      run: jest.fn(async () => ({
        id: payload().jobId,
        action: 'cut.transcribe-whisper',
        actionVersion: '1.0.0',
        status: 'succeeded',
        outputs: [{
          path: 'transcript.json',
          originalName: 'transcript.json',
          mimeType: 'application/json',
          size: transcript.length,
          sha256: sha256(transcript),
          reference
        }]
      }))
    }
    const files = {
      readBuffer: jest.fn(async () => ({ buffer: transcript })),
      deleteFile: jest.fn(async () => undefined)
    }
    const queue = { getExecutionPoolHealth: jest.fn(async () => ({ available: true })) }
    const capabilities = {
      get: jest.fn((capability: unknown) => capability === SandboxJobsRuntimeCapability ? sandbox : capability === WorkspaceFilesRuntimeCapability ? files : undefined)
    }
    const service = new CutSandboxWhisperService(capabilities as never, queue as never)
    await service.assertAvailable()
    const report = jest.fn(async () => undefined)
    const result = await service.transcribe(scope(), payload(), report)
    expect(result).toMatchObject({
      text: '你好，Cut。',
      duration: 2.5,
      model: 'Xenova/whisper-tiny',
      segments: [{ start: 0, end: 2.5, text: '你好，Cut。' }]
    })
    expect(sandbox.run).toHaveBeenCalledWith(expect.objectContaining({
      jobId: payload().jobId,
      action: 'cut.transcribe-whisper',
      actionVersion: '1.0.0',
      payload: expect.objectContaining({ model: 'Xenova/whisper-tiny', language: 'zh' }),
      files: [expect.objectContaining({ access: 'read-only-seekable', reference: payload().fileReference })]
    }))
    expect(report).toHaveBeenCalledWith('sandbox-starting', 5, payload().jobId)
    await service.deleteOutput(reference)
    expect(files.deleteFile).toHaveBeenCalledWith(reference)
  })
})

function scope(): CutScope {
  return {
    tenantId: 'tenant-a',
    organizationId: 'org-a',
    projectId: 'platform-project',
    userId: 'user-a',
    assistantId: 'assistant-a'
  }
}

function payload(): CutTranscriptionQueueJobData {
  return {
    jobId: '33333333-3333-4333-8333-333333333333',
    projectId: '11111111-1111-4111-8111-111111111111',
    mediaAssetId: '22222222-2222-4222-8222-222222222222',
    tenantId: 'tenant-a',
    organizationId: 'org-a',
    platformProjectId: 'platform-project',
    userId: 'user-a',
    assistantId: 'assistant-a',
    transcriptionMode: 'sandbox_whisper',
    xpertId: null,
    modelKey: 'Xenova/whisper-tiny',
    fileReference: {
      source: 'platform.workspace.files',
      tenantId: 'tenant-a',
      catalog: 'projects',
      projectId: 'platform-project',
      filePath: 'files/source.mov',
      workspacePath: '/workspace/files/source.mov'
    },
    originalName: 'source.mov',
    mimeType: 'video/quicktime',
    size: 1024,
    checksum: 'a'.repeat(64),
    duration: 2.5,
    language: 'zh',
    inputRevision: 3,
    changeSummary: 'Transcribed with bundled Sandbox Whisper.'
  }
}

function outputReference(): WorkspacePortableFileReference {
  return {
    source: 'platform.workspace.files',
    tenantId: 'tenant-a',
    catalog: 'projects',
    projectId: 'platform-project',
    filePath: 'files/transcript.json',
    workspacePath: '/workspace/files/transcript.json'
  }
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
