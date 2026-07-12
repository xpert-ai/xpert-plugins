import type { MotionVideoComposition, MotionVideoLayer, MotionVideoTrackPoint as MotionTrackPoint } from '../../../types'

export type { MotionVideoComposition } from '../../../types'

export type RenderableComposition = {
  w: number
  h: number
  fps: number
  duration(): number
  preload(): Promise<void>
  seekMedia(time: number): Promise<void>
  renderFrame(ctx: CanvasRenderingContext2D, time: number): void
}

const imageCache = new Map<string, HTMLImageElement>()
const videoCache = new Map<string, HTMLVideoElement>()

export function createRenderableComposition(input: MotionVideoComposition): RenderableComposition {
  const w = positiveNumber(input.w, 1280)
  const h = positiveNumber(input.h, 720)
  const fps = positiveNumber(input.fps, 30)
  const durationValue = Math.max(0.5, positiveNumber(input.duration, computeDuration(input)))

  return {
    w,
    h,
    fps,
    duration: () => durationValue,
    preload: async () => preloadMedia(input),
    seekMedia: async (time) => seekVideos(input, time),
    renderFrame(ctx: CanvasRenderingContext2D, time: number) {
      drawComposition(ctx, input, { w, h, time, duration: durationValue })
    }
  }
}

function drawComposition(
  ctx: CanvasRenderingContext2D,
  input: MotionVideoComposition,
  frame: {
    w: number
    h: number
    time: number
    duration: number
  }
) {
  ctx.clearRect(0, 0, frame.w, frame.h)
  drawBackground(ctx, input.bg || '#0f172a', frame.w, frame.h)
  const sceneInfo = resolveScene(input, frame.time)
  const shared = Array.isArray(input.shared) ? input.shared : []
  drawScene(ctx, input, sceneInfo, frame, shared, 1)
  const transition = sceneInfo.scene?.transition || 'cut'
  const transitionDuration = Math.min(0.65, sceneInfo.duration / 3)
  if (sceneInfo.nextScene && transition !== 'cut' && sceneInfo.localTime > sceneInfo.duration - transitionDuration) {
    const progress = clamp((sceneInfo.localTime - (sceneInfo.duration - transitionDuration)) / transitionDuration, 0, 1)
    if (transition === 'push') {
      ctx.save()
      ctx.translate(frame.w * (1 - progress), 0)
      drawScene(ctx, input, { ...sceneInfo, scene: sceneInfo.nextScene, localTime: 0 }, frame, shared, 1)
      ctx.restore()
    } else {
      drawScene(ctx, input, { ...sceneInfo, scene: sceneInfo.nextScene, localTime: 0 }, frame, shared, transition === 'fade' ? progress : progress)
    }
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  input: MotionVideoComposition,
  sceneInfo: ReturnType<typeof resolveScene>,
  frame: { w: number; h: number; time: number; duration: number },
  shared: MotionVideoLayer[],
  alpha: number
) {
  ctx.save()
  ctx.globalAlpha *= alpha
  if (sceneInfo.scene?.bg) {
    drawBackground(ctx, sceneInfo.scene.bg, frame.w, frame.h)
  }
  const layers = sceneInfo.scene ? sceneInfo.scene.layers || [] : input.layers || []
  for (const layer of [...shared, ...layers]) {
    drawLayer(ctx, layer, sceneInfo.localTime, frame)
  }
  ctx.restore()
}

function drawBackground(ctx: CanvasRenderingContext2D, bg: string, w: number, h: number) {
  if (/^linear-gradient/i.test(bg)) {
    const gradient = ctx.createLinearGradient(0, 0, w, h)
    gradient.addColorStop(0, '#0f172a')
    gradient.addColorStop(0.45, '#2563eb')
    gradient.addColorStop(1, '#14b8a6')
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = bg
  }
  ctx.fillRect(0, 0, w, h)
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: MotionVideoLayer,
  localTime: number,
  frame: {
    w: number
    h: number
    time: number
    duration: number
  }
) {
  const start = numberValue(layer.start, 0)
  const end = numberValue(layer.end, frame.duration)
  if (localTime < start || localTime > end) {
    return
  }
  const activeTime = Math.max(0, localTime - start)
  const baseX = sampleTrack(layer, 'x', activeTime, numberValue(layer.x, frame.w / 2))
  const baseY = sampleTrack(layer, 'y', activeTime, numberValue(layer.y, frame.h / 2))
  const offset = sampleTrack(layer, 'offset', activeTime, 0)
  const pathPoint = pointOnPath(layer.path, offset)
  const x = pathPoint?.x ?? baseX
  const y = pathPoint?.y ?? baseY
  const opacity = clamp(sampleTrack(layer, 'opacity', activeTime, numberValue(layer.opacity, 1)), 0, 1)
  const scale = sampleTrack(layer, 'scale', activeTime, numberValue(layer.scale, 1))
  const rotate = sampleTrack(layer, 'rotate', activeTime, numberValue(layer.rotate, 0))
  const blur = Math.max(0, sampleTrack(layer, 'blur', activeTime, 0))
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(x, y)
  ctx.rotate((rotate * Math.PI) / 180)
  ctx.scale(scale, scale)
  if (blur > 0) {
    ctx.filter = `blur(${blur}px)`
  }
  if (layer.type === 'video' && layer.src) {
    drawVideoLayer(ctx, layer)
  } else if (layer.type === 'image' && layer.src) {
    drawImageLayer(ctx, layer)
  } else if (layer.type === 'ellipse') {
    drawEllipseLayer(ctx, layer)
  } else if (layer.type === 'rect') {
    drawRectLayer(ctx, layer)
  } else {
    drawTextLayer(ctx, layer)
  }
  ctx.restore()
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: MotionVideoLayer) {
  const size = positiveNumber(layer.size, 64)
  const weight = positiveNumber(layer.weight, 800)
  ctx.font = `${weight} ${size}px ${layer.font || 'Inter'}, ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = layer.align || 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = layer.color || '#ffffff'
  if (layer.kinetic?.type === 'char-rise' || layer.kinetic?.type === 'char-pop') {
    drawKineticCharacters(ctx, layer.text || 'Motion', size, layer)
  } else {
    wrapText(ctx, layer.text || 'Motion', 0, 0, positiveNumber(layer.w, 980), size * 1.15)
  }
}

function drawRectLayer(ctx: CanvasRenderingContext2D, layer: MotionVideoLayer) {
  const w = positiveNumber(layer.w, 360)
  const h = positiveNumber(layer.h, 180)
  ctx.fillStyle = layer.fill || layer.color || layer.bg || '#ffffff'
  roundedRect(ctx, -w / 2, -h / 2, w, h, positiveNumber(layer.radius, 28))
  ctx.fill()
}

function drawEllipseLayer(ctx: CanvasRenderingContext2D, layer: MotionVideoLayer) {
  ctx.fillStyle = layer.fill || layer.color || layer.bg || '#22c55e'
  ctx.beginPath()
  ctx.ellipse(0, 0, positiveNumber(layer.w, 220) / 2, positiveNumber(layer.h, 220) / 2, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawImageLayer(ctx: CanvasRenderingContext2D, layer: MotionVideoLayer) {
  const img = layer.src ? imageCache.get(layer.src) : null
  const w = positiveNumber(layer.w, 480)
  const h = positiveNumber(layer.h, 270)
  if (img && img.complete) {
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
  } else {
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(-w / 2, -h / 2, w, h)
  }
}

function drawVideoLayer(ctx: CanvasRenderingContext2D, layer: MotionVideoLayer) {
  const video = layer.src ? videoCache.get(layer.src) : null
  const w = positiveNumber(layer.w, 480)
  const h = positiveNumber(layer.h, 270)
  if (video && video.readyState >= 2) {
    ctx.drawImage(video, -w / 2, -h / 2, w, h)
  } else {
    ctx.fillStyle = '#020617'
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '700 28px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Video', 0, 0)
  }
}

function resolveScene(input: MotionVideoComposition, time: number) {
  const scenes = Array.isArray(input.scenes) ? input.scenes : []
  let cursor = 0
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index]
    const duration = positiveNumber(scene.duration, 3)
    if (time <= cursor + duration) {
      return { scene, sceneIndex: index, nextScene: scenes[index + 1] || null, duration, localTime: Math.max(0, time - cursor) }
    }
    cursor += duration
  }
  return { scene: null, sceneIndex: -1, nextScene: null, duration: computeDuration(input), localTime: time }
}

function sampleTrack(layer: MotionVideoLayer, prop: string, time: number, fallback: number) {
  const points = (layer.tracks as Record<string, MotionTrackPoint[] | undefined> | undefined)?.[prop]
  if (!Array.isArray(points) || points.length === 0) {
    return fallback
  }
  const sorted = points
    .filter((point): point is MotionTrackPoint => typeof point === 'object' && point !== null)
    .map((point) => ({ t: numberValue(point.t, 0), v: numberValue(point.v, fallback), ease: point.ease }))
    .sort((a, b) => a.t - b.t)
  if (sorted.length === 0 || time <= sorted[0].t) {
    return sorted[0]?.v ?? fallback
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const next = sorted[index]
    if (time <= next.t) {
      const span = Math.max(0.001, next.t - previous.t)
      const raw = clamp((time - previous.t) / span, 0, 1)
      const eased = next.ease === 'ease-out' ? 1 - Math.pow(1 - raw, 3) : next.ease === 'ease-in' ? raw * raw * raw : raw
      return previous.v + (next.v - previous.v) * eased
    }
  }
  return sorted[sorted.length - 1].v
}

function preloadMedia(input: MotionVideoComposition) {
  const images = collectLayers(input)
    .filter((layer) => layer.type === 'image' && layer.src)
    .map((layer) => String(layer.src))
  const videos = collectLayers(input)
    .filter((layer) => layer.type === 'video' && layer.src)
    .map((layer) => String(layer.src))
  return Promise.all([...images.map(preloadImage), ...videos.map(preloadVideo)]).then(() => undefined)
}

function preloadImage(url: string) {
  return new Promise<void>((resolve) => {
    if (imageCache.has(url)) {
      resolve()
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      imageCache.set(url, image)
      resolve()
    }
    image.onerror = () => resolve()
    image.src = url
  })
}

function preloadVideo(url: string) {
  return new Promise<void>((resolve) => {
    if (videoCache.has(url)) {
      resolve()
      return
    }
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true
    video.onloadeddata = () => {
      videoCache.set(url, video)
      resolve()
    }
    video.onerror = () => resolve()
    video.src = url
  })
}

function seekVideos(input: MotionVideoComposition, time: number) {
  const videos = collectLayers(input)
    .filter((layer) => layer.type === 'video' && layer.src)
    .map((layer) => ({ layer, video: videoCache.get(String(layer.src)) }))
    .filter((item): item is { layer: MotionVideoLayer; video: HTMLVideoElement } => Boolean(item.video))
  return Promise.all(
    videos.map(
      ({ layer, video }) =>
        new Promise<void>((resolve) => {
          const start = numberValue(layer.start, 0)
          const mediaTime = Math.max(0, time - start)
          if (!Number.isFinite(video.duration) || Math.abs(video.currentTime - mediaTime) < 0.03) {
            resolve()
            return
          }
          const done = () => {
            video.removeEventListener('seeked', done)
            resolve()
          }
          video.addEventListener('seeked', done, { once: true })
          video.currentTime = layer.loop && Number.isFinite(video.duration) && video.duration > 0 ? mediaTime % video.duration : Math.min(mediaTime, video.duration || mediaTime)
          setTimeout(done, 250)
        })
    )
  ).then(() => undefined)
}

function collectLayers(input: MotionVideoComposition) {
  const layers = [...(input.layers || []), ...(input.shared || [])]
  for (const scene of input.scenes || []) {
    layers.push(...(scene.layers || []))
  }
  return layers
}

function computeDuration(input: MotionVideoComposition) {
  if (Array.isArray(input.scenes) && input.scenes.length > 0) {
    return input.scenes.reduce((sum, scene) => sum + positiveNumber(scene.duration, 3), 0)
  }
  const layers = input.layers || []
  const maxEnd = layers.reduce((max, layer) => Math.max(max, numberValue(layer.end, numberValue(layer.start, 0) + 3)), 0)
  return maxEnd || 5
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) {
    lines.push(line)
  }
  const top = y - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((item, index) => ctx.fillText(item, x, top + index * lineHeight))
}

function drawKineticCharacters(ctx: CanvasRenderingContext2D, text: string, size: number, layer: MotionVideoLayer) {
  const chars = Array.from(text)
  const totalWidth = chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0)
  let x = -totalWidth / 2
  chars.forEach((char, index) => {
    const width = ctx.measureText(char).width
    const lift = layer.kinetic?.type === 'char-pop' ? Math.sin(index * 0.85) * size * 0.08 : -Math.sin(index * 0.55) * size * 0.05
    ctx.fillText(char, x + width / 2, lift)
    x += width
  })
}

function pointOnPath(path: MotionVideoLayer['path'], offset: number) {
  const points = (path?.points || [])
    .map((point) => ({ x: numberValue(point.x, NaN), y: numberValue(point.y, NaN) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (points.length === 0) {
    return null
  }
  if (points.length === 1) {
    return points[0]
  }
  const t = clamp(offset, 0, 1)
  const scaled = t * (points.length - 1)
  const index = Math.min(points.length - 2, Math.floor(scaled))
  const local = scaled - index
  const from = points[index]
  const to = points[index + 1]
  return {
    x: from.x + (to.x - from.x) * local,
    y: from.y + (to.y - from.y) * local
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
