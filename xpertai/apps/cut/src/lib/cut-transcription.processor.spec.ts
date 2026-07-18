import { createHash } from 'node:crypto'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  PluginJobProcessor: () => (target: object) => target,
  SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_SPEECH_TO_TEXT_PERMISSION_SERVICE',
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES',
  isSandboxJobRuntimeError: () => false
}))
jest.mock('./cut-caption.service.js', () => ({ CutCaptionService: class CutCaptionService {} }))

import { CutTranscriptionProcessor } from './cut-transcription.processor.js'
import type { CutCaptionService } from './cut-caption.service.js'
import type { CutTranscriptionMediaService } from './cut-transcription-media.service.js'
import type { CutSandboxWhisperService } from './cut-sandbox-whisper.service.js'
import type { CutTranscriptionQueueJobData } from './types.js'

const preparedBytes = Buffer.from('prepared-audio-bytes')
const preparedReference = {
  source: 'platform.workspace.files' as const,
  tenantId: 'tenant-a',
  catalog: 'projects' as const,
  projectId: 'platform-project',
  filePath: 'files/speech.wav',
  workspacePath: '/workspace/files/speech.wav'
}

describe('CutTranscriptionProcessor', () => {
  it('prepares bounded speech audio, reports stages, and completes a queued transcription', async () => {
    const captions = {
      beginTranscriptionJob: jest.fn(async () => ({ status: 'running' })),
      updateTranscriptionJobProgress: jest.fn(async () => ({ status: 'running' })),
      completeTranscriptionJob: jest.fn(async () => ({ success: true })),
      failTranscriptionJob: jest.fn()
    }
    const speechToText = { transcribe: jest.fn(async () => ({ text: 'Hello from STT.' })) }
    const pluginContext = { resolve: jest.fn(() => speechToText) }
    const files = { readBuffer: jest.fn(async () => ({ buffer: preparedBytes })) }
    const capabilities = { get: jest.fn(() => files) }
    const transcriptionMedia = preparedMediaService()
    const processor = new CutTranscriptionProcessor(
      captions as unknown as CutCaptionService,
      pluginContext as never,
      transcriptionMedia,
      sandboxWhisperService(),
      capabilities as never
    )
    await processor.handle({ name: 'transcribe-media', data: payload(), attemptsMade: 0, opts: { attempts: 3 } })
    expect(transcriptionMedia.prepare).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a' }), payload(), expect.any(Function))
    expect(files.readBuffer).toHaveBeenCalledWith(preparedReference)
    expect(pluginContext.resolve).toHaveBeenCalledWith('XPERT_PLUGIN_SPEECH_TO_TEXT_PERMISSION_SERVICE')
    expect(speechToText.transcribe).toHaveBeenCalledWith({
      xpertId: 'xpert-cut',
      tenantId: 'tenant-a',
      organizationId: 'org-a',
      file: {
        data: preparedBytes,
        originalName: 'speech.wav',
        mimeType: 'audio/wav',
        size: preparedBytes.length
      }
    })
    expect(captions.updateTranscriptionJobProgress.mock.calls.map((call: unknown[]) => call[3])).toEqual([
      'loading-audio', 'transcribing', 'finalizing-transcript'
    ])
    expect(captions.completeTranscriptionJob).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      text: 'Hello from STT.',
      model: 'copilot-stt:whisper-large-v3'
    }))
    expect(captions.failTranscriptionJob).not.toHaveBeenCalled()
  })

  it('records retryable failure state and rethrows for Managed Queue backoff', async () => {
    const captions = {
      beginTranscriptionJob: jest.fn(async () => ({ status: 'running' })),
      updateTranscriptionJobProgress: jest.fn(async () => ({ status: 'running' })),
      completeTranscriptionJob: jest.fn(),
      failTranscriptionJob: jest.fn(async () => ({ status: 'queued' }))
    }
    const speechToText = { transcribe: jest.fn(async () => { throw new Error('provider unavailable') }) }
    const files = { readBuffer: jest.fn(async () => ({ buffer: preparedBytes })) }
    const processor = new CutTranscriptionProcessor(
      captions as unknown as CutCaptionService,
      { resolve: () => speechToText } as never,
      preparedMediaService(),
      sandboxWhisperService(),
      { get: () => files } as never
    )
    await expect(processor.handle({ name: 'transcribe-media', data: payload(), attemptsMade: 0, opts: { attempts: 3 } }))
      .rejects.toThrow('provider unavailable')
    expect(captions.failTranscriptionJob).toHaveBeenCalledWith(expect.any(Object), payload().projectId, payload().jobId, expect.any(Error), true, 1)
  })

  it('runs bundled Sandbox Whisper without resolving the platform speech-to-text principal', async () => {
    const captions = {
      beginTranscriptionJob: jest.fn(async () => ({ status: 'running' })),
      updateTranscriptionJobProgress: jest.fn(async () => ({ status: 'running' })),
      completeTranscriptionJob: jest.fn(async () => ({ success: true })),
      failTranscriptionJob: jest.fn()
    }
    const outputReference = {
      source: 'platform.workspace.files' as const,
      tenantId: 'tenant-a',
      catalog: 'projects' as const,
      projectId: 'platform-project',
      filePath: 'files/transcript.json',
      workspacePath: '/workspace/files/transcript.json'
    }
    const sandboxWhisper = {
      transcribe: jest.fn(async (_scope, input, report) => {
        await report('loading-model', 40, input.jobId)
        await report('transcribing', 80, input.jobId)
        return {
          text: 'Hello from Sandbox Whisper.',
          duration: 2,
          model: 'Xenova/whisper-tiny',
          language: 'en',
          segments: [{ start: 0, end: 2, text: 'Hello from Sandbox Whisper.' }],
          outputReference
        }
      }),
      deleteOutput: jest.fn(async () => undefined)
    }
    const pluginContext = { resolve: jest.fn() }
    const processor = new CutTranscriptionProcessor(
      captions as unknown as CutCaptionService,
      pluginContext as never,
      preparedMediaService(),
      sandboxWhisper as unknown as CutSandboxWhisperService,
      undefined
    )
    const sandboxPayload = {
      ...payload(),
      transcriptionMode: 'sandbox_whisper' as const,
      xpertId: null,
      modelKey: 'Xenova/whisper-tiny'
    }
    await processor.handle({ name: 'transcribe-media', data: sandboxPayload, attemptsMade: 0, opts: { attempts: 3 } })
    expect(pluginContext.resolve).not.toHaveBeenCalled()
    expect(captions.completeTranscriptionJob).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      text: 'Hello from Sandbox Whisper.',
      model: 'Xenova/whisper-tiny',
      segments: [{ start: 0, end: 2, text: 'Hello from Sandbox Whisper.' }]
    }))
    expect(sandboxWhisper.deleteOutput).toHaveBeenCalledWith(outputReference)
  })
})

function sandboxWhisperService(): CutSandboxWhisperService {
  return {
    transcribe: jest.fn(),
    deleteOutput: jest.fn()
  } as unknown as CutSandboxWhisperService
}

function preparedMediaService(): CutTranscriptionMediaService {
  return {
    prepare: jest.fn(async () => ({
      reference: preparedReference,
      originalName: 'speech.wav',
      mimeType: 'audio/wav',
      size: preparedBytes.length,
      checksum: sha256(preparedBytes),
      source: 'audio-proxy'
    }))
  } as unknown as CutTranscriptionMediaService
}

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
    size: 300 * 1024 * 1024,
    checksum: 'a'.repeat(64),
    duration: 10,
    language: 'en',
    inputRevision: 3,
    changeSummary: 'Transcribed the interview.'
  }
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
