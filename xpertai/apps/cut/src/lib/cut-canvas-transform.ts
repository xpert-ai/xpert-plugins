import type { CutTransform } from './types.js'

export type CutResizeHandle = 'north-west' | 'north-east' | 'south-west' | 'south-east'

export interface CutCanvasBounds {
  width: number
  height: number
}

export function moveCutTransform(
  transform: CutTransform,
  deltaX: number,
  deltaY: number,
  bounds: CutCanvasBounds
): CutTransform {
  return {
    ...transform,
    x: round(clamp(transform.x + deltaX, 0, Math.max(0, bounds.width - transform.width))),
    y: round(clamp(transform.y + deltaY, 0, Math.max(0, bounds.height - transform.height)))
  }
}

export function resizeCutTransform(
  transform: CutTransform,
  handle: CutResizeHandle,
  deltaX: number,
  deltaY: number,
  bounds: CutCanvasBounds,
  minSize = 16
): CutTransform {
  const west = handle === 'north-west' || handle === 'south-west'
  const north = handle === 'north-west' || handle === 'north-east'
  let x = transform.x
  let y = transform.y
  let width = transform.width
  let height = transform.height

  if (west) {
    x = clamp(transform.x + deltaX, 0, transform.x + transform.width - minSize)
    width = transform.width + transform.x - x
  } else {
    width = clamp(transform.width + deltaX, minSize, bounds.width - transform.x)
  }

  if (north) {
    y = clamp(transform.y + deltaY, 0, transform.y + transform.height - minSize)
    height = transform.height + transform.y - y
  } else {
    height = clamp(transform.height + deltaY, minSize, bounds.height - transform.y)
  }

  return { ...transform, x: round(x), y: round(y), width: round(width), height: round(height) }
}

export function rotateCutTransform(transform: CutTransform, startAngle: number, currentAngle: number): CutTransform {
  return { ...transform, rotation: round(transform.rotation + (currentAngle - startAngle) * 180 / Math.PI) }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
