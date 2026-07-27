import * as React from 'react'
import {
  previewMediaTargetTime,
  previewNativeAudioState,
  shouldPlayPreviewMedia,
  shouldSeekPreviewMedia
} from '../../../cut-media-playback'
import type { CutClip } from './cut-types'
import { cutDebug } from './debug'
import { errorText } from './runtime'

const h = React.createElement

type PreviewMediaStateHandler = (state: string, mediaAssetId?: string, sourceUrl?: string) => void

type StageVideoProps = {
  clip: CutClip
  playhead: number
  playing: boolean
  active: boolean
  muted: boolean
  objectFit: React.CSSProperties['objectFit']
  onState: PreviewMediaStateHandler
}

type StageAudioProps = {
  clip: CutClip
  playhead: number
  playing: boolean
  active: boolean
  onState: PreviewMediaStateHandler
}

export function StageVideo({ clip, playhead, playing, active, muted, objectFit, onState }: StageVideoProps) {
  const ref = React.useRef<HTMLVideoElement | null>(null)
  const previousPlayheadRef = React.useRef(playhead)
  const wasMediaPlayingRef = React.useRef(false)
  const playRequestRef = React.useRef<Promise<void> | null>(null)

  React.useEffect(() => {
    const video = ref.current
    return () => {
      if (video) releasePreviewCapturedAudio(video)
    }
  }, [])

  React.useEffect(() => {
    const video = ref.current
    if (!video) return
    const mediaPlaying = shouldPlayPreviewMedia(playing, active)
    const target = previewMediaTargetTime({
      active,
      playhead,
      clipStart: clip.start,
      trimIn: clip.trimIn,
      playbackRate: clip.playbackRate
    })
    const shouldSeek = shouldSeekPreviewMedia({
      playing: mediaPlaying,
      wasPlaying: wasMediaPlayingRef.current,
      playhead,
      previousPlayhead: previousPlayheadRef.current,
      currentTime: video.currentTime,
      targetTime: target
    })
    if (shouldSeek) {
      cutDebug.debug('preview.video-seek', { clipId: clip.id, playing: mediaPlaying, target: roundPreviewTime(target) })
      video.currentTime = target
    }
    video.playbackRate = clip.playbackRate ?? 1
    const requestedVolume = clampPreviewVolume(clip.volume ?? 1)
    const capturedAudio = setPreviewCapturedAudioGain(video, active && !muted ? requestedVolume : 0)
    const nativeAudio = previewNativeAudioState({ active, capturedAudio, requestedVolume, mutedByTimeline: muted })
    video.volume = nativeAudio.volume
    video.muted = nativeAudio.muted
    video.dataset.previewActive = active ? 'true' : 'false'
    video.dataset.previewAudioRoute = capturedAudio ? 'web-audio' : nativeAudio.muted ? 'muted' : 'native'
    if (mediaPlaying && (shouldSeek || video.paused) && !playRequestRef.current) {
      const request = video.play()
      playRequestRef.current = request
      void request.catch((error) => cutDebug.warn(`preview.video-play-failed: ${errorText(error)}`)).finally(() => {
        if (playRequestRef.current === request) playRequestRef.current = null
      })
    } else if (!mediaPlaying) {
      video.pause()
      playRequestRef.current = null
    }
    previousPlayheadRef.current = playhead
    wasMediaPlayingRef.current = mediaPlaying
  }, [active, clip, muted, playhead, playing])

  return <video
    ref={ref}
    src={clip.previewUrl}
    style={{ objectFit }}
    crossOrigin="use-credentials"
    playsInline
    data-preview-clip-id={clip.id}
    onLoadStart={() => onState('loading', clip.mediaAssetId, clip.previewUrl)}
    onLoadedData={() => onState('loaded', clip.mediaAssetId, clip.previewUrl)}
    onError={() => onState('error', clip.mediaAssetId, clip.previewUrl)}
  />
}

export function StageAudio({ clip, playhead, playing, active, onState }: StageAudioProps) {
  const ref = React.useRef<HTMLAudioElement | null>(null)
  const previousPlayheadRef = React.useRef(playhead)
  const wasMediaPlayingRef = React.useRef(false)
  const playRequestRef = React.useRef<Promise<void> | null>(null)

  React.useEffect(() => {
    const audio = ref.current
    return () => {
      if (audio) releasePreviewCapturedAudio(audio)
    }
  }, [])

  React.useEffect(() => {
    const audio = ref.current
    if (!audio) return
    const mediaPlaying = shouldPlayPreviewMedia(playing, active)
    const target = previewMediaTargetTime({
      active,
      playhead,
      clipStart: clip.start,
      trimIn: clip.trimIn,
      playbackRate: clip.playbackRate
    })
    const shouldSeek = shouldSeekPreviewMedia({
      playing: mediaPlaying,
      wasPlaying: wasMediaPlayingRef.current,
      playhead,
      previousPlayhead: previousPlayheadRef.current,
      currentTime: audio.currentTime,
      targetTime: target
    })
    if (shouldSeek) {
      cutDebug.debug('preview.audio-seek', { clipId: clip.id, playing: mediaPlaying, target: roundPreviewTime(target) })
      audio.currentTime = target
    }
    audio.playbackRate = clip.playbackRate ?? 1
    const requestedVolume = clampPreviewVolume(clip.volume ?? 1)
    const capturedAudio = setPreviewCapturedAudioGain(audio, active ? requestedVolume : 0)
    const nativeAudio = previewNativeAudioState({ active, capturedAudio, requestedVolume })
    audio.volume = nativeAudio.volume
    audio.muted = nativeAudio.muted
    audio.dataset.previewActive = active ? 'true' : 'false'
    audio.dataset.previewAudioRoute = capturedAudio ? 'web-audio' : nativeAudio.muted ? 'muted' : 'native'
    if (mediaPlaying && (shouldSeek || audio.paused) && !playRequestRef.current) {
      const request = audio.play()
      playRequestRef.current = request
      void request.catch((error) => cutDebug.warn(`preview.audio-play-failed: ${errorText(error)}`)).finally(() => {
        if (playRequestRef.current === request) playRequestRef.current = null
      })
    } else if (!mediaPlaying) {
      audio.pause()
      playRequestRef.current = null
    }
    previousPlayheadRef.current = playhead
    wasMediaPlayingRef.current = mediaPlaying
  }, [active, clip, playhead, playing])

  return <audio
    ref={ref}
    src={clip.previewUrl}
    crossOrigin="use-credentials"
    className="stage-audio"
    data-preview-clip-id={clip.id}
    onLoadedData={() => onState('loaded', clip.mediaAssetId, clip.previewUrl)}
    onError={() => onState('error', clip.mediaAssetId, clip.previewUrl)}
  />
}

/**
 * Chromium may pause a pre-rolled media element when it becomes audible.
 * Keep the element muted and route its captured raw audio through a gain node,
 * so gaps stay silent without interrupting the media clock at clip boundaries.
 */
type CaptureStreamMediaElement = HTMLMediaElement & {
  captureStream?: () => MediaStream
}

type PreviewCapturedAudioRoute = {
  source: MediaStreamAudioSourceNode
  gain: GainNode
}

let previewCapturedAudioContext: AudioContext | null = null
const previewCapturedAudioRoutes = new WeakMap<HTMLMediaElement, PreviewCapturedAudioRoute>()
const previewCapturedAudioWarnings = new WeakSet<HTMLMediaElement>()

function ensurePreviewCapturedAudioContext() {
  previewCapturedAudioContext ??= new AudioContext()
  return previewCapturedAudioContext
}

function setPreviewCapturedAudioGain(media: HTMLMediaElement, volume: number) {
  let route = previewCapturedAudioRoutes.get(media)
  if (!route) {
    const captureStream = (media as CaptureStreamMediaElement).captureStream
    if (!captureStream) return false
    try {
      const stream = captureStream.call(media)
      if (!stream.getAudioTracks().length) return false
      const context = ensurePreviewCapturedAudioContext()
      const source = context.createMediaStreamSource(stream)
      const gain = context.createGain()
      source.connect(gain).connect(context.destination)
      route = { source, gain }
      previewCapturedAudioRoutes.set(media, route)
    } catch (error) {
      if (!previewCapturedAudioWarnings.has(media)) {
        previewCapturedAudioWarnings.add(media)
        cutDebug.warn(`preview.captured-audio-routing-failed: ${errorText(error)}`)
      }
      return false
    }
  }
  const context = ensurePreviewCapturedAudioContext()
  route.gain.gain.setValueAtTime(clampPreviewVolume(volume), context.currentTime)
  return true
}

export function resumePreviewCapturedAudio() {
  const context = ensurePreviewCapturedAudioContext()
  if (context.state === 'suspended') {
    void context.resume().catch((error) => cutDebug.warn(`preview.captured-audio-resume-failed: ${errorText(error)}`))
  }
}

function releasePreviewCapturedAudio(media: HTMLMediaElement) {
  const route = previewCapturedAudioRoutes.get(media)
  if (!route) return
  route.source.disconnect()
  route.gain.disconnect()
  previewCapturedAudioRoutes.delete(media)
}

function clampPreviewVolume(value: number) {
  return Math.min(1, Math.max(0, value))
}

function roundPreviewTime(value: number) {
  return Math.round(value * 1_000) / 1_000
}
