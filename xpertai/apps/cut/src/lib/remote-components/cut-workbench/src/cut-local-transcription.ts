import {
  CUT_LOCAL_TRANSCRIPTION_SAMPLE_RATE,
  downmixCutAudio,
  resampleCutAudio,
  type CutLocalTranscriptSegment,
  type CutLocalTranscriptionDevice
} from './cut-local-transcription-model'

declare const __CUT_TRANSCRIPTION_WORKER_SOURCE__: string

export const CUT_LOCAL_TRANSCRIPTION_MODELS = [
  { id: 'Xenova/whisper-tiny', label: 'Whisper Tiny · multilingual' },
  { id: 'Xenova/whisper-tiny.en', label: 'Whisper Tiny · English' },
  { id: 'Xenova/whisper-base', label: 'Whisper Base · multilingual' },
  { id: 'Xenova/whisper-small', label: 'Whisper Small · multilingual' }
] as const

export const CUT_LOCAL_TRANSCRIPTION_LANGUAGES = [
  { id: 'auto', label: 'Auto detect' },
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' }
] as const

export type CutLocalTranscriptionProgress = {
  phase: 'audio' | 'model' | 'transcribe' | 'persist'
  progress: number
  message: string
  file?: string
  device?: CutLocalTranscriptionDevice
}

export type CutLocalTranscriptionResult = {
  text: string
  segments: CutLocalTranscriptSegment[]
  duration: number
  model: string
  language: string
  device: CutLocalTranscriptionDevice
}

type CutWorkerMessage =
  | ({ type: 'progress'; requestId: string } & CutLocalTranscriptionProgress)
  | ({ type: 'result'; requestId: string } & CutLocalTranscriptionResult)
  | { type: 'error'; requestId: string; message: string }

type CutWorkerLike = Pick<Worker, 'onmessage' | 'onerror' | 'postMessage' | 'terminate'>

type WorkerFactoryWindow = Window & {
  __XPERT_CUT_TRANSCRIPTION_WORKER_FACTORY__?: (source: string) => CutWorkerLike
}

export async function decodeCutLocalTranscriptionAudio(input: {
  url: string
  maxDuration: number
  signal?: AbortSignal
  onProgress?: (progress: CutLocalTranscriptionProgress) => void
}) {
  input.onProgress?.({ phase: 'audio', progress: 2, message: 'Fetching media audio…' })
  const response = await fetch(input.url, { signal: input.signal, credentials: 'include' })
  if (!response.ok) throw new Error(`Could not load media audio (HTTP ${response.status}).`)
  const encoded = await response.arrayBuffer()
  if (input.signal?.aborted) throw new DOMException('Local transcription cancelled.', 'AbortError')
  input.onProgress?.({ phase: 'audio', progress: 6, message: 'Decoding media audio…' })
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(encoded)
    const duration = Math.min(decoded.duration, input.maxDuration)
    const frameCount = Math.max(1, Math.min(decoded.length, Math.floor(duration * decoded.sampleRate)))
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index))
    const mono = downmixCutAudio(channels, frameCount)
    const audio = resampleCutAudio(mono, decoded.sampleRate, CUT_LOCAL_TRANSCRIPTION_SAMPLE_RATE)
    input.onProgress?.({ phase: 'audio', progress: 10, message: 'Audio ready for local transcription.' })
    return { audio, duration: audio.length / CUT_LOCAL_TRANSCRIPTION_SAMPLE_RATE, sourceSampleRate: decoded.sampleRate }
  } finally {
    await context.close().catch(() => undefined)
  }
}

export function createCutLocalTranscriptionTask(input: {
  audio: Float32Array
  model: string
  language: string
  preferWebGpu: boolean
  onProgress?: (progress: CutLocalTranscriptionProgress) => void
}) {
  const requestId = crypto.randomUUID()
  const worker = createWorker()
  let settled = false
  let rejectPromise: (error: Error) => void = () => undefined
  const cleanup = () => {
    worker.terminate()
    settled = true
  }
  const promise = new Promise<CutLocalTranscriptionResult>((resolve, reject) => {
    rejectPromise = reject
    worker.onmessage = (event: MessageEvent<CutWorkerMessage>) => {
      const message = event.data
      if (!message || message.requestId !== requestId) return
      if (message.type === 'progress') {
        const { type: _type, requestId: _requestId, ...progress } = message
        input.onProgress?.(progress)
        return
      }
      cleanup()
      if (message.type === 'error') reject(new Error(message.message))
      else {
        const { type: _type, requestId: _requestId, ...result } = message
        resolve(result)
      }
    }
    worker.onerror = (event) => {
      cleanup()
      reject(new Error(event.message || 'Browser Whisper worker failed.'))
    }
    worker.postMessage({
      type: 'transcribe',
      requestId,
      audio: input.audio,
      sampleRate: CUT_LOCAL_TRANSCRIPTION_SAMPLE_RATE,
      model: input.model,
      language: input.language,
      preferWebGpu: input.preferWebGpu
    }, [input.audio.buffer])
  })
  return {
    promise,
    cancel() {
      if (settled) return
      cleanup()
      rejectPromise(new DOMException('Local transcription cancelled.', 'AbortError'))
    }
  }
}

function createWorker(): CutWorkerLike {
  const source = cutTranscriptionWorkerSource()
  const factory = (window as WorkerFactoryWindow).__XPERT_CUT_TRANSCRIPTION_WORKER_FACTORY__
  if (factory) return factory(source)
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  const worker = new Worker(url)
  const terminate = worker.terminate.bind(worker)
  worker.terminate = () => {
    terminate()
    URL.revokeObjectURL(url)
  }
  return worker
}

function cutTranscriptionWorkerSource() {
  return __CUT_TRANSCRIPTION_WORKER_SOURCE__
}
