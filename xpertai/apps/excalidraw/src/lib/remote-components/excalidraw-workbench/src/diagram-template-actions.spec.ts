import { decideDiagramIrRerender, decideTemplateInstantiation } from './diagram-template-actions.js'

describe('Workbench DiagramIR replacement protection', () => {
  it('creates a new drawing from a template by default', () => {
    expect(decideTemplateInstantiation({ applyToCurrent: false, dirty: true })).toEqual({
      allowed: true, blockReason: null, requiresConfirmation: false
    })
  })

  it('blocks current-drawing replacement while the scene is dirty', () => {
    expect(decideTemplateInstantiation({ applyToCurrent: true, selectedDrawingId: 'drawing-1', dirty: true })).toEqual({
      allowed: false, blockReason: 'dirty', requiresConfirmation: false
    })
  })

  it('requires confirmation for whole-scene template replacement', () => {
    expect(decideTemplateInstantiation({ applyToCurrent: true, selectedDrawingId: 'drawing-1', dirty: false })).toEqual({
      allowed: true, blockReason: null, requiresConfirmation: true
    })
  })

  it('protects dirty IR rerenders and confirms diverged replacement', () => {
    expect(decideDiagramIrRerender({ selectedDrawingId: 'drawing-1', revision: 3, dirty: true, diverged: true }).blockReason).toBe('dirty')
    expect(decideDiagramIrRerender({ selectedDrawingId: 'drawing-1', revision: 3, dirty: false, diverged: true })).toEqual({
      allowed: true, blockReason: null, requiresConfirmation: true
    })
  })
})
