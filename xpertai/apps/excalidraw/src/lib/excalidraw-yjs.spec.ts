import * as Y from 'yjs'
import { createExcalidrawYDoc, materializeExcalidrawYDoc, patchExcalidrawCanvasToYDoc, writeExcalidrawSceneToYDoc } from './excalidraw-yjs.js'

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
  it('keeps an Agent addition when the first empty canvas callback arrives after remote sync', () => {
    const empty = { ...initialScene, elements: [] }
    const browser = createExcalidrawYDoc(empty)
    const agent = new Y.Doc()
    Y.applyUpdate(agent, Y.encodeStateAsUpdate(browser))
    writeExcalidrawSceneToYDoc(agent, initialScene, 'agent:add')
    Y.applyUpdate(browser, Y.encodeStateAsUpdate(agent))
    const before = Y.encodeStateVector(browser)

    patchExcalidrawCanvasToYDoc(browser, empty, empty, 'canvas:late-initialization')

    expect(Y.encodeStateAsUpdate(browser, before)).toHaveLength(2)
    expect(materializeExcalidrawYDoc(browser).elements).toEqual(initialScene.elements)
  })

  it('preserves unseen Agent edits and additions while publishing a local edit', () => {
    const doc = createExcalidrawYDoc(initialScene)
    const agentScene = { ...initialScene, elements: [initialScene.elements[0],
      { ...initialScene.elements[1], text: 'Remote' }, { id: 'c', type: 'ellipse', x: 200 }] }
    writeExcalidrawSceneToYDoc(doc, agentScene, 'agent:edit')
    patchExcalidrawCanvasToYDoc(doc, initialScene, {
      ...initialScene, elements: [{ ...initialScene.elements[0], x: 100 }, initialScene.elements[1]]
    }, 'canvas:edit')
    expect(materializeExcalidrawYDoc(doc).elements).toEqual([
      { ...initialScene.elements[0], x: 100 }, agentScene.elements[1], agentScene.elements[2]
    ])
  })

  it('allows an intentional deletion after the canvas has observed the element', () => {
    const doc = createExcalidrawYDoc(initialScene)
    patchExcalidrawCanvasToYDoc(doc, initialScene, { ...initialScene, elements: [] }, 'canvas:delete')
    expect(materializeExcalidrawYDoc(doc).elements).toEqual([])
  })

  it('preserves remote files and source when the local canvas only changes its background', () => {
    const doc = createExcalidrawYDoc(initialScene)
    const remote = { ...initialScene, files: { image: { id: 'image' } }, mermaidSource: 'graph LR; A-->B' }
    writeExcalidrawSceneToYDoc(doc, remote, 'agent:files')
    patchExcalidrawCanvasToYDoc(doc, initialScene, {
      ...initialScene, appState: { viewBackgroundColor: '#000000' }
    }, 'canvas:background')
    expect(materializeExcalidrawYDoc(doc)).toEqual({ ...remote, appState: { viewBackgroundColor: '#000000' } })
  })
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
