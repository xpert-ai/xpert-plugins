import { revealCanvasContentAfterToolMutation } from './canvas-visibility.js'

describe('canvas content visibility', () => {
  it('fits visible page content after an Agent shape mutation', () => {
    const editor = {
      getCurrentPageBounds: jest.fn(() => ({ x: 100, y: 100, width: 800, height: 450 })),
      zoomToFit: jest.fn()
    }

    expect(revealCanvasContentAfterToolMutation('canvas_patch_records', editor as never)).toBe(true)
    expect(editor.zoomToFit).toHaveBeenCalledWith({ animation: { duration: 220 } })
  })

  it('does not move the camera for metadata tools or an empty page', () => {
    const editor = {
      getCurrentPageBounds: jest.fn(() => undefined),
      zoomToFit: jest.fn()
    }

    expect(revealCanvasContentAfterToolMutation('canvas_update_document_status', editor as never)).toBe(false)
    expect(revealCanvasContentAfterToolMutation('canvas_patch_records', editor as never)).toBe(false)
    expect(editor.zoomToFit).not.toHaveBeenCalled()
  })
})
