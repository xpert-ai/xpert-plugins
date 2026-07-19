import type { CutMediaFit } from './types.js'

export type CutSize = { width: number; height: number }
export type CutRect = CutSize & { x: number; y: number }

export function fitCutStage(available: CutSize, project: CutSize): CutSize {
  if (available.width <= 0 || available.height <= 0 || project.width <= 0 || project.height <= 0) {
    return { width: 0, height: 0 }
  }
  const scale = Math.min(available.width / project.width, available.height / project.height)
  return { width: project.width * scale, height: project.height * scale }
}

/** Returns the uniform scale from project-space pixels to the fitted preview stage. */
export function cutStageScale(stage: CutSize, project: CutSize): number {
  if (stage.width <= 0 || stage.height <= 0 || project.width <= 0 || project.height <= 0) return 0
  return Math.min(stage.width / project.width, stage.height / project.height)
}

export function cutMediaDrawRect(source: CutSize, target: CutSize, fit: CutMediaFit = 'cover'): CutRect {
  if (fit === 'stretch' || source.width <= 0 || source.height <= 0) {
    return { x: -target.width / 2, y: -target.height / 2, width: target.width, height: target.height }
  }
  const scale = fit === 'contain'
    ? Math.min(target.width / source.width, target.height / source.height)
    : Math.max(target.width / source.width, target.height / source.height)
  const width = source.width * scale
  const height = source.height * scale
  return { x: -width / 2, y: -height / 2, width, height }
}
