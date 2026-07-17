import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'

export type BrowserMediaMetadata = {
  duration?: number
  codedWidth?: number
  codedHeight?: number
  displayWidth?: number
  displayHeight?: number
  rotationDegrees?: number
}

export async function probeMediaMetadata(source: Blob | string, kind: 'video' | 'audio' | 'image'): Promise<BrowserMediaMetadata> {
  if (typeof source !== 'string' && kind !== 'image') {
    const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS })
    try {
      const duration = await input.computeDuration()
      const video = await input.getPrimaryVideoTrack()
      return {
        ...(Number.isFinite(duration) && duration > 0 ? { duration: roundTime(duration) } : {}),
        ...(video ? {
          codedWidth: video.codedWidth,
          codedHeight: video.codedHeight,
          displayWidth: video.displayWidth,
          displayHeight: video.displayHeight,
          rotationDegrees: video.rotation
        } : {})
      }
    } catch {
      // Fall through to the browser element probe for uncommon containers.
    } finally {
      input.dispose()
    }
  }
  if (kind === 'image') return probeImageMetadata(source)
  return probeMediaElementMetadata(source, kind)
}

export async function probeMediaDuration(source: Blob | string, kind: 'video' | 'audio') {
  const metadata = await probeMediaMetadata(source, kind)
  if (metadata.duration) return metadata.duration
  throw new Error('Media duration is unavailable.')
}

async function probeMediaElementMetadata(source: Blob | string, kind: 'video' | 'audio'): Promise<BrowserMediaMetadata> {
  const media = document.createElement(kind)
  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
  const url = typeof source === 'string' ? source : objectUrl!
  media.preload = 'metadata'
  media.crossOrigin = 'use-credentials'
  if (media instanceof HTMLVideoElement) media.playsInline = true

  return await new Promise<BrowserMediaMetadata>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('Timed out while reading media metadata.')), 20_000)
    const cleanup = () => {
      window.clearTimeout(timeout)
      media.removeEventListener('loadedmetadata', onMetadata)
      media.removeEventListener('durationchange', onDurationChange)
      media.removeEventListener('error', onError)
      media.removeAttribute('src')
      media.load()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    const finish = (error?: Error) => {
      const duration = media.duration
      cleanup()
      if (error) reject(error)
      else if (Number.isFinite(duration) && duration > 0) resolve({
        duration: roundTime(duration),
        ...(media instanceof HTMLVideoElement && media.videoWidth > 0 && media.videoHeight > 0 ? {
          codedWidth: media.videoWidth,
          codedHeight: media.videoHeight,
          displayWidth: media.videoWidth,
          displayHeight: media.videoHeight,
          rotationDegrees: 0
        } : {})
      })
      else reject(new Error('Media duration is unavailable.'))
    }
    const onDurationChange = () => {
      if (Number.isFinite(media.duration) && media.duration > 0) finish()
    }
    const onMetadata = () => {
      if (Number.isFinite(media.duration) && media.duration > 0) finish()
      else media.currentTime = Number.MAX_SAFE_INTEGER
    }
    const onError = () => finish(new Error('Media metadata could not be read in this browser.'))
    media.addEventListener('loadedmetadata', onMetadata)
    media.addEventListener('durationchange', onDurationChange)
    media.addEventListener('error', onError)
    media.src = url
    media.load()
  })
}

async function probeImageMetadata(source: Blob | string): Promise<BrowserMediaMetadata> {
  const image = new Image()
  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
  image.crossOrigin = 'use-credentials'
  try {
    image.src = typeof source === 'string' ? source : objectUrl!
    await image.decode()
    return {
      codedWidth: image.naturalWidth,
      codedHeight: image.naturalHeight,
      displayWidth: image.naturalWidth,
      displayHeight: image.naturalHeight,
      rotationDegrees: 0
    }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function roundTime(value: number) {
  return Math.round(value * 1_000) / 1_000
}
