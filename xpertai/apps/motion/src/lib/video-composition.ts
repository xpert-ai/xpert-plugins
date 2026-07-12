import type { MotionJsonObject, MotionVideoComposition } from './types.js'

export function validateVideoComposition(value: MotionVideoComposition | MotionJsonObject | null | undefined): MotionVideoComposition {
  if (!isRecord(value)) {
    throw new Error('Video composition must be a JSON object.')
  }
  const encoded = JSON.stringify(value)
  if (encoded.length > 8 * 1024 * 1024) {
    throw new Error('Video composition is too large.')
  }
  const hasScenes = Array.isArray(value.scenes) && value.scenes.length > 0
  const hasLayers = Array.isArray(value.layers) && value.layers.length > 0
  if (!hasScenes && !hasLayers) {
    throw new Error('Video composition requires scenes or layers.')
  }
  if (value.w !== undefined && (!Number.isFinite(value.w) || Number(value.w) <= 0)) {
    throw new Error('Video composition width is invalid.')
  }
  if (value.h !== undefined && (!Number.isFinite(value.h) || Number(value.h) <= 0)) {
    throw new Error('Video composition height is invalid.')
  }
  validateLayers(Array.isArray(value.layers) ? value.layers : [], 'layers')
  validateLayers(Array.isArray(value.shared) ? value.shared : [], 'shared')
  if (Array.isArray(value.scenes)) {
    value.scenes.forEach((scene, index) => {
      if (!isRecord(scene)) {
        throw new Error(`Video scene ${index + 1} must be an object.`)
      }
      if (scene.duration !== undefined && (!Number.isFinite(Number(scene.duration)) || Number(scene.duration) <= 0)) {
        throw new Error(`Video scene ${index + 1} duration is invalid.`)
      }
      validateLayers(Array.isArray(scene.layers) ? scene.layers : [], `scenes.${index}.layers`)
    })
  }
  return value as MotionVideoComposition
}

export function createStarterVideoComposition(title: string): MotionVideoComposition {
  return {
    w: 1280,
    h: 720,
    fps: 30,
    bg: '#0f172a',
    duration: 5,
    layers: [
      {
        id: 'title',
        type: 'text',
        text: title,
        x: 640,
        y: 330,
        size: 72,
        weight: 800,
        color: '#ffffff',
        opacity: 1,
        tracks: {
          opacity: [
            { t: 0, v: 0 },
            { t: 0.7, v: 1 }
          ],
          y: [
            { t: 0, v: 370 },
            { t: 0.7, v: 330, ease: 'ease-out' }
          ]
        },
        kinetic: { type: 'word-rise', stagger: 0.05, dur: 0.42, start: 0.1 }
      }
    ]
  }
}

function validateLayers(layers: unknown[], path: string) {
  layers.forEach((layer, index) => {
    if (!isRecord(layer)) {
      throw new Error(`Video ${path}.${index} layer must be an object.`)
    }
    if (layer.type !== undefined && !['text', 'rect', 'ellipse', 'image', 'video'].includes(String(layer.type))) {
      throw new Error(`Video ${path}.${index} layer type is invalid.`)
    }
    for (const key of ['start', 'end', 'x', 'y', 'w', 'h', 'opacity', 'scale', 'rotate', 'radius', 'size', 'weight']) {
      const value = layer[key]
      if (value !== undefined && value !== null && !Number.isFinite(Number(value))) {
        throw new Error(`Video ${path}.${index}.${key} must be numeric.`)
      }
    }
    if ((layer.type === 'image' || layer.type === 'video') && layer.src !== undefined && typeof layer.src !== 'string') {
      throw new Error(`Video ${path}.${index}.src must be a string.`)
    }
    const tracks = layer.tracks
    if (tracks !== undefined) {
      if (!isRecord(tracks)) {
        throw new Error(`Video ${path}.${index}.tracks must be an object.`)
      }
      for (const [trackName, points] of Object.entries(tracks)) {
        if (!['opacity', 'x', 'y', 'scale', 'rotate', 'blur', 'offset'].includes(trackName)) {
          continue
        }
        if (!Array.isArray(points)) {
          throw new Error(`Video ${path}.${index}.tracks.${trackName} must be an array.`)
        }
        points.forEach((point, pointIndex) => {
          if (!isRecord(point) || !Number.isFinite(Number(point.t)) || !Number.isFinite(Number(point.v))) {
            throw new Error(`Video ${path}.${index}.tracks.${trackName}.${pointIndex} is invalid.`)
          }
        })
      }
    }
    const motionPath = layer.path
    if (motionPath !== undefined) {
      if (!isRecord(motionPath)) {
        throw new Error(`Video ${path}.${index}.path must be an object.`)
      }
      const points = motionPath.points
      if (points !== undefined) {
        if (!Array.isArray(points)) {
          throw new Error(`Video ${path}.${index}.path.points must be an array.`)
        }
        points.forEach((point, pointIndex) => {
          if (!isRecord(point) || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
            throw new Error(`Video ${path}.${index}.path.points.${pointIndex} is invalid.`)
          }
        })
      }
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
