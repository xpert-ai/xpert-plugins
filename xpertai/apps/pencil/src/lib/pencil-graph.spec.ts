jest.mock('@open\u002dpencil/core/scene-graph', () => {
  class MockSceneGraph {
    nodes = new Map<string, Record<string, unknown>>()
    images = new Map<string, Uint8Array>()
    variables = new Map<string, Record<string, unknown>>()
    variableCollections = new Map<string, Record<string, unknown>>()
    activeMode = new Map<string, string>()
    instanceIndex = new Map<string, Set<string>>()
    rootId = 'root'
    figKiwiVersion: number | null = null
    figSchemaDeflated: Uint8Array | null = null
    documentColorSpace = 'srgb'

    constructor() {
      this.nodes.set('root', { id: 'root', type: 'ROOT', name: 'Document', parentId: null, childIds: ['page-1'] })
      this.nodes.set('page-1', { id: 'page-1', type: 'CANVAS', name: 'Page 1', parentId: 'root', childIds: [] })
    }

    getPages() {
      return Array.from(this.nodes.values()).filter((node) => node.type === 'CANVAS')
    }
  }

  return { SceneGraph: MockSceneGraph }
})

import { SceneGraph } from '@open\u002dpencil/core/scene-graph'
import {
  checksumGraphSnapshot,
  compactGraphSnapshotForAgent,
  createEmptyPencilGraphSnapshot,
  graphFromSnapshot,
  snapshotFromGraph,
  summarizeGraphSnapshot
} from './pencil-graph.js'

describe('Pencil graph snapshots', () => {
  it('round-trips SceneGraph maps and binary image data', async () => {
    const graph = new SceneGraph()
    graph.images.set('image-hash', new Uint8Array([1, 2, 3, 4]))

    const snapshot = snapshotFromGraph(graph)
    const restored = await graphFromSnapshot(snapshot)

    expect(snapshot.formatVersion).toBe('pencil.scene-graph.v1')
    expect(snapshot.images[0]).toEqual(['image-hash', 'AQIDBA=='])
    expect(restored.rootId).toBe(graph.rootId)
    expect(Array.from(restored.images.get('image-hash') ?? [])).toEqual([1, 2, 3, 4])
    expect(restored.getPages()).toHaveLength(1)
  })

  it('summarizes and checksums stable graph snapshots', () => {
    const snapshot = createEmptyPencilGraphSnapshot()
    const summary = summarizeGraphSnapshot(snapshot)
    const compact = compactGraphSnapshotForAgent(snapshot)

    expect(summary.nodeCount).toBeGreaterThan(0)
    expect(summary.pageCount).toBeGreaterThan(0)
    expect(compact?.nodes.length).toBeGreaterThan(0)
    expect(checksumGraphSnapshot(snapshot)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('repairs page bounds for agent generated snapshots without canvas dimensions', async () => {
    const snapshot = createEmptyPencilGraphSnapshot()
    const page = snapshot.nodes.find(([id]) => id === 'page-1')?.[1]
    if (page) {
      page.childIds = ['frame-1']
    }
    snapshot.nodes.push([
      'frame-1',
      {
        id: 'frame-1',
        type: 'FRAME',
        name: 'Generated page',
        parentId: 'page-1',
        childIds: [],
        x: 80,
        y: 72,
        width: 1440,
        height: 1024,
        visible: true
      }
    ])

    const graph = await graphFromSnapshot(snapshot)
    const repairedPage = graph.getPages()[0]

    expect(repairedPage.width).toBe(1520)
    expect(repairedPage.height).toBe(1096)
    expect(repairedPage.visible).toBe(true)
    expect(repairedPage.source.fig.rawNodeFields).toEqual({})
  })

  it('repairs legacy minimal root and page nodes so bounds do not become NaN', async () => {
    const snapshot = createEmptyPencilGraphSnapshot()
    const root = snapshot.nodes.find(([id]) => id === 'root')?.[1]
    const page = snapshot.nodes.find(([id]) => id === 'page-1')?.[1]
    if (root) {
      root.type = 'ROOT'
      delete root.x
      delete root.y
      delete root.width
      delete root.height
      delete root.rotation
    }
    if (page) {
      delete page.x
      delete page.y
      delete page.width
      delete page.height
      delete page.rotation
      page.childIds = ['frame-1']
    }
    snapshot.nodes.push([
      'frame-1',
      {
        id: 'frame-1',
        type: 'FRAME',
        name: 'Generated page',
        parentId: 'page-1',
        childIds: [],
        x: 0,
        y: 0,
        width: 320,
        height: 240,
        visible: true
      }
    ])

    const graph = await graphFromSnapshot(snapshot)
    const repairedRoot = graph.nodes.get('root')
    const repairedPage = graph.nodes.get('page-1')

    expect(repairedRoot?.type).toBe('FRAME')
    expect(repairedRoot?.rotation).toBe(0)
    expect(repairedPage?.rotation).toBe(0)
    expect(graph.getPages()[0].width).toBe(320)
    expect(graph.getPages()[0].height).toBe(240)
  })

  it('keeps auto-layout fields in compact node summaries', () => {
    const snapshot = createEmptyPencilGraphSnapshot()
    snapshot.nodes.push([
      'frame-layout',
      {
        id: 'frame-layout',
        type: 'FRAME',
        name: 'Layout frame',
        parentId: 'page-1',
        childIds: [],
        layoutMode: 'HORIZONTAL',
        layoutWrap: 'WRAP',
        primaryAxisSizing: 'FILL',
        counterAxisSizing: 'HUG',
        itemSpacing: 12,
        paddingLeft: 24,
        layoutGrow: 1,
        gridTemplateColumns: [{ sizing: 'FR', value: 1 }]
      }
    ])

    const compact = compactGraphSnapshotForAgent(snapshot)
    const node = compact?.nodes.find((item) => item.id === 'frame-layout')

    expect(node).toEqual(
      expect.objectContaining({
        layoutMode: 'HORIZONTAL',
        layoutWrap: 'WRAP',
        primaryAxisSizing: 'FILL',
        counterAxisSizing: 'HUG',
        itemSpacing: 12,
        paddingLeft: 24,
        layoutGrow: 1,
        gridTemplateColumns: [{ sizing: 'FR', value: 1 }]
      })
    )
  })
})
