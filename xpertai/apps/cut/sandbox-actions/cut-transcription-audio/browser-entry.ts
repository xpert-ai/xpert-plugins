import {
  ALL_FORMATS,
  BufferTarget,
  Conversion,
  Input,
  Output,
  UrlSource,
  WavOutputFormat
} from 'mediabunny'

type AudioProxyState = {
  state: 'starting' | 'preparing-audio' | 'complete' | 'failed'
  progress: number
  error?: string
}

type AudioProxyRequest = {
  payload: {
    sourcePath: string
    sourceName: string
    sourceMimeType: string
    sampleRate: 16_000
    channels: 1
  }
}

declare global {
  interface Window {
    __cutAudioProxyState?: AudioProxyState
  }
}

void main().catch((error) => {
  window.__cutAudioProxyState = {
    state: 'failed',
    progress: window.__cutAudioProxyState?.progress ?? 0,
    error: error instanceof Error ? error.message : String(error)
  }
})

async function main() {
  setState('starting', 0)
  const request = await fetch('/request.json', { cache: 'no-store' }).then(async (response) => {
    if (!response.ok) throw new Error(`AUDIO_PROXY_INPUT_INVALID: request.json returned HTTP ${response.status}.`)
    return response.json() as Promise<AudioProxyRequest>
  })
  const input = new Input({
    source: new UrlSource(request.payload.sourcePath, {
      requestInit: { cache: 'no-store' },
      maxCacheSize: 32 * 1024 * 1024
    }),
    formats: ALL_FORMATS
  })
  try {
    const audioTrack = await input.getPrimaryAudioTrack()
    if (!audioTrack) throw new Error('AUDIO_PROXY_MEDIA_FAILED: source media has no decodable audio track.')
    const target = new BufferTarget()
    const output = new Output({ format: new WavOutputFormat(), target })
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: (_track, index) => index === 1 ? {
        codec: 'pcm-s16',
        sampleRate: request.payload.sampleRate,
        numberOfChannels: request.payload.channels,
        forceTranscode: true
      } : { discard: true },
      showWarnings: false
    })
    if (!conversion.isValid) {
      throw new Error(`AUDIO_PROXY_MEDIA_FAILED: ${conversion.discardedTracks.map((item) => item.reason).join('; ') || 'audio conversion is invalid'}.`)
    }
    conversion.onProgress = (progress) => setState('preparing-audio', clamp(progress))
    setState('preparing-audio', 0)
    await conversion.execute()
    const buffer = target.buffer
    if (!buffer || buffer.byteLength <= 44) throw new Error('AUDIO_PROXY_OUTPUT_INVALID: converted WAVE output is empty.')
    if (buffer.byteLength > 250 * 1024 * 1024) {
      throw new Error('AUDIO_PROXY_OUTPUT_INVALID: converted WAVE output exceeds the direct transcription safety limit.')
    }
    const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'speech.wav'
      document.body.append(anchor)
      setState('complete', 1)
      anchor.click()
      anchor.remove()
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    }
  } finally {
    input.dispose()
  }
}

function setState(state: AudioProxyState['state'], progress: number) {
  window.__cutAudioProxyState = { state, progress: clamp(progress) }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}
