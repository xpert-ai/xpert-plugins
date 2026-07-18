import { env, pipeline } from '@huggingface/transformers'
import {
  ALL_FORMATS,
  BufferTarget,
  Conversion,
  Input,
  Output,
  UrlSource,
  WavOutputFormat
} from 'mediabunny'
import {
  coalesceCutTranscriptSegments,
  createCutAudioWindows,
  normalizeCutWhisperWindow,
  type CutLocalTranscriptSegment,
  type CutWhisperChunk
} from '../../src/lib/remote-components/cut-workbench/src/cut-local-transcription-model'

declare const __CUT_ORT_WASM_BINARY_DATA_URL__: string
declare const __CUT_ORT_WASM_FACTORY_DATA_URL__: string

type SandboxWhisperState = {
  state: 'starting' | 'decoding-audio' | 'loading-model' | 'transcribing' | 'complete' | 'failed'
  progress: number
  current?: number
  total?: number
  message?: string
  error?: string
  result?: SandboxWhisperResult
}

type SandboxWhisperRequest = {
  payload: {
    sourcePath: string
    sourceName: string
    sourceMimeType: string
    model: 'Xenova/whisper-tiny'
    language: string
  }
}

type SandboxWhisperResult = {
  contractVersion: '1'
  action: 'cut.transcribe-whisper'
  actionVersion: '1.0.0'
  model: 'Xenova/whisper-tiny'
  language: string
  device: 'wasm'
  duration: number
  text: string
  segments: CutLocalTranscriptSegment[]
}

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>

declare global {
  interface Window {
    __cutSandboxWhisperState?: SandboxWhisperState
  }
}

configureOnnxRuntime()

void main().catch((error) => {
  window.__cutSandboxWhisperState = {
    state: 'failed',
    progress: window.__cutSandboxWhisperState?.progress ?? 0,
    error: error instanceof Error ? error.message : String(error)
  }
})

async function main() {
  setState('starting', 0, 'Reading transcription request…')
  const request = await fetch('/request.json', { cache: 'no-store' }).then(async (response) => {
    if (!response.ok) throw new Error(`SANDBOX_WHISPER_INPUT_INVALID: request.json returned HTTP ${response.status}.`)
    return response.json() as Promise<SandboxWhisperRequest>
  })
  if (request.payload.model !== 'Xenova/whisper-tiny') {
    throw new Error('SANDBOX_WHISPER_INPUT_INVALID: only the bundled Xenova/whisper-tiny model is available.')
  }

  const audio = await decodeAudio(request.payload.sourcePath)
  const duration = audio.length / 16_000
  setState('loading-model', 0.2, 'Loading bundled Whisper model…')
  const transcriber = await pipeline('automatic-speech-recognition', request.payload.model, {
    device: 'wasm',
    dtype: 'q4',
    local_files_only: true,
    progress_callback: (update: unknown) => {
      const record = isRecord(update) ? update : {}
      const raw = typeof record.progress === 'number' ? record.progress : 0
      const ratio = Math.min(1, Math.max(0, raw > 1 ? raw / 100 : raw))
      setState('loading-model', 0.2 + ratio * 0.35, typeof record.status === 'string'
        ? `Whisper model ${record.status}…`
        : 'Loading bundled Whisper model…')
    }
  }) as unknown as Transcriber

  const windows = createCutAudioWindows(audio.length, 16_000)
  const segments: CutLocalTranscriptSegment[] = []
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index]!
    setState('transcribing', 0.55 + index / windows.length * 0.43, `Transcribing chunk ${index + 1} of ${windows.length}…`, index, windows.length)
    const result = await transcriber(audio.subarray(window.startFrame, window.endFrame), {
      return_timestamps: true,
      task: 'transcribe',
      ...(isAutomaticLanguage(request.payload.language) ? {} : { language: request.payload.language })
    })
    const output = isRecord(result) ? result : {}
    const chunks = Array.isArray(output.chunks)
      ? output.chunks.filter(isRecord).map((chunk) => ({
        timestamp: Array.isArray(chunk.timestamp)
          ? [numberOrNull(chunk.timestamp[0]), numberOrNull(chunk.timestamp[1])] as [number | null, number | null]
          : undefined,
        text: typeof chunk.text === 'string' ? chunk.text : undefined
      } satisfies CutWhisperChunk))
      : undefined
    segments.push(...normalizeCutWhisperWindow(
      chunks,
      typeof output.text === 'string' ? output.text : '',
      window,
      16_000,
      duration
    ))
  }

  const normalized = coalesceCutTranscriptSegments(segments)
  if (!normalized.length) throw new Error('SANDBOX_WHISPER_MEDIA_FAILED: Whisper produced no speech segments for this media.')
  const result: SandboxWhisperResult = {
    contractVersion: '1',
    action: 'cut.transcribe-whisper',
    actionVersion: '1.0.0',
    model: request.payload.model,
    language: request.payload.language,
    device: 'wasm',
    duration,
    text: normalized.map((segment) => segment.text).join(' '),
    segments: normalized
  }
  window.__cutSandboxWhisperState = {
    state: 'complete',
    progress: 1,
    current: windows.length,
    total: windows.length,
    message: 'Sandbox Whisper transcription complete.',
    result
  }
}

async function decodeAudio(sourcePath: string): Promise<Float32Array> {
  const input = new Input({
    source: new UrlSource(sourcePath, {
      requestInit: { cache: 'no-store' },
      maxCacheSize: 32 * 1024 * 1024
    }),
    formats: ALL_FORMATS
  })
  try {
    const audioTrack = await input.getPrimaryAudioTrack()
    if (!audioTrack) throw new Error('SANDBOX_WHISPER_MEDIA_FAILED: source media has no decodable audio track.')
    const target = new BufferTarget()
    const output = new Output({ format: new WavOutputFormat(), target })
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: (_track, index) => index === 1 ? {
        codec: 'pcm-s16',
        sampleRate: 16_000,
        numberOfChannels: 1,
        forceTranscode: true
      } : { discard: true },
      showWarnings: false
    })
    if (!conversion.isValid) {
      throw new Error(`SANDBOX_WHISPER_MEDIA_FAILED: ${conversion.discardedTracks.map((item) => item.reason).join('; ') || 'audio conversion is invalid'}.`)
    }
    conversion.onProgress = (progress) => setState('decoding-audio', Math.min(0.19, clamp(progress) * 0.19), 'Decoding 16 kHz mono audio…')
    setState('decoding-audio', 0.01, 'Decoding 16 kHz mono audio…')
    await conversion.execute()
    if (!target.buffer || target.buffer.byteLength <= 44) {
      throw new Error('SANDBOX_WHISPER_MEDIA_FAILED: decoded audio is empty.')
    }
    if (target.buffer.byteLength > 250 * 1024 * 1024) {
      throw new Error('SANDBOX_WHISPER_RESOURCE_LIMIT: decoded audio exceeds 250 MiB; segmented transcription is required.')
    }
    return parsePcm16Wav(target.buffer)
  } finally {
    input.dispose()
  }
}

function parsePcm16Wav(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer)
  if (buffer.byteLength < 44 || ascii(view, 0, 4) !== 'RIFF' || ascii(view, 8, 4) !== 'WAVE') {
    throw new Error('SANDBOX_WHISPER_MEDIA_FAILED: decoded WAVE header is invalid.')
  }
  let format: { codec: number; channels: number; sampleRate: number; bits: number } | null = null
  let dataOffset = -1
  let dataLength = 0
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const id = ascii(view, offset, 4)
    const length = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (body + length > view.byteLength) break
    if (id === 'fmt ' && length >= 16) {
      format = {
        codec: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true)
      }
    } else if (id === 'data') {
      dataOffset = body
      dataLength = length
      break
    }
    offset = body + length + (length % 2)
  }
  if (!format || format.codec !== 1 || format.channels !== 1 || format.sampleRate !== 16_000 || format.bits !== 16 || dataOffset < 0) {
    throw new Error('SANDBOX_WHISPER_MEDIA_FAILED: decoded audio is not 16 kHz mono PCM16.')
  }
  const samples = new Float32Array(Math.floor(dataLength / 2))
  for (let index = 0; index < samples.length; index += 1) samples[index] = view.getInt16(dataOffset + index * 2, true) / 32_768
  return samples
}

function configureOnnxRuntime() {
  const wasm = env.backends.onnx.wasm as typeof env.backends.onnx.wasm & {
    wasmPaths?: { wasm: string; mjs: string }
    numThreads?: number
    wasmBinary?: ArrayBuffer
  }
  wasm.wasmBinary = decodeBase64DataUrl(__CUT_ORT_WASM_BINARY_DATA_URL__).buffer as ArrayBuffer
  wasm.wasmPaths = {
    wasm: __CUT_ORT_WASM_BINARY_DATA_URL__,
    mjs: URL.createObjectURL(new Blob([decodeBase64DataUrl(__CUT_ORT_WASM_FACTORY_DATA_URL__)], { type: 'text/javascript' }))
  }
  wasm.numThreads = 1
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = '/models/'
  env.useBrowserCache = false
  env.useWasmCache = false
}

function setState(
  state: SandboxWhisperState['state'],
  progress: number,
  message: string,
  current?: number,
  total?: number
) {
  window.__cutSandboxWhisperState = {
    state,
    progress: clamp(progress),
    message,
    ...(typeof current === 'number' ? { current } : {}),
    ...(typeof total === 'number' ? { total } : {})
  }
}

function decodeBase64DataUrl(value: string) {
  const separator = value.indexOf(',')
  if (separator < 0) throw new Error('SANDBOX_WHISPER_START_FAILED: embedded ONNX Runtime asset is invalid.')
  const binary = atob(value.slice(separator + 1))
  const output = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index)
  return output
}

function ascii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join('')
}

function isAutomaticLanguage(value: string): boolean {
  return value === 'auto' || value === 'und'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}
