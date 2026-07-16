jest.mock('@xpert-ai/plugin-sdk', () => ({
  CreateModelClientCommand: class CreateModelClientCommand {
    constructor(readonly copilotModel: object, readonly options: object) {}
  },
  PluginJobProcessor: () => (target: object) => target,
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES'
}))
jest.mock('./cut-caption.service.js', () => ({ CutCaptionService: class CutCaptionService {} }))

import { CutTranscriptionProcessor } from './cut-transcription.processor.js'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import type { CutCaptionService } from './cut-caption.service.js'
import type { CutTranscriptionQueueJobData } from './types.js'

describe('CutTranscriptionProcessor', () => {
  it('uses the platform model command and completes a queued transcription', async () => {
    const captions = {
      beginTranscriptionJob: jest.fn(async () => ({ status: 'running' })),
      completeTranscriptionJob: jest.fn(async () => ({ success: true })),
      failTranscriptionJob: jest.fn()
    }
    const model = { invoke: jest.fn(async () => ({ content: [{ type: 'text', text: 'Hello from STT.' }] })) }
    const commandBus = { execute: jest.fn(async () => model) }
    const files = { readBuffer: jest.fn(async () => ({ fileUrl: 'https://files.example.test/voice.mp4' })) }
    const capabilities = { get: jest.fn(() => files) }
    const processor = new CutTranscriptionProcessor(
      captions as unknown as CutCaptionService,
      commandBus,
      capabilities as never
    )
    await processor.handle({ name: 'transcribe-media', data: payload(), attemptsMade: 0, opts: { attempts: 3 } })
    expect(commandBus.execute).toHaveBeenCalledTimes(1)
    expect(model.invoke).toHaveBeenCalledTimes(1)
    expect(captions.completeTranscriptionJob).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      text: 'Hello from STT.',
      model: 'copilot-stt:whisper-large-v3'
    }))
    expect(captions.failTranscriptionJob).not.toHaveBeenCalled()
  })

  it('records retryable failure state and rethrows for Managed Queue backoff', async () => {
    const captions = {
      beginTranscriptionJob: jest.fn(async () => ({ status: 'running' })),
      completeTranscriptionJob: jest.fn(),
      failTranscriptionJob: jest.fn(async () => ({ status: 'queued' }))
    }
    const commandBus = { execute: jest.fn(async () => { throw new Error('provider unavailable') }) }
    const files = { readBuffer: jest.fn(async () => ({ fileUrl: 'https://files.example.test/voice.mp4' })) }
    const processor = new CutTranscriptionProcessor(
      captions as unknown as CutCaptionService,
      commandBus,
      { get: () => files } as never
    )
    await expect(processor.handle({ name: 'transcribe-media', data: payload(), attemptsMade: 0, opts: { attempts: 3 } }))
      .rejects.toThrow('provider unavailable')
    expect(captions.failTranscriptionJob).toHaveBeenCalledWith(expect.any(Object), payload().projectId, payload().jobId, expect.any(Error), true, 1)
  })
})

function payload(): CutTranscriptionQueueJobData {
  return {
    jobId: '33333333-3333-4333-8333-333333333333',
    projectId: '11111111-1111-4111-8111-111111111111',
    mediaAssetId: '22222222-2222-4222-8222-222222222222',
    tenantId: 'tenant-a',
    organizationId: 'org-a',
    userId: 'user-a',
    assistantId: 'assistant-a',
    xpertId: 'xpert-cut',
    copilotModel: { copilotId: 'copilot-stt', model: 'whisper-large-v3', modelType: AiModelTypeEnum.SPEECH2TEXT },
    fileReference: {
      source: 'platform.workspace.files', tenantId: 'tenant-a', catalog: 'projects', projectId: 'platform-project',
      filePath: 'files/voice.mp4', workspacePath: '/workspace/files/voice.mp4'
    },
    originalName: 'voice.mp4',
    mimeType: 'video/mp4',
    duration: 10,
    language: 'en',
    inputRevision: 3,
    changeSummary: 'Transcribed the interview.'
  }
}
