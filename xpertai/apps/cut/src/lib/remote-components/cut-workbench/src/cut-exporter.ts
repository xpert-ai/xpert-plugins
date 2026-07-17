/**
 * Adapted from OpenCut's SceneExporter at pre-rewrite commit
 * 238750c0250650f1254cf7a4738f8e8c8a0c268c. OpenCut's MIT license and
 * attribution are shipped in assets/upstream. This adapter renders Cut's compact
 * IR instead of OpenCut scene nodes. Visual frames are rendered through Canvas
 * while audible timeline tracks are mixed with the Web Audio API.
 */
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeAudio, canEncodeVideo } from 'mediabunny'
import { audibleTimelineClips } from '../../../cut-media-playback'
import { cutMediaDrawRect } from '../../../cut-media-layout'
import type { CutClip, CutDocument } from './cut-types'

type MediaElement = HTMLImageElement | HTMLVideoElement

export async function canExportCutMp4(width = 1920, height = 1080) {
  return canEncodeVideo('avc', { width, height, bitrate: QUALITY_HIGH })
}

export async function exportCutMp4(
  canvas: HTMLCanvasElement,
  document: CutDocument,
  onProgress: (progress: number) => void,
  signal?: AbortSignal
) {
  canvas.width = document.settings.width
  canvas.height = document.settings.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas 2D is unavailable.')
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })
  output.addVideoTrack(source, { frameRate: document.settings.fps })
  const audioMix = await renderAudioMix(document)
  const audioSource = audioMix ? new AudioBufferSource({ codec: 'aac', bitrate: 128_000 }) : null
  if (audioSource) output.addAudioTrack(audioSource)
  const cache = new Map<string, Promise<MediaElement>>()
  await output.start()
  if (audioSource && audioMix) await audioSource.add(audioMix)
  const frameCount = Math.round(document.settings.durationSeconds * document.settings.fps)
  try {
    for (let frame = 0; frame < frameCount; frame += 1) {
      if (signal?.aborted) throw new DOMException('Cut export cancelled.', 'AbortError')
      const time = frame / document.settings.fps
      await renderFrame(context, document, time, cache)
      await source.add(time, 1 / document.settings.fps)
      if (frame % Math.max(1, Math.floor(document.settings.fps / 2)) === 0) onProgress(frame / frameCount)
    }
    source.close()
    await output.finalize()
  } catch (error) {
    await output.cancel()
    throw error
  }
  onProgress(1)
  if (!output.target.buffer) throw new Error('MediaBunny did not produce an MP4 buffer.')
  return new Blob([output.target.buffer], { type: 'video/mp4' })
}

async function renderAudioMix(document: CutDocument) {
  const clips = audibleTimelineClips(document)
  if (!clips.length) return null
  if (!(await canEncodeAudio('aac'))) throw new Error('AAC audio encoding is unavailable in this browser.')
  const sampleRate = 44_100
  const context = new AudioContext({ sampleRate })
  const decoded = await Promise.all(clips.map(async (clip) => {
    const response = await fetch(clip.previewUrl!, { credentials: 'include' })
    if (!response.ok) throw new Error(`Audio source ${clip.name} could not be loaded.`)
    return { clip, buffer: await context.decodeAudioData(await response.arrayBuffer()) }
  }))
  await context.close()
  const offline = new OfflineAudioContext(2, Math.ceil(document.settings.durationSeconds * sampleRate), sampleRate)
  for (const { clip, buffer } of decoded) {
    const source = offline.createBufferSource()
    const gain = offline.createGain()
    const rate = clip.playbackRate ?? 1
    const start = clip.start
    const end = clip.start + clip.duration
    const volume = Math.max(0, Math.min(2, clip.volume ?? 1))
    source.buffer = buffer
    source.playbackRate.value = rate
    gain.gain.setValueAtTime(volume, start)
    if (clip.fadeIn && clip.fadeIn > 0) {
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(volume, Math.min(end, start + clip.fadeIn))
    }
    if (clip.fadeOut && clip.fadeOut > 0) {
      gain.gain.setValueAtTime(volume, Math.max(start, end - clip.fadeOut))
      gain.gain.linearRampToValueAtTime(0, end)
    }
    source.connect(gain).connect(offline.destination)
    source.start(start, clip.trimIn, Math.min(buffer.duration - clip.trimIn, clip.duration * rate))
  }
  return offline.startRendering()
}

async function renderFrame(context: CanvasRenderingContext2D, document: CutDocument, time: number, cache: Map<string, Promise<MediaElement>>) {
  context.save()
  context.fillStyle = document.settings.background
  context.fillRect(0, 0, document.settings.width, document.settings.height)
  context.restore()
  for (const track of document.tracks) {
    if (track.kind !== 'visual' || track.hidden) continue
    for (const clip of track.clips) {
      if (time < clip.start || time >= clip.start + clip.duration) continue
      await drawClip(context, document, clip, time, cache)
    }
  }
}

async function drawClip(
  context: CanvasRenderingContext2D,
  document: CutDocument,
  clip: CutClip,
  time: number,
  cache: Map<string, Promise<MediaElement>>
) {
  const transform = clip.transform ?? { x: 0, y: 0, width: document.settings.width, height: document.settings.height, rotation: 0, opacity: 1 }
  context.save()
  const clipTime = time - clip.start
  const fadeInOpacity = clip.fadeIn ? Math.min(1, clipTime / clip.fadeIn) : 1
  const remaining = clip.duration - clipTime
  const fadeOutOpacity = clip.fadeOut ? Math.min(1, remaining / clip.fadeOut) : 1
  const transition = transitionState(clip, clipTime)
  context.globalAlpha = transform.opacity * fadeInOpacity * fadeOutOpacity * transition.opacity
  const effects = clip.effects
  context.globalCompositeOperation = clip.blendMode && clip.blendMode !== 'normal' ? clip.blendMode : 'source-over'
  context.filter = effects
    ? `brightness(${effects.brightness}) contrast(${effects.contrast}) saturate(${effects.saturation}) blur(${effects.blur}px) grayscale(${effects.grayscale}) sepia(${effects.sepia})`
    : 'none'
  context.translate(transform.x + transform.width / 2 + transition.offsetX * transform.width, transform.y + transform.height / 2)
  context.rotate(transform.rotation * Math.PI / 180)
  context.scale(transition.scale, transition.scale)
  context.beginPath()
  context.rect(-transform.width / 2, -transform.height / 2, transform.width, transform.height)
  context.clip()
  applyMask(context, clip, transform.width, transform.height)
  if (clip.type === 'color') {
    context.fillStyle = clip.color ?? '#111827'
    context.fillRect(-transform.width / 2, -transform.height / 2, transform.width, transform.height)
  } else if (clip.type === 'text') {
    context.fillStyle = clip.color ?? '#f8fafc'
    context.font = `${clip.fontWeight ?? 700} ${clip.fontSize ?? Math.max(32, Math.round(document.settings.height * 0.08))}px system-ui, sans-serif`
    context.textAlign = clip.textAlign ?? 'center'
    context.textBaseline = 'middle'
    context.fillText(clip.text ?? clip.name, 0, 0, transform.width * 0.9)
  } else if ((clip.type === 'video' || clip.type === 'image') && clip.previewUrl) {
    const media = await loadMedia(clip, cache)
    if (media instanceof HTMLVideoElement) await seekVideo(media, clip.trimIn + (time - clip.start) * (clip.playbackRate ?? 1))
    const source = media instanceof HTMLVideoElement
      ? { width: media.videoWidth, height: media.videoHeight }
      : { width: media.naturalWidth, height: media.naturalHeight }
    const rect = cutMediaDrawRect(source, transform, clip.mediaFit ?? 'cover')
    context.drawImage(media, rect.x, rect.y, rect.width, rect.height)
  }
  context.restore()
}

function applyMask(context: CanvasRenderingContext2D, clip: CutClip, width: number, height: number) {
  const mask = clip.mask
  if (!mask || mask.shape === 'none') return
  const insetX = width * mask.inset
  const insetY = height * mask.inset
  const x = -width / 2 + insetX
  const y = -height / 2 + insetY
  const maskedWidth = Math.max(1, width - insetX * 2)
  const maskedHeight = Math.max(1, height - insetY * 2)
  context.beginPath()
  if (mask.shape === 'circle') context.ellipse(0, 0, maskedWidth / 2, maskedHeight / 2, 0, 0, Math.PI * 2)
  else if (mask.shape === 'rounded') context.roundRect(x, y, maskedWidth, maskedHeight, Math.min(maskedWidth, maskedHeight) * mask.radius * 0.5)
  else context.rect(x, y, maskedWidth, maskedHeight)
  context.clip()
}

function transitionState(clip: CutClip, localTime: number) {
  let opacity = 1
  let offsetX = 0
  let scale = 1
  const apply = (transition: CutClip['transitionIn'], progress: number, direction: -1 | 1) => {
    const bounded = Math.max(0, Math.min(1, progress))
    if (transition?.type === 'fade') opacity *= bounded
    if (transition?.type === 'slide') offsetX += (1 - bounded) * direction
    if (transition?.type === 'zoom') scale *= 0.82 + bounded * 0.18
  }
  if (clip.transitionIn && localTime < clip.transitionIn.duration) apply(clip.transitionIn, localTime / clip.transitionIn.duration, -1)
  const remaining = clip.duration - localTime
  if (clip.transitionOut && remaining < clip.transitionOut.duration) apply(clip.transitionOut, remaining / clip.transitionOut.duration, 1)
  return { opacity, offsetX, scale }
}

function loadMedia(clip: CutClip, cache: Map<string, Promise<MediaElement>>) {
  const key = `${clip.type}:${clip.previewUrl}`
  const existing = cache.get(key)
  if (existing) return existing
  const promise = clip.type === 'video' ? loadVideo(clip.previewUrl!) : loadImage(clip.previewUrl!)
  cache.set(key, promise)
  return promise
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'use-credentials'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Cut image could not be loaded for export.'))
    image.src = url
  })
}

function loadVideo(url: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'use-credentials'
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => resolve(video)
    video.onerror = () => reject(new Error('Cut video could not be loaded for export.'))
    video.src = url
    video.load()
  })
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  const bounded = Math.max(0, Math.min(time, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : time))
  if (Math.abs(video.currentTime - bounded) < 0.0005 && video.readyState >= 2) return
  await new Promise<void>((resolve, reject) => {
    let seeked = false
    let framePresented = false
    let frameCallbackId: number | null = null
    let animationFrameId: number | null = null
    let timeoutId: number | null = null
    const cleanup = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      if (frameCallbackId !== null && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(frameCallbackId)
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId)
    }
    const complete = () => {
      if (!seeked || !framePresented) return
      cleanup()
      resolve()
    }
    const failed = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onError = () => failed(new Error('Cut video seek failed during export.'))
    const onPresentedFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (Math.abs(metadata.mediaTime - bounded) <= 0.075) {
        framePresented = true
        complete()
        return
      }
      frameCallbackId = video.requestVideoFrameCallback(onPresentedFrame)
    }
    const onSeeked = () => {
      seeked = true
      if (typeof video.requestVideoFrameCallback !== 'function') {
        animationFrameId = window.requestAnimationFrame(() => {
          animationFrameId = window.requestAnimationFrame(() => {
            framePresented = true
            complete()
          })
        })
      }
      complete()
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    if (typeof video.requestVideoFrameCallback === 'function') frameCallbackId = video.requestVideoFrameCallback(onPresentedFrame)
    timeoutId = window.setTimeout(() => failed(new Error('Cut video frame decode timed out during export.')), 10_000)
    video.currentTime = bounded
  })
}
