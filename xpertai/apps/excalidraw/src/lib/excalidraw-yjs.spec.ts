import * as Y from 'yjs'
import { createExcalidrawYDoc, materializeExcalidrawYDoc, writeExcalidrawSceneToYDoc } from './excalidraw-yjs.js'

const initialScene = {
  elements: [
    { id: 'a', type: 'rectangle', x: 10, y: 20 },
    { id: 'b', type: 'text', x: 50, y: 60, text: 'Before' }
  ],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {},
  mermaidSource: null
}

describe('Excalidraw Yjs schema', () => {
  it('materializes a stable scene and ignores identical rewrites', () => {
    const doc = createExcalidrawYDoc(initialScene)
    const vector = Y.encodeStateVector(doc)

    writeExcalidrawSceneToYDoc(doc, initialScene, 'test:identical')

    expect(Y.encodeStateAsUpdate(doc, vector)).toHaveLength(2)
    expect(materializeExcalidrawYDoc(doc)).toEqual(initialScene)
  })

  it('merges concurrent edits to different element ids', () => {
    const source = createExcalidrawYDoc(initialScene)
    const snapshot = Y.encodeStateAsUpdate(source)
    const left = new Y.Doc()
    const right = new Y.Doc()
    Y.applyUpdate(left, snapshot)
    Y.applyUpdate(right, snapshot)
    const leftVector = Y.encodeStateVector(left)
    const rightVector = Y.encodeStateVector(right)

    writeExcalidrawSceneToYDoc(left, {
      ...initialScene,
      elements: [{ ...initialScene.elements[0], x: 100 }, initialScene.elements[1]]
    }, 'client:left')
    writeExcalidrawSceneToYDoc(right, {
      ...initialScene,
      elements: [initialScene.elements[0], { ...initialScene.elements[1], text: 'After' }]
    }, 'client:right')

    const leftUpdate = Y.encodeStateAsUpdate(left, leftVector)
    const rightUpdate = Y.encodeStateAsUpdate(right, rightVector)
    Y.applyUpdate(left, rightUpdate)
    Y.applyUpdate(right, leftUpdate)

    const leftScene = materializeExcalidrawYDoc(left)
    expect(materializeExcalidrawYDoc(right)).toEqual(leftScene)
    expect(leftScene.elements).toEqual([
      { id: 'a', type: 'rectangle', x: 100, y: 20 },
      { id: 'b', type: 'text', x: 50, y: 60, text: 'After' }
    ])
  })

  it('preserves explicit order and removes deleted elements and files', () => {
    const doc = createExcalidrawYDoc({
      ...initialScene,
      files: { image: { id: 'image', dataURL: 'data:image/png;base64,AA==' } }
    })
    writeExcalidrawSceneToYDoc(doc, {
      ...initialScene,
      elements: [initialScene.elements[1]],
      files: {}
    })

    expect(materializeExcalidrawYDoc(doc)).toEqual({
      ...initialScene,
      elements: [initialScene.elements[1]],
      files: {}
    })
  })
})
