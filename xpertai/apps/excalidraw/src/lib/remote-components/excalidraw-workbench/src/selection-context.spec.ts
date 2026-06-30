import {
  createExcalidrawSelectionClearCommand,
  createExcalidrawSelectionContextCommand,
  createExcalidrawSelectionContextSignature,
  getSelectedElementIds
} from './selection-context.js'

describe('getSelectedElementIds', () => {
  it('reads Excalidraw selectedElementIds object maps', () => {
    expect(getSelectedElementIds({
      selectedElementIds: {
        'rect-1': true,
        'text-1': false,
        'arrow-1': 1
      }
    })).toEqual(['rect-1', 'arrow-1'])
  })

  it('reads array and Map variants and falls back when appState has no selection', () => {
    expect(getSelectedElementIds({ selectedElementIds: [' rect-1 ', 'rect-1', ''] })).toEqual(['rect-1'])
    expect(getSelectedElementIds({ selectedElementIds: new Map([['rect-1', true], ['text-1', false]]) })).toEqual(['rect-1'])
    expect(getSelectedElementIds({}, ['fallback-1'])).toEqual(['fallback-1'])
  })
})

describe('createExcalidrawSelectionContextCommand', () => {
  it('creates assistant context payloads from valid selected elements only', () => {
    const command = createExcalidrawSelectionContextCommand({
      drawing: {
        id: 'drawing-1',
        title: 'Architecture'
      },
      version: {
        id: 'version-2',
        versionNumber: 2
      },
      selectedElementIds: ['rect-1', 'deleted-1', 'missing-1', 'text-1'],
      elements: [
        baseElement({ id: 'rect-1', width: 120, height: 80, groupIds: ['group-1'] }),
        baseElement({ id: 'deleted-1', isDeleted: true }),
        textElement({ id: 'text-1', x: 10, y: 12, text: '核心引擎', containerId: 'rect-1' })
      ],
      isDirty: true,
      capturedAt: '2026-06-21T00:00:00.000Z'
    })

    expect(command).toMatchObject({
      commandKey: 'assistant.context.set',
      payload: {
        key: 'excalidraw',
        env: {
          excalidrawDrawingId: 'drawing-1',
          excalidrawVersionId: 'version-2',
          excalidrawVersionNumber: '2',
          excalidrawSelectedElementIdsJson: JSON.stringify(['rect-1', 'text-1']),
          excalidrawSelectionJson: expect.any(String),
          excalidrawContextJson: expect.any(String),
          excalidrawSceneDirty: 'true'
        },
        context: {
          currentDrawing: {
            drawingId: 'drawing-1',
            title: 'Architecture',
            currentVersionId: 'version-2',
            currentVersionNumber: 2,
            isDirty: true,
            selection: {
              type: 'excalidraw.selection.v1',
              selectedElementIds: ['rect-1', 'text-1'],
              selectedElementCount: 2,
              elements: [
                expect.objectContaining({ id: 'rect-1', type: 'rectangle', groupIds: ['group-1'] }),
                expect.objectContaining({ id: 'text-1', type: 'text', textPreview: '核心引擎', containerId: 'rect-1' })
              ],
              bounds: {
                x: 0,
                y: 0,
                width: 120,
                height: 80
              },
              capturedAt: '2026-06-21T00:00:00.000Z'
            }
          }
        }
      }
    })
    const payload = command.payload as { env: Record<string, string> }
    expect(JSON.parse(payload.env.excalidrawSelectionJson)).toMatchObject({
      type: 'excalidraw.selection.v1',
      selectedElementIds: ['rect-1', 'text-1'],
      selectedElementCount: 2
    })
    expect(JSON.parse(payload.env.excalidrawContextJson)).toMatchObject({
      currentDrawing: {
        drawingId: 'drawing-1',
        currentVersionId: 'version-2',
        isDirty: true,
        selection: {
          selectedElementIds: ['rect-1', 'text-1']
        }
      }
    })
  })

  it('keeps current drawing context when no elements are selected', () => {
    const command = createExcalidrawSelectionContextCommand({
      drawing: {
        id: 'drawing-1',
        title: 'Opened drawing'
      },
      version: {
        id: 'version-1',
        versionNumber: 1
      },
      selectedElementIds: ['missing-1'],
      elements: [],
      isDirty: false
    })

    expect(command).toMatchObject({
      commandKey: 'assistant.context.set',
      payload: {
        key: 'excalidraw',
        env: {
          excalidrawDrawingId: 'drawing-1',
          excalidrawVersionId: 'version-1',
          excalidrawVersionNumber: '1',
          excalidrawSelectedElementIdsJson: '[]',
          excalidrawContextJson: expect.any(String),
          excalidrawSceneDirty: 'false'
        },
        context: {
          currentDrawing: {
            drawingId: 'drawing-1',
            title: 'Opened drawing',
            currentVersionId: 'version-1',
            currentVersionNumber: 1,
            isDirty: false
          }
        }
      }
    })

    const payload = command.payload as { env: Record<string, string> }
    expect(payload.env.excalidrawSelectionJson).toBeUndefined()
    expect(JSON.parse(payload.env.excalidrawContextJson)).toEqual({
      currentDrawing: {
        drawingId: 'drawing-1',
        title: 'Opened drawing',
        currentVersionId: 'version-1',
        currentVersionNumber: 1,
        isDirty: false,
        source: '@xpert-ai/plugin-excalidraw'
      }
    })
  })

  it('clears assistant context when there is no usable drawing', () => {
    expect(createExcalidrawSelectionClearCommand()).toEqual({
      commandKey: 'assistant.context.set',
      payload: {
        key: 'excalidraw',
        clear: true
      }
    })
    expect(createExcalidrawSelectionContextCommand({
      drawing: null,
      version: null,
      selectedElementIds: ['missing-1'],
      elements: [],
      isDirty: false
    })).toEqual(createExcalidrawSelectionClearCommand())
  })

  it('changes signatures when selected refs or dirty state change', () => {
    const baseInput = {
      drawing: { id: 'drawing-1' },
      version: { id: 'version-1', versionNumber: 1 },
      selectedElementIds: ['rect-1'],
      elements: [baseElement({ id: 'rect-1', x: 0 })],
      isDirty: false
    }

    expect(createExcalidrawSelectionContextSignature(baseInput)).not.toEqual(
      createExcalidrawSelectionContextSignature({
        ...baseInput,
        elements: [baseElement({ id: 'rect-1', x: 10 })]
      })
    )
    expect(createExcalidrawSelectionContextSignature(baseInput)).not.toEqual(
      createExcalidrawSelectionContextSignature({
        ...baseInput,
        isDirty: true
      })
    )
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
    isDeleted: false,
    groupIds: [],
    boundElements: null,
    ...overrides
  }
}

function textElement(overrides: Record<string, unknown> = {}) {
  return {
    ...baseElement({ type: 'text', width: 80, height: 24 }),
    text: 'Hello',
    originalText: 'Hello',
    containerId: null,
    ...overrides
  }
}
