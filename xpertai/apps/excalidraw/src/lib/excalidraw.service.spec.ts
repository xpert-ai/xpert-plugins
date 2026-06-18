import { BadRequestException } from '@nestjs/common'
import { summarizeDrawingMutationResult } from './excalidraw-agent-response.js'
import { ExcalidrawService } from './excalidraw.service.js'

describe('ExcalidrawService patchScene', () => {
  let service: ExcalidrawService
  let drawings: MemoryRepository<any>
  let versions: MemoryRepository<any>
  let logs: MemoryRepository<any>

  beforeEach(() => {
    drawings = new MemoryRepository('drawing')
    versions = new MemoryRepository('version')
    logs = new MemoryRepository('log')
    service = new ExcalidrawService(drawings as any, versions as any, logs as any)
  })

  it('applies add, update, and delete operations and saves a new version', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' }), textElement({ id: 'text-1' })],
      appState: {},
      files: {}
    })

    const result = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      updateElements: [{ id: 'rect-1', x: 32 }],
      deleteElementIds: ['text-1'],
      addElements: [baseElement({ id: 'ellipse-1', type: 'ellipse', x: 200 })],
      changeSummary: 'Patch scene'
    })

    expect(result.patch).toEqual({
      addCount: 1,
      updateCount: 1,
      deleteCount: 1,
      addedIds: ['ellipse-1'],
      updatedIds: ['rect-1'],
      deletedIds: ['text-1']
    })
    expect(result.version.versionNumber).toBe(2)
    expect(result.version.elements.map((element: any) => element.id)).toEqual(['rect-1', 'ellipse-1'])
    expect(result.version.elements[0].x).toBe(32)
  })

  it('rejects updates for unknown element ids', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    await expect(
      service.patchScene(testScope(), {
        drawingId: created.item.id,
        updateElements: [{ id: 'missing', x: 10 }]
      })
    ).rejects.toThrow(BadRequestException)
  })

  it('rejects duplicate added ids', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    await expect(
      service.patchScene(testScope(), {
        drawingId: created.item.id,
        addElements: [baseElement({ id: 'new-1' }), baseElement({ id: 'new-1', x: 100 })]
      })
    ).rejects.toThrow(/duplicate/)
  })

  it('rejects no-op patches', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    await expect(
      service.patchScene(testScope(), {
        drawingId: created.item.id,
        updateElements: [{ id: 'rect-1' }]
      })
    ).rejects.toThrow(/did not change/)
  })

  it('rejects element type changes', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    await expect(
      service.patchScene(testScope(), {
        drawingId: created.item.id,
        updateElements: [{ id: 'rect-1', type: 'ellipse' }]
      })
    ).rejects.toThrow(/type/)
  })

  it('returns compact agent metadata by default', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Agent summary target',
      elements: [baseElement({ id: 'rect-1' }), textElement({ id: 'text-1' })],
      appState: { viewBackgroundColor: '#fff' },
      files: { file1: { id: 'file1', dataURL: 'data:image/png;base64,large' } }
    })

    const result = await service.getDrawingForAgent(testScope(), {
      drawingId: created.item.id
    })

    expect(result.item.id).toBe(created.item.id)
    expect(result.currentVersion.elementCount).toBe(2)
    expect(result.currentVersion.fileCount).toBe(1)
    expect(result.scene).toBeUndefined()
    expect(result.versions[0].elements).toBeUndefined()
    expect(result.nextActions).toContain('includeScene=true')
  })

  it('returns a paged scene only when explicitly requested', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Paged scene target',
      elements: [
        baseElement({ id: 'rect-1' }),
        textElement({ id: 'text-1' }),
        baseElement({ id: 'diamond-1', type: 'diamond', x: 220 })
      ],
      appState: { viewBackgroundColor: '#fff' },
      files: { file1: { id: 'file1', dataURL: 'data:image/png;base64,large' } }
    })

    const result = await service.getDrawingForAgent(testScope(), {
      drawingId: created.item.id,
      includeScene: true,
      versionNumber: 1,
      elementOffset: 1,
      elementLimit: 1
    })

    expect(result.scene.version.versionNumber).toBe(1)
    expect(result.scene.elements.map((element: any) => element.id)).toEqual(['text-1'])
    expect(result.scene.returnedElementCount).toBe(1)
    expect(result.scene.totalElementCount).toBe(3)
    expect(result.scene.hasMoreElements).toBe(true)
    expect(result.scene.files).toBeUndefined()
    expect(result.scene.filesOmitted).toBe(true)
  })

  it('summarizes mutation results without returning scene payloads', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Mutation summary target',
      elements: [baseElement({ id: 'rect-1' })]
    })
    const patched = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      updateElements: [{ id: 'rect-1', x: 48 }]
    })

    const summary = summarizeDrawingMutationResult(patched as any, 'patched') as any

    expect(summary.success).toBe(true)
    expect(summary.drawing.id).toBe(created.item.id)
    expect(summary.version.versionNumber).toBe(2)
    expect(summary.version.elements).toBeUndefined()
    expect(summary.currentVersion.elements).toBeUndefined()
    expect(summary.patch.updateCount).toBe(1)
  })
})

class MemoryRepository<T extends { id?: string }> {
  private sequence = 0
  private items: T[] = []

  constructor(private readonly prefix: string) {}

  create(value: Partial<T>) {
    return { ...value } as T
  }

  async save(value: Partial<T>) {
    const item = {
      ...value,
      id: value.id ?? `${this.prefix}-${++this.sequence}`
    } as T
    const index = this.items.findIndex((candidate) => candidate.id === item.id)
    if (index >= 0) {
      this.items[index] = { ...this.items[index], ...item }
    } else {
      this.items.push(item)
    }
    return this.items.find((candidate) => candidate.id === item.id) as T
  }

  async find(options: { where?: Partial<T>; order?: Record<string, 'ASC' | 'DESC'> } = {}) {
    const filtered = this.items.filter((item) => matchesWhere(item, options.where))
    const [orderKey, orderDirection] = Object.entries(options.order ?? {})[0] ?? []
    if (orderKey) {
      filtered.sort((left: any, right: any) => {
        const leftValue = left[orderKey]
        const rightValue = right[orderKey]
        if (leftValue === rightValue) {
          return 0
        }
        const direction = orderDirection === 'DESC' ? -1 : 1
        return leftValue > rightValue ? direction : -direction
      })
    }
    return filtered
  }

  async findOne(options: { where?: Partial<T> } = {}) {
    return this.items.find((item) => matchesWhere(item, options.where)) ?? null
  }
}

function matchesWhere<T extends Record<string, unknown>>(item: T, where: Partial<T> = {}) {
  return Object.entries(where).every(([key, value]) => item[key] === value)
}

function testScope() {
  return {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: null,
    projectId: null,
    userId: 'user-1',
    assistantId: 'assistant-1',
    conversationId: 'conversation-1'
  }
}

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
