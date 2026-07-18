jest.mock('@xpert-ai/plugin-sdk', () => ({
  PluginJobProcessor: () => (target: object) => target,
  SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_SPEECH_TO_TEXT_PERMISSION_SERVICE',
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES'
}))
jest.mock('./cut-caption.service.js', () => ({ CutCaptionService: class CutCaptionService {} }))

import { CutTranscriptionProcessor } from './cut-transcription.processor.js'
import type { CutCaptionService } from './cut-caption.service.js'
import type { CutTranscriptionQueueJobData } from './types.js'

describe('CutTranscriptionProcessor', () => {
  it('uses the guarded speech-to-text plugin service and completes a queued transcription', async () => {
    const captions = {
      beginTranscriptionJob: jest.fn(async () => ({ status: 'running' })),
      completeTranscriptionJob: jest.fn(async () => ({ success: true })),
      failTranscriptionJob: jest.fn()
    }
    const speechToText = { transcribe: jest.fn(async () => ({ text: 'Hello from STT.' })) }
    const pluginContext = { resolve: jest.fn(() => speechToText) }
    const files = { readBuffer: jest.fn(async () => ({ buffer: Buffer.from('media-bytes') })) }
    const capabilities = { get: jest.fn(() => files) }
    const processor = new CutTranscriptionProcessor(
      captions as unknown as CutCaptionService,
      pluginContext as never,
      capabilities as never
    )
    await processor.handle({ name: 'transcribe-media', data: payload(), attemptsMade: 0, opts: { attempts: 3 } })
    expect(pluginContext.resolve).toHaveBeenCalledWith('XPERT_PLUGIN_SPEECH_TO_TEXT_PERMISSION_SERVICE')
    expect(speechToText.transcribe).toHaveBeenCalledWith({
      xpertId: 'xpert-cut',
      tenantId: 'tenant-a',
      organizationId: 'org-a',
      file: {
        data: Buffer.from('media-bytes'),
        originalName: 'voice.mp4',
        mimeType: 'video/mp4',
        size: Buffer.byteLength('media-bytes')
      }
    })
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
    const speechToText = { transcribe: jest.fn(async () => { throw new Error('provider unavailable') }) }
    const files = { readBuffer: jest.fn(async () => ({ buffer: Buffer.from('media-bytes') })) }
    const processor = new CutTranscriptionProcessor(
      captions as unknown as CutCaptionService,
      { resolve: () => speechToText } as never,
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
    modelKey: 'copilot-stt:whisper-large-v3',
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
