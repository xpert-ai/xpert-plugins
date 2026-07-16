import { env, pipeline } from '@huggingface/transformers'
import {
  coalesceCutTranscriptSegments,
  createCutAudioWindows,
  normalizeCutWhisperWindow,
  type CutLocalTranscriptSegment,
  type CutLocalTranscriptionDevice,
  type CutWhisperChunk
} from './cut-local-transcription-model'

declare const __CUT_ORT_WASM_BINARY_DATA_URL__: string
declare const __CUT_ORT_WASM_FACTORY_DATA_URL__: string

type WorkerRequest = {
  type: 'transcribe'
  requestId: string
  audio: Float32Array
  sampleRate: number
  model: string
  language: string
  preferWebGpu: boolean
}

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>
type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (message: unknown) => void
}

const scope = globalThis as unknown as WorkerScope
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
env.allowRemoteModels = true
env.allowLocalModels = false
env.useBrowserCache = true
// The runtime is bundled with the plugin and supplied directly to ORT; only model files use browser Cache API.
env.useWasmCache = false

scope.onmessage = (event) => {
  if (event.data?.type !== 'transcribe') return
  void transcribe(event.data).catch((error) => scope.postMessage({
    type: 'error',
    requestId: event.data.requestId,
    message: error instanceof Error ? error.message : String(error)
  }))
}

async function transcribe(request: WorkerRequest) {
  if (!(request.audio instanceof Float32Array) || !request.audio.length) throw new Error('Local transcription audio is empty.')
  if (request.sampleRate !== 16_000) throw new Error('Browser Whisper requires 16 kHz mono audio.')
  let modelProgress = 0
  const desiredDevice: CutLocalTranscriptionDevice = request.preferWebGpu && Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
    ? 'webgpu'
    : 'wasm'
  const load = async (device: CutLocalTranscriptionDevice) => pipeline('automatic-speech-recognition', request.model, {
    device,
    dtype: device === 'wasm' ? 'q4' : 'fp32',
    progress_callback: (update: unknown) => {
      const record = isRecord(update) ? update : {}
      const raw = typeof record.progress === 'number' ? record.progress : 0
      modelProgress = Math.max(modelProgress, raw <= 1 ? raw * 100 : raw)
      scope.postMessage({
        type: 'progress',
        requestId: request.requestId,
        phase: 'model',
        progress: Math.min(64, Math.round(12 + modelProgress * 0.52)),
        message: typeof record.status === 'string' ? `Model ${record.status}…` : 'Loading Whisper model…',
        file: typeof record.file === 'string' ? record.file : undefined,
        device
      })
    }
  }) as unknown as Promise<Transcriber>

  let device = desiredDevice
  let transcriber: Transcriber
  try {
    transcriber = await load(device)
  } catch (error) {
    if (device !== 'webgpu') throw error
    device = 'wasm'
    scope.postMessage({
      type: 'progress', requestId: request.requestId, phase: 'model', progress: 12,
      message: 'WebGPU unavailable for this model; falling back to WASM.', device
    })
    transcriber = await load(device)
  }

  const duration = request.audio.length / request.sampleRate
  const windows = createCutAudioWindows(request.audio.length, request.sampleRate)
  const segments: CutLocalTranscriptSegment[] = []
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index]!
    scope.postMessage({
      type: 'progress', requestId: request.requestId, phase: 'transcribe',
      progress: Math.round(65 + index / windows.length * 34),
      message: `Transcribing chunk ${index + 1} of ${windows.length}…`, device
    })
    const result = await transcriber(request.audio.subarray(window.startFrame, window.endFrame), {
      return_timestamps: true,
      task: 'transcribe',
      ...(request.language === 'auto' ? {} : { language: request.language })
    })
    const output = isRecord(result) ? result : {}
    const chunks = Array.isArray(output.chunks) ? output.chunks.filter(isRecord).map((chunk) => ({
      timestamp: Array.isArray(chunk.timestamp) ? [numberOrNull(chunk.timestamp[0]), numberOrNull(chunk.timestamp[1])] as [number | null, number | null] : undefined,
      text: typeof chunk.text === 'string' ? chunk.text : undefined
    } satisfies CutWhisperChunk)) : undefined
    segments.push(...normalizeCutWhisperWindow(
      chunks,
      typeof output.text === 'string' ? output.text : '',
      window,
      request.sampleRate,
      duration
    ))
  }
  const normalized = coalesceCutTranscriptSegments(segments)
  if (!normalized.length) throw new Error('Whisper produced no speech segments for this media.')
  scope.postMessage({
    type: 'result',
    requestId: request.requestId,
    text: normalized.map((segment) => segment.text).join(' '),
    segments: normalized,
    duration,
    model: request.model,
    language: request.language,
    device
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function decodeBase64DataUrl(value: string) {
  const separator = value.indexOf(',')
  if (separator < 0) throw new Error('Embedded ONNX Runtime asset is invalid.')
  const binary = atob(value.slice(separator + 1))
  const output = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index)
  return output
}
