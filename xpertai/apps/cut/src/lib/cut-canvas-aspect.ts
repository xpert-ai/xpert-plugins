import type { CutProjectDocument } from './types.js'

export const CUT_CANVAS_ASPECT_PRESETS = [
  { value: '16:9', numerator: 16, denominator: 9 },
  { value: '4:3', numerator: 4, denominator: 3 },
  { value: '2.35:1', numerator: 2.35, denominator: 1 },
  { value: '2:1', numerator: 2, denominator: 1 },
  { value: '1.85:1', numerator: 1.85, denominator: 1 },
  { value: '9:16', numerator: 9, denominator: 16 },
  { value: '3:4', numerator: 3, denominator: 4 },
  { value: '1:1', numerator: 1, denominator: 1 },
  { value: '1:2', numerator: 1, denominator: 2 }
] as const

export type CutCanvasAspectPreset = typeof CUT_CANVAS_ASPECT_PRESETS[number]['value']

export function currentCutCanvasAspect(width: number, height: number): CutCanvasAspectPreset | 'custom' {
  const ratio = width / height
  const match = CUT_CANVAS_ASPECT_PRESETS.find((preset) => Math.abs(ratio - preset.numerator / preset.denominator) < 0.005)
  return match?.value ?? 'custom'
}

export function reframeCutCanvas(documentInput: CutProjectDocument, value: CutCanvasAspectPreset): CutProjectDocument {
  const preset = CUT_CANVAS_ASPECT_PRESETS.find((candidate) => candidate.value === value)
  if (!preset) return documentInput
  const document = structuredClone(documentInput)
  const previousWidth = document.settings.width
  const previousHeight = document.settings.height
  const longestEdge = Math.max(previousWidth, previousHeight)
  const ratio = preset.numerator / preset.denominator
  const nextWidth = evenDimension(ratio >= 1 ? longestEdge : longestEdge * ratio)
  const nextHeight = evenDimension(ratio >= 1 ? longestEdge / ratio : longestEdge)
  if (nextWidth === previousWidth && nextHeight === previousHeight) return documentInput
  const widthScale = nextWidth / previousWidth
  const heightScale = nextHeight / previousHeight
  for (const track of document.tracks) {
    if (track.kind !== 'visual') continue
    for (const clip of track.clips) {
      if (!clip.transform) continue
      clip.transform = {
        ...clip.transform,
        x: clip.transform.x * widthScale,
        y: clip.transform.y * heightScale,
        width: clip.transform.width * widthScale,
        height: clip.transform.height * heightScale
      }
    }
  }
  document.settings.width = nextWidth
  document.settings.height = nextHeight
  return document
}

function evenDimension(value: number) {
  return Math.max(2, Math.round(value / 2) * 2)
}
