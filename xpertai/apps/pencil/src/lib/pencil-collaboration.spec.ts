import * as Y from 'yjs'
import {
  createPencilCollaborationDoc,
  decodePencilCollaborationState,
  encodePencilCollaborationState,
  materializePencilCollaborationDoc,
  PENCIL_IMAGE_CHUNK_BYTES,
  replacePencilCollaborationState
} from './pencil-collaboration.js'
import { createEmptyPencilGraphSnapshot } from './pencil-graph.js'

const metadata = {
  title: 'Collaborative design',
  description: 'Shared Pencil document',
  kind: 'design' as const,
  status: 'draft' as const,
  tags: ['shared']
}

describe('Pencil collaboration schema', () => {
  it('round-trips text formatting, document metadata and chunked images', () => {
    const snapshot = createEmptyPencilGraphSnapshot()
    snapshot.nodes.push([
      'text-1',
      {
        id: 'text-1',
        type: 'TEXT',
        name: 'Headline',
        parentId: 'page-1',
        childIds: [],
        text: 'Hello world',
        styleRuns: [{ start: 0, length: 5, style: { fontWeight: 700 } }],
        x: 10,
        y: 20,
        width: 200,
        height: 40
      }
    ])
    ;(snapshot.nodes.find(([id]) => id === 'page-1')?.[1].childIds as string[]).push('text-1')
    const bytes = new Uint8Array(PENCIL_IMAGE_CHUNK_BYTES + 17).map((_, index) => index % 251)
    snapshot.images.push(['image-1', Buffer.from(bytes).toString('base64')])

    const decoded = decodePencilCollaborationState(encodePencilCollaborationState(createPencilCollaborationDoc(snapshot, metadata)))
    const materialized = materializePencilCollaborationDoc(decoded)

    expect(materialized.document).toEqual(metadata)
    expect(materialized.graphSnapshot.images).toEqual(snapshot.images)
    expect(materialized.graphSnapshot.nodes.find(([id]) => id === 'text-1')?.[1]).toEqual(
      expect.objectContaining({ text: 'Hello world', styleRuns: [{ start: 0, length: 5, style: { fontWeight: 700 } }] })
    )
  })

  it('converges field updates from two clients without replacing the graph', () => {
    const snapshot = createEmptyPencilGraphSnapshot()
    const source = createPencilCollaborationDoc(snapshot, metadata)
    const left = decodePencilCollaborationState(encodePencilCollaborationState(source))
    const right = decodePencilCollaborationState(encodePencilCollaborationState(source))
    const leftBefore = Y.encodeStateVector(left)
    const rightBefore = Y.encodeStateVector(right)

    const leftSnapshot = materializePencilCollaborationDoc(left).graphSnapshot
    const rightSnapshot = materializePencilCollaborationDoc(right).graphSnapshot
    const leftPage = leftSnapshot.nodes.find(([id]) => id === 'page-1')?.[1]
    const rightPage = rightSnapshot.nodes.find(([id]) => id === 'page-1')?.[1]
    if (!leftPage || !rightPage) throw new Error('Test page was not found.')
    leftPage.name = 'Renamed remotely'
    rightPage.visible = false
    replacePencilCollaborationState(left, leftSnapshot, metadata, 'left')
    replacePencilCollaborationState(right, rightSnapshot, metadata, 'right')

    const leftUpdate = Y.encodeStateAsUpdate(left, leftBefore)
    const rightUpdate = Y.encodeStateAsUpdate(right, rightBefore)
    Y.applyUpdate(left, rightUpdate)
    Y.applyUpdate(right, leftUpdate)

    expect(Y.encodeStateAsUpdate(left)).toEqual(Y.encodeStateAsUpdate(right))
    const page = materializePencilCollaborationDoc(left).graphSnapshot.nodes.find(([id]) => id === 'page-1')?.[1]
    expect(page).toEqual(expect.objectContaining({ name: 'Renamed remotely', visible: false }))
  })

  it('uses parentId as the deterministic winner for concurrent child membership', () => {
    const snapshot = createEmptyPencilGraphSnapshot()
    snapshot.nodes.push([
      'frame-1',
      { id: 'frame-1', type: 'FRAME', name: 'Frame', parentId: 'page-1', childIds: [], x: 0, y: 0, width: 100, height: 100 }
    ])
    snapshot.nodes.push([
      'rect-1',
      { id: 'rect-1', type: 'RECTANGLE', name: 'Rect', parentId: 'frame-1', childIds: [], x: 0, y: 0, width: 10, height: 10 }
    ])
    ;(snapshot.nodes.find(([id]) => id === 'page-1')?.[1].childIds as string[]).push('frame-1', 'rect-1')
    const doc = createPencilCollaborationDoc(snapshot, metadata)
    const result = materializePencilCollaborationDoc(doc).graphSnapshot
    const pageChildren = result.nodes.find(([id]) => id === 'page-1')?.[1].childIds
    const frameChildren = result.nodes.find(([id]) => id === 'frame-1')?.[1].childIds
    expect(pageChildren).toEqual(['frame-1'])
    expect(frameChildren).toEqual(['rect-1'])
  })
})
