import * as React from 'react'
import { Button } from '@xpert-ai/plugin-shadcn-ui'
import { Film, Image, Music2, Plus, Sparkles } from 'lucide-react'
import { cutMediaDrawRect, fitCutStage } from '../../../cut-media-layout'
import {
  timelineVideoThumbnailSamples,
  type CutTimelineThumbnailSample
} from '../../../cut-timeline'
import type { CutClip, MediaSummary } from './cut-types'
import type { CutMessageKey } from './cut-i18n'
import { cutDebug } from './debug'

const h = React.createElement
const TIMELINE_THUMBNAIL_WIDTH = 96
const VIDEO_THUMBNAIL_CACHE_LIMIT = 240
const VIDEO_THUMBNAIL_CONCURRENCY = 2

type Translator = (key: CutMessageKey) => string
type VideoThumbnailTask = {
  run: () => Promise<string | null>
  resolve: (value: string | null) => void
  reject: (reason?: unknown) => void
}

const videoThumbnailCache = new Map<string, Promise<string | null>>()
const videoThumbnailQueue: VideoThumbnailTask[] = []
let activeVideoThumbnailTasks = 0

export function MediaCard({
  asset,
  selected,
  analysisAvailable = false,
  analysisOpen = false,
  dragType,
  dragKey,
  onSelect,
  onAdd,
  onToggleAnalysis,
  t
}: {
  asset: MediaSummary
  selected: boolean
  analysisAvailable?: boolean
  analysisOpen?: boolean
  dragType: string
  dragKey: string
  onSelect: () => void
  onAdd: () => void
  onToggleAnalysis?: () => void
  t: Translator
}) {
  return <div role="button" tabIndex={0} aria-pressed={selected} className={`media-card ${selected ? 'selected' : ''}`} draggable onDragStart={(event) => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(dragType, dragKey)
  }} onClick={onSelect} onKeyDown={(event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect()
  }} title={`${t('previewMedia')}: ${asset.originalName}`}>
    <MediaThumbnail asset={asset} />
    <span className="media-card-copy"><strong>{asset.originalName}</strong><small>{formatBytes(asset.size)}</small></span>
    <span className="media-card-actions">
      {analysisAvailable && <Button
        variant={analysisOpen ? 'secondary' : 'ghost'}
        size="icon-xs"
        className="media-card-analyze"
        title={t('mediaIntelligence')}
        aria-label={`${t('mediaIntelligence')}: ${asset.originalName}`}
        aria-pressed={analysisOpen}
        onClick={(event) => {
          event.stopPropagation()
          onToggleAnalysis?.()
        }}
      ><Sparkles /></Button>}
      <Button variant="ghost" size="icon-xs" className="media-card-add" title={t('addToTimeline')} aria-label={`${t('addToTimeline')}: ${asset.originalName}`} onClick={(event) => {
        event.stopPropagation()
        onAdd()
      }}><Plus /></Button>
    </span>
  </div>
}

function MediaThumbnail({ asset }: { asset: MediaSummary }) {
  const source = asset.previewUrl ?? ''
  const [frame, setFrame] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!source || !asset.mimeType.startsWith('video/')) {
      setFrame(null)
      return undefined
    }
    let cancelled = false
    void requestVideoThumbnail(source, 0.12).then((next) => {
      if (!cancelled) setFrame(next)
    })
    return () => { cancelled = true }
  }, [asset.mimeType, source])

  const imageSource = asset.mimeType.startsWith('image/') ? source : frame
  return <span className="media-thumb" data-media-thumbnail={imageSource ? 'ready' : 'placeholder'}>
    {imageSource
      ? <img src={imageSource} crossOrigin={imageSource.startsWith('data:') ? undefined : 'use-credentials'} alt="" draggable={false} />
      : asset.mimeType.startsWith('video/') ? <Film /> : asset.mimeType.startsWith('audio/') ? <Music2 /> : <Image />}
  </span>
}

export function MediaAssetPreview({
  asset,
  onState,
  emptyText
}: {
  asset: MediaSummary
  onState: (state: string, mediaAssetId?: string, sourceUrl?: string) => void
  emptyText: string
}) {
  const source = asset.previewUrl ?? undefined
  const [intrinsicSize, setIntrinsicSize] = React.useState<{ width: number; height: number } | null>(null)
  const sourceSize = mediaDisplaySize(asset, intrinsicSize)
  const [rootRef, fittedSize] = useFittedPreviewSize(sourceSize)
  const fittedStyle = fittedSize ? {
    width: `${fittedSize.width}px`,
    height: `${fittedSize.height}px`,
    aspectRatio: `${sourceSize.width} / ${sourceSize.height}`
  } : { aspectRatio: `${sourceSize.width} / ${sourceSize.height}` }

  if (!source) return <div className="media-asset-preview empty"><Film /><p>{emptyText}</p></div>
  if (asset.mimeType.startsWith('image/')) return <div ref={rootRef} className="media-asset-preview image" style={fittedStyle}>
    <img src={source} alt={asset.originalName} crossOrigin="use-credentials" draggable={false} onLoad={(event) => {
      setIntrinsicSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
      onState('loaded', asset.id, source)
    }} onError={() => onState('error', asset.id, source)} />
  </div>
  if (asset.mimeType.startsWith('audio/')) return <div className="media-asset-preview audio"><Music2 /><strong>{asset.originalName}</strong><audio src={source} controls crossOrigin="use-credentials" onLoadStart={() => onState('loading', asset.id, source)} onLoadedData={() => onState('loaded', asset.id, source)} onError={() => onState('error', asset.id, source)} /></div>
  return <div ref={rootRef} className="media-asset-preview video" style={fittedStyle}>
    <video src={source} controls crossOrigin="use-credentials" playsInline onLoadStart={() => onState('loading', asset.id, source)} onLoadedMetadata={(event) => {
      setIntrinsicSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })
    }} onLoadedData={() => onState('loaded', asset.id, source)} onError={() => onState('error', asset.id, source)} />
  </div>
}

function useFittedPreviewSize(source: { width: number; height: number }) {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [fittedSize, setFittedSize] = React.useState<{ width: number; height: number } | null>(null)
  React.useLayoutEffect(() => {
    const root = rootRef.current
    const parent = root?.parentElement
    if (!root || !parent) return undefined
    const measure = () => {
      const style = window.getComputedStyle(parent)
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      const next = fitCutStage({
        width: Math.max(0, parent.clientWidth - horizontalPadding),
        height: Math.max(0, parent.clientHeight - verticalPadding)
      }, source)
      setFittedSize((current) => current?.width === next.width && current.height === next.height ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [source.height, source.width])
  return [rootRef, fittedSize] as const
}

function mediaDisplaySize(asset: MediaSummary, intrinsic: { width: number; height: number } | null) {
  const displayWidth = positive(asset.displayWidth)
  const displayHeight = positive(asset.displayHeight)
  if (displayWidth && displayHeight) return { width: displayWidth, height: displayHeight }
  if (intrinsic?.width && intrinsic.height) return intrinsic
  const codedWidth = positive(asset.codedWidth)
  const codedHeight = positive(asset.codedHeight)
  if (codedWidth && codedHeight) {
    return asset.rotationDegrees === 90 || asset.rotationDegrees === 270
      ? { width: codedHeight, height: codedWidth }
      : { width: codedWidth, height: codedHeight }
  }
  return { width: 16, height: 9 }
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function TimelineVideoStrip({ clip, pixelsPerSecond }: { clip: CutClip; pixelsPerSecond: number }) {
  const rootRef = React.useRef<HTMLSpanElement | null>(null)
  const [samples, setSamples] = React.useState<CutTimelineThumbnailSample[]>([])
  const [frames, setFrames] = React.useState<Map<string, string>>(() => new Map())

  React.useLayoutEffect(() => {
    const root = rootRef.current
    const scroller = root?.closest('.timeline-scroll')
    if (!root || !(scroller instanceof HTMLElement)) return undefined
    let animationFrame = 0
    const measure = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        const clipRect = root.getBoundingClientRect()
        const viewportRect = scroller.getBoundingClientRect()
        const next = timelineVideoThumbnailSamples({
          clipDuration: clip.duration,
          trimIn: clip.trimIn,
          playbackRate: clip.playbackRate,
          pixelsPerSecond,
          visibleStart: viewportRect.left - clipRect.left,
          visibleEnd: viewportRect.right - clipRect.left,
          cellWidth: TIMELINE_THUMBNAIL_WIDTH,
          maxSamples: 24
        })
        setSamples((current) => thumbnailSamplesEqual(current, next) ? current : next)
      })
    }
    measure()
    scroller.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(scroller)
    return () => {
      cancelAnimationFrame(animationFrame)
      scroller.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [clip.duration, clip.playbackRate, clip.trimIn, pixelsPerSecond])

  React.useEffect(() => {
    const source = clip.previewUrl
    if (!source || !samples.length) return undefined
    let cancelled = false
    void Promise.all(samples.map(async (sample) => {
      const key = videoThumbnailKey(source, sample.sourceTime)
      const frame = await requestVideoThumbnail(source, sample.sourceTime)
      return { key, frame }
    })).then((resolved) => {
      if (cancelled) return
      setFrames((current) => {
        const next = new Map(current)
        for (const item of resolved) if (item.frame) next.set(item.key, item.frame)
        return next
      })
    })
    return () => { cancelled = true }
  }, [clip.previewUrl, samples])

  return <span ref={rootRef} className="timeline-video-strip" aria-hidden="true">
    {samples.map((sample) => {
      const key = videoThumbnailKey(clip.previewUrl ?? '', sample.sourceTime)
      const frame = frames.get(key)
      return frame
        ? <img key={key} src={frame} draggable={false} style={{ left: sample.left, width: sample.width }} alt="" />
        : <i key={key} className="timeline-video-frame-placeholder" style={{ left: sample.left, width: sample.width }} />
    })}
  </span>
}

function thumbnailSamplesEqual(left: readonly CutTimelineThumbnailSample[], right: readonly CutTimelineThumbnailSample[]) {
  return left.length === right.length && left.every((sample, index) => {
    const candidate = right[index]
    return candidate?.left === sample.left && candidate.width === sample.width && candidate.sourceTime === sample.sourceTime
  })
}

function videoThumbnailKey(source: string, sourceTime: number) {
  return `${source}#t=${sourceTime.toFixed(3)}`
}

function requestVideoThumbnail(source: string, sourceTime: number) {
  const key = videoThumbnailKey(source, sourceTime)
  const cached = videoThumbnailCache.get(key)
  if (cached) return cached
  while (videoThumbnailCache.size >= VIDEO_THUMBNAIL_CACHE_LIMIT) {
    const oldest = videoThumbnailCache.keys().next().value as string | undefined
    if (!oldest) break
    videoThumbnailCache.delete(oldest)
  }
  const pending = enqueueVideoThumbnail(() => captureVideoThumbnail(source, sourceTime))
    .catch((error) => {
      cutDebug.debug('media.thumbnail-skipped', {
        sourceTime,
        reason: error instanceof Error ? error.message : String(error)
      })
      return null
    })
  videoThumbnailCache.set(key, pending)
  return pending
}

function enqueueVideoThumbnail(run: () => Promise<string | null>) {
  return new Promise<string | null>((resolve, reject) => {
    videoThumbnailQueue.push({ run, resolve, reject })
    drainVideoThumbnailQueue()
  })
}

function drainVideoThumbnailQueue() {
  while (activeVideoThumbnailTasks < VIDEO_THUMBNAIL_CONCURRENCY && videoThumbnailQueue.length) {
    const task = videoThumbnailQueue.shift()!
    activeVideoThumbnailTasks += 1
    void task.run().then(task.resolve, task.reject).finally(() => {
      activeVideoThumbnailTasks -= 1
      drainVideoThumbnailQueue()
    })
  }
}

async function captureVideoThumbnail(source: string, sourceTime: number) {
  const video = document.createElement('video')
  video.crossOrigin = 'use-credentials'
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = source
  try {
    await waitForVideoThumbnailMedia(video, 'loadedmetadata')
    const maximum = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.04) : sourceTime
    const target = Math.min(Math.max(0, sourceTime), maximum)
    if (target <= 0.01) {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitForVideoThumbnailMedia(video, 'loadeddata')
    } else {
      const seeked = waitForVideoThumbnailMedia(video, 'seeked')
      video.currentTime = target
      await seeked
    }
    if (!video.videoWidth || !video.videoHeight) return null
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')
    if (!context) return null
    const rect = cutMediaDrawRect(
      { width: video.videoWidth, height: video.videoHeight },
      { width: canvas.width, height: canvas.height },
      'cover'
    )
    context.fillStyle = '#05070a'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.save()
    context.translate(canvas.width / 2, canvas.height / 2)
    context.drawImage(video, rect.x, rect.y, rect.width, rect.height)
    context.restore()
    return canvas.toDataURL('image/jpeg', 0.72)
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

function waitForVideoThumbnailMedia(media: HTMLMediaElement, eventName: 'loadedmetadata' | 'loadeddata' | 'seeked') {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error(`Timed out waiting for ${eventName}.`)), 12_000)
    const onReady = () => finish()
    const onError = () => finish(new Error(`Unable to decode a video thumbnail (${media.error?.code ?? 'media error'}).`))
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      media.removeEventListener(eventName, onReady)
      media.removeEventListener('error', onError)
      error ? reject(error) : resolve()
    }
    media.addEventListener(eventName, onReady, { once: true })
    media.addEventListener('error', onError, { once: true })
  })
}

function formatBytes(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`
}
