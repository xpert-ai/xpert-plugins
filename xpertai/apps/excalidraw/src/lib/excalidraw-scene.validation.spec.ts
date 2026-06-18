import { ExcalidrawSceneValidationError, normalizeExcalidrawScene } from './excalidraw-scene.validation.js'

describe('normalizeExcalidrawScene', () => {
  it('accepts valid rectangle, text, and arrow elements', () => {
    const scene = normalizeExcalidrawScene({
      elements: [
        baseElement({ id: 'rect-1', type: 'rectangle' }),
        textElement({ id: 'text-1' }),
        arrowElement({ id: 'arrow-1' })
      ],
      appState: { viewBackgroundColor: '#fff' },
      files: {}
    })

    expect(scene.elements).toHaveLength(3)
    expect(scene.appState).toEqual({ viewBackgroundColor: '#fff' })
  })

  it('rejects elements with missing type', () => {
    expect(() => normalizeExcalidrawScene({ elements: [baseElement({ type: undefined })] })).toThrow(ExcalidrawSceneValidationError)
  })

  it('rejects non-finite geometry', () => {
    expect(() => normalizeExcalidrawScene({ elements: [baseElement({ x: Number.NaN })] })).toThrow(/x must be a finite number/)
  })

  it('rejects duplicate element ids', () => {
    expect(() =>
      normalizeExcalidrawScene({
        elements: [baseElement({ id: 'same' }), baseElement({ id: 'same', x: 100 })]
      })
    ).toThrow(/duplicated/)
  })

  it('rejects image elements with missing file records', () => {
    expect(() =>
      normalizeExcalidrawScene({
        elements: [imageElement({ id: 'image-1', fileId: 'file-1' })],
        files: {}
      })
    ).toThrow(/does not exist in files/)
  })

  it('rejects invalid type-specific fields', () => {
    expect(() =>
      normalizeExcalidrawScene({
        elements: [textElement({ originalText: undefined })]
      })
    ).toThrow(/originalText must be a string/)
  })
})

function baseElement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'element-1',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...overrides
  }
}

function textElement(overrides: Record<string, unknown> = {}) {
  return {
    ...baseElement({ type: 'text', width: 80, height: 24 }),
    fontSize: 20,
    fontFamily: 5,
    text: 'Hello',
    textAlign: 'left',
    verticalAlign: 'top',
    containerId: null,
    originalText: 'Hello',
    autoResize: true,
    lineHeight: 1.25,
    ...overrides
  }
}

function arrowElement(overrides: Record<string, unknown> = {}) {
  return {
    ...baseElement({ type: 'arrow', width: 100, height: 0 }),
    points: [
      [0, 0],
      [100, 0]
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: 'arrow',
    elbowed: false,
    ...overrides
  }
}

function imageElement(overrides: Record<string, unknown> = {}) {
  return {
    ...baseElement({ type: 'image', width: 120, height: 80 }),
    fileId: null,
    status: 'saved',
    scale: [1, 1],
    crop: null,
    ...overrides
  }
}
