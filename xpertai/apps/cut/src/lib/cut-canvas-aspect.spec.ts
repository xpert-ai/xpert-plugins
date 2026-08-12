import {
  currentCutCanvasAspect,
  reframeCutCanvas
} from './cut-canvas-aspect.js'
import type { CutProjectDocument } from './types.js'

describe('Cut canvas aspect ratio controls', () => {
  it('recognizes common aspect ratios and reframes visual transforms', () => {
    const document: CutProjectDocument = {
      schemaVersion: 1,
      settings: { width: 1920, height: 1080, fps: 30, durationSeconds: 30, background: '#000' },
      tracks: [{
        id: 'visual', name: 'Video', kind: 'visual', muted: false, hidden: false,
        clips: [{
          id: 'clip', type: 'image', name: 'Still', start: 0, duration: 5, trimIn: 0, trimOut: 5,
          transform: { x: 192, y: 108, width: 960, height: 540, rotation: 0, opacity: 1 }
        }]
      }]
    }

    expect(currentCutCanvasAspect(1920, 1080)).toBe('16:9')
    const portrait = reframeCutCanvas(document, '9:16')
    expect(portrait.settings).toMatchObject({ width: 1080, height: 1920 })
    expect(portrait.tracks[0]!.clips[0]!.transform).toMatchObject({ x: 108, y: 192, width: 540, height: 960 })
    expect(document.settings).toMatchObject({ width: 1920, height: 1080 })
  })

  it('keeps the same document instance when the selected ratio already matches', () => {
    const document = {
      schemaVersion: 1 as const,
      settings: { width: 720, height: 1280, fps: 30, durationSeconds: 30, background: '#000' },
      tracks: []
    }
    expect(reframeCutCanvas(document, '9:16')).toBe(document)
    expect(currentCutCanvasAspect(1000, 777)).toBe('custom')
  })
})
