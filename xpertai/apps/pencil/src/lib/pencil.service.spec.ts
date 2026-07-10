import 'reflect-metadata'

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
    private sequence = 0

    constructor() {
      this.nodes.set('root', { id: 'root', type: 'ROOT', name: 'Document', parentId: null, childIds: ['page-1'] })
      this.nodes.set('page-1', { id: 'page-1', type: 'CANVAS', name: 'Page 1', parentId: 'root', childIds: [] })
    }

    getPages() {
      return Array.from(this.nodes.values()).filter((node) => node.type === 'CANVAS')
    }

    createNode(type: string, parentId: string, overrides: Record<string, unknown> = {}) {
      const id = `rendered-${++this.sequence}`
      const node = { id, type, name: type, parentId, childIds: [], ...overrides }
      this.nodes.set(id, node)
      const parent = this.nodes.get(parentId)
      if (parent) {
        const childIds = Array.isArray(parent.childIds) ? parent.childIds : []
        parent.childIds = [...childIds, id]
      }
      return node
    }
  }

  return { SceneGraph: MockSceneGraph }
})

jest.mock('@open\u002dpencil/core', () => ({
  BUILTIN_IO_FORMATS: [],
  computeAllLayouts: jest.fn(),
  SceneGraph: class MockCoreSceneGraph {
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
    private sequence = 0

    constructor() {
      this.nodes.set('root', { id: 'root', type: 'FRAME', name: 'Document', parentId: null, childIds: ['page-1'] })
      this.nodes.set('page-1', { id: 'page-1', type: 'CANVAS', name: 'Page 1', parentId: 'root', childIds: [] })
    }

    addPage(name: string) {
      return this.createNode('CANVAS', this.rootId, { name, width: 0, height: 0 })
    }

    getPages() {
      return Array.from(this.nodes.values()).filter((node) => node.type === 'CANVAS')
    }

    createNode(type: string, parentId: string, overrides: Record<string, unknown> = {}) {
      const id = `sample-${++this.sequence}`
      const node = {
        id,
        type,
        name: type,
        parentId,
        childIds: [],
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        fills: [],
        strokes: [],
        effects: [],
        opacity: 1,
        visible: true,
        locked: false,
        layoutMode: 'NONE',
        layoutWrap: 'NO_WRAP',
        primaryAxisAlign: 'MIN',
        counterAxisAlign: 'MIN',
        primaryAxisSizing: 'FIXED',
        counterAxisSizing: 'FIXED',
        itemSpacing: 0,
        counterAxisSpacing: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        layoutPositioning: 'AUTO',
        layoutGrow: 0,
        layoutAlignSelf: 'AUTO',
        gridTemplateColumns: [],
        gridTemplateRows: [],
        gridColumnGap: 0,
        gridRowGap: 0,
        gridPosition: null,
        text: '',
        fontSize: 14,
        fontFamily: 'Inter',
        fontWeight: 400,
        ...overrides
      }
      this.nodes.set(id, node)
      const parent = this.nodes.get(parentId)
      if (parent) {
        const childIds = Array.isArray(parent.childIds) ? parent.childIds : []
        parent.childIds = [...childIds, id]
      }
      return node
    }

    updateNode(id: string, changes: Record<string, unknown>) {
      const node = this.nodes.get(id)
      if (node) {
        Object.assign(node, changes)
      }
    }
  },
  FigmaAPI: class MockFigmaAPI {
    constructor(readonly graph: unknown) {}
	  },
	  IORegistry: class MockIORegistry {
	    async writeDocument(_format: string, graph: { nodes?: Map<string, Record<string, unknown>> }) {
	      const nodes = graph.nodes instanceof Map ? Array.from(graph.nodes.values()) : []
	      if (nodes.some((node) => node.counterAxisAlign === 'STRETCH')) {
	        throw new Error('Unsanitized StackAlign')
	      }
	      return { format: 'fig', mimeType: 'application/octet-stream', extension: 'fig', data: new Uint8Array([1]) }
	    }
    async exportContent() {
      return { format: 'svg', mimeType: 'image/svg+xml', extension: 'svg', data: '<svg></svg>', encoding: 'utf8' }
    }
  },
  parseFigFile: jest.fn(async () => ({ nodes: new Map(), images: new Map(), variables: new Map(), variableCollections: new Map(), activeMode: new Map(), instanceIndex: new Map(), rootId: 'root', figKiwiVersion: null, figSchemaDeflated: null, documentColorSpace: 'srgb', getPages: () => [] })),
  parsePenFile: jest.fn(() => ({ nodes: new Map(), images: new Map(), variables: new Map(), variableCollections: new Map(), activeMode: new Map(), instanceIndex: new Map(), rootId: 'root', figKiwiVersion: null, figSchemaDeflated: null, documentColorSpace: 'srgb', getPages: () => [] }))
}))

jest.mock('@open\u002dpencil/core/tools', () => ({
  CORE_TOOLS: [
    {
      name: 'render',
      description: 'Render JSX',
      mutates: true,
      params: {
        parent_id: { type: 'string', description: 'Parent node' },
        jsx: { type: 'string', description: 'JSX source', required: true }
      },
      execute: jest.fn(async (figma: { graph: { getPages(): Array<{ id: string }>; createNode(type: string, parentId: string, overrides: Record<string, unknown>): Record<string, unknown> } }, args: Record<string, unknown>) => {
        const jsx = typeof args.jsx === 'string' ? args.jsx : ''
        if (jsx.includes('BROKEN')) {
          throw new Error('Unexpected token (11:3)')
        }
        if (jsx.includes('RUNTIME_FAILURE')) {
          throw new Error('Scene graph renderer is unavailable')
        }
        const parentId = typeof args.parent_id === 'string' ? args.parent_id : figma.graph.getPages()[0]?.id
        return figma.graph.createNode('FRAME', parentId, { name: 'Rendered region' })
      })
    }
  ],
  EXTENDED_TOOLS: []
}))

import { PencilService } from './pencil.service.js'
import { PencilActionLog, PencilDocument, PencilDocumentVersion } from './entities/index.js'
import { createEmptyPencilGraphSnapshot } from './pencil-graph.js'
import type { PencilPendingRenderDraft, PencilScope } from './types.js'
import type { Repository } from 'typeorm'

type FakeEntity = {
  id?: string
  createdAt?: Date
  updatedAt?: Date
  versionNumber?: number
}

type FakeFindOptions<T extends FakeEntity> = {
  where?: Partial<T>
  select?: Partial<Record<keyof T, boolean>>
  order?: {
    updatedAt?: 'ASC' | 'DESC'
    versionNumber?: 'ASC' | 'DESC'
    createdAt?: 'ASC' | 'DESC'
  }
  take?: number
}

class FakeRepository<T extends FakeEntity> {
  records: T[] = []
  private sequence = 0

  create(input: Partial<T>) {
    return { ...input } as T
  }

  async save(entity: T) {
    if (!entity.id) {
      entity.id = `${this.constructor.name}-${++this.sequence}`
      entity.createdAt = entity.createdAt ?? new Date()
    }
    entity.updatedAt = new Date()
    const index = this.records.findIndex((item) => item.id === entity.id)
    if (index >= 0) {
      this.records[index] = { ...this.records[index], ...entity }
    } else {
      this.records.push(entity)
    }
    return entity
  }

  async find(options: FakeFindOptions<T> = {}) {
    const filtered = this.records.filter((record) => matchesWhere(record, options.where ?? {}))
    if (options.order?.updatedAt === 'DESC') {
      filtered.sort((left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
    }
    if (options.order?.versionNumber === 'DESC') {
      filtered.sort((left, right) => Number(right.versionNumber ?? 0) - Number(left.versionNumber ?? 0))
    }
    if (options.order?.createdAt === 'DESC') {
      filtered.sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
    }
    const limited = typeof options.take === 'number' ? filtered.slice(0, options.take) : filtered
    return limited.map((record) => applyFakeSelect(record, options.select))
  }

  async findOne(options: FakeFindOptions<T> = {}) {
    return (await this.find(options))[0] ?? null
  }

  async delete(where: Partial<T>) {
    const before = this.records.length
    this.records = this.records.filter((record) => !matchesWhere(record, where ?? {}))
    return { affected: before - this.records.length }
  }

  async update(where: Partial<T>, changes: Partial<T>) {
    let affected = 0
    this.records = this.records.map((record) => {
      if (!matchesWhere(record, where)) {
        return record
      }
      affected += 1
      return { ...record, ...changes, updatedAt: new Date() }
    })
    return { affected }
  }
}

describe('PencilService', () => {
  let documentRepository: FakeRepository<PencilDocument>
  let versionRepository: FakeRepository<PencilDocumentVersion>
  let logRepository: FakeRepository<PencilActionLog>
  let service: PencilService

  beforeEach(() => {
    documentRepository = new FakeRepository<PencilDocument>()
    versionRepository = new FakeRepository<PencilDocumentVersion>()
    logRepository = new FakeRepository<PencilActionLog>()
    service = new PencilService(
      asRepository(documentRepository),
      asRepository(versionRepository),
      asRepository(logRepository)
    )
  })

  it('creates scoped documents and saves versions', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Product settings',
      kind: 'wireframe'
    })

    expect(created.item.title).toBe('Product settings')
    expect(created.item.tenantId).toBe(scope.tenantId)
    expect(created.item.organizationId).toBe(scope.organizationId)
    expect(created.snapshotSummary.nodeCount).toBeGreaterThan(0)

    const saved = await service.saveVersion(scope, {
      documentId: created.item.id,
      changeSummary: 'Initial version'
    })

    expect(saved.version.versionNumber).toBe(1)
    expect(saved.document.currentVersionNumber).toBe(1)
    expect(versionRepository.records).toHaveLength(1)
    expect(logRepository.records.some((log) => log.action === 'version_saved')).toBe(true)
  })

  it('renames a scoped document and records the metadata change', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Untitled Pencil Design'
    })

    const renamed = await service.renameDocument(scope, {
      documentId: created.item.id,
      title: 'Modern website design'
    })

    expect(renamed.document.title).toBe('Modern website design')
    expect(documentRepository.records[0].title).toBe('Modern website design')
    expect(logRepository.records).toContainEqual(
      expect.objectContaining({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        action: 'document_renamed'
      })
    )
  })

	  it('creates a versioned sample data case with complex layout nodes', async () => {
    const scope = testScope()
    const created = await service.createSampleDocument(scope, {
      title: 'Q3 Revenue Case'
    })

    expect(created.item.title).toBe('Q3 Revenue Case')
    expect(created.item.kind).toBe('prototype')
    expect(created.item.currentVersionNumber).toBe(1)
    expect(created.snapshotSummary.nodeCount).toBeGreaterThan(30)
    expect(versionRepository.records).toHaveLength(1)
    expect(logRepository.records.some((log) => log.action === 'sample_document_created')).toBe(true)

    const nodes = created.graphSnapshot?.nodes.map(([, node]) => node) ?? []
    expect(nodes.some((node) => node.layoutMode === 'GRID')).toBe(true)
    expect(nodes.some((node) => node.layoutWrap === 'WRAP')).toBe(true)
	    expect(nodes.some((node) => node.layoutPositioning === 'ABSOLUTE')).toBe(true)
	  })

	  it('exports sample documents with a fig-compatible graph copy', async () => {
	    const scope = testScope()
	    const created = await service.createSampleDocument(scope, {
	      title: 'Exportable Revenue Case'
	    })

	    const exported = await service.exportDocument(scope, {
	      documentId: created.item.id,
	      format: 'fig',
	      writeToWorkspace: false
	    })

	    expect(exported.size).toBeGreaterThan(0)
	    expect(exported.inline).toBeTruthy()
	    const persistedNodes = created.graphSnapshot?.nodes.map(([, node]) => node) ?? []
	    expect(persistedNodes.some((node) => node.counterAxisAlign === 'STRETCH')).toBe(true)
	  })

  it('scopes reads by tenant and organization', async () => {
    const created = await service.createDocument(testScope({ tenantId: 'tenant-a', organizationId: 'org-a' }), {
      title: 'Private design'
    })

    await expect(
      service.getDocument(testScope({ tenantId: 'tenant-b', organizationId: 'org-a' }), {
        documentId: created.item.id
      })
    ).rejects.toThrow('Pencil document was not found')
  })

  it('retains invalid render JSX and commits a small patch as one working-copy revision', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, { title: 'Recoverable design' })
    const initialRevision = created.item.workingCopyRevision

    const failed = await service.executeCoreTool(scope, {
      documentId: created.item.id,
      toolName: 'render',
      args: {
        parent_id: 'page-1',
        jsx: '<Frame>\nBROKEN\n</Frame>'
      },
      changeSummary: 'Render hero region'
    })

    expect(failed).toEqual(
      expect.objectContaining({
        success: false,
        recoverable: true,
        renderDraftRevision: 1,
        diagnostic: expect.objectContaining({ code: 'JSX_PARSE_ERROR', line: 2 })
      })
    )
    if (!('renderDraftId' in failed)) {
      throw new Error('Recoverable render failure did not return a draft identifier')
    }
    expect(documentRepository.records[0].workingCopyRevision).toBe(initialRevision)
    expect(documentRepository.records[0].pendingRenderDraft).toEqual(
      expect.objectContaining({ id: failed.renderDraftId, status: 'active', revision: 1 })
    )

    const committed = await service.patchRenderDraft(scope, {
      documentId: created.item.id,
      draftId: failed.renderDraftId,
      expectedRevision: 1,
      edits: [{ oldText: 'BROKEN', newText: '<Text>Recovered</Text>' }],
      changeSummary: 'Repair hero region'
    })

    expect(committed).toEqual(
      expect.objectContaining({
        success: true,
        renderDraftRevision: 2,
        renderDraftStatus: 'committed'
      })
    )
    expect(documentRepository.records[0].workingCopyRevision).toBe((initialRevision ?? 0) + 1)
    expect(documentRepository.records[0].pendingRenderDraft).toBeNull()
    expect(logRepository.records.some((log) => log.action === 'render_draft_committed')).toBe(true)
  })

  it('keeps only the latest recoverable render draft for a document', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, { title: 'Single draft design' })
    const first = await service.executeCoreTool(scope, {
      documentId: created.item.id,
      toolName: 'render',
      args: { jsx: '<Frame>\nBROKEN first\n</Frame>' }
    })
    const second = await service.executeCoreTool(scope, {
      documentId: created.item.id,
      toolName: 'render',
      args: { jsx: '<Frame>\nBROKEN second\n</Frame>' }
    })
    if (!('renderDraftId' in first) || !('renderDraftId' in second)) {
      throw new Error('Recoverable render failure did not return a draft identifier')
    }

    expect(second.renderDraftId).not.toBe(first.renderDraftId)
    expect(documentRepository.records[0].pendingRenderDraft).toEqual(
      expect.objectContaining({ id: second.renderDraftId, revision: 1 })
    )
    await expect(
      service.patchRenderDraft(scope, {
        documentId: created.item.id,
        draftId: first.renderDraftId,
        expectedRevision: 1,
        edits: [{ oldText: 'BROKEN', newText: 'fixed' }]
      })
    ).rejects.toThrow('Pencil render draft was not found')
  })

  it('rejects stale or ambiguous render draft patches without changing the document', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, { title: 'Patch conflict design' })
    const failed = await service.executeCoreTool(scope, {
      documentId: created.item.id,
      toolName: 'render',
      args: { jsx: '<Frame>\nBROKEN BROKEN\n</Frame>' }
    })
    if (!('renderDraftId' in failed)) {
      throw new Error('Recoverable render failure did not return a draft identifier')
    }

    await expect(
      service.patchRenderDraft(scope, {
        documentId: created.item.id,
        draftId: failed.renderDraftId,
        expectedRevision: 1,
        edits: [{ oldText: 'BROKEN', newText: 'fixed' }]
      })
    ).rejects.toThrow('matched more than once')

    const stillInvalid = await service.patchRenderDraft(scope, {
      documentId: created.item.id,
      draftId: failed.renderDraftId,
      expectedRevision: 1,
      edits: [{ oldText: 'BROKEN BROKEN', newText: 'BROKEN' }]
    })
    expect(stillInvalid).toEqual(expect.objectContaining({ success: false, renderDraftRevision: 2 }))
    await expect(
      service.patchRenderDraft(scope, {
        documentId: created.item.id,
        draftId: failed.renderDraftId,
        expectedRevision: 1,
        edits: [{ oldText: 'BROKEN', newText: 'fixed' }]
      })
    ).rejects.toThrow('current revision is 2')
  })

  it('does not misclassify a render runtime failure as a source repair', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, { title: 'Runtime failure design' })
    const initialRevision = created.item.workingCopyRevision
    const failed = await service.executeCoreTool(scope, {
      documentId: created.item.id,
      toolName: 'render',
      args: { jsx: '<Frame>\nBROKEN\n</Frame>' }
    })
    if (!('renderDraftId' in failed)) {
      throw new Error('Recoverable render failure did not return a draft identifier')
    }

    await expect(
      service.patchRenderDraft(scope, {
        documentId: created.item.id,
        draftId: failed.renderDraftId,
        expectedRevision: 1,
        edits: [{ oldText: 'BROKEN', newText: 'RUNTIME_FAILURE' }]
      })
    ).rejects.toThrow('Scene graph renderer is unavailable')
    expect(documentRepository.records[0].pendingRenderDraft).toEqual(
      expect.objectContaining({ status: 'active', revision: 2 })
    )
    expect(documentRepository.records[0].workingCopyRevision).toBe(initialRevision)
  })

  it('physically deletes only the scoped document aggregate', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, { title: 'Temporary design' })
    await service.saveVersion(scope, { documentId: created.item.id, changeSummary: 'Checkpoint' })
    versionRepository.records.push({
      id: 'foreign-version',
      tenantId: 'foreign-tenant',
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      documentId: created.item.id,
      versionNumber: 99
    } as PencilDocumentVersion)
    logRepository.records.push({
      id: 'foreign-log',
      tenantId: 'foreign-tenant',
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      documentId: created.item.id,
      action: 'failure_reported'
    } as PencilActionLog)
    documentRepository.records[0].pendingRenderDraft = pendingRenderDraft('local-draft')

    const deleted = await service.deleteDocument(scope, created.item.id)

    expect(deleted).toEqual(expect.objectContaining({ deletedDocumentId: created.item.id, deletedVersionCount: 1 }))
    expect(documentRepository.records).toHaveLength(0)
    expect(versionRepository.records).toEqual([expect.objectContaining({ id: 'foreign-version' })])
    expect(logRepository.records).toEqual([expect.objectContaining({ id: 'foreign-log' })])
    await expect(service.deleteDocument(scope, created.item.id)).rejects.toThrow('Pencil document was not found')
  })

  it('restores versions into the working copy', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Restore target'
    })
    const saved = await service.saveVersion(scope, {
      documentId: created.item.id,
      graphSnapshot: createEmptyPencilGraphSnapshot(),
      changeSummary: 'Checkpoint'
    })

    const restored = await service.restoreVersion(scope, created.item.id, saved.version.id, 'Restore checkpoint')

    expect(restored.restoredVersion.id).toBe(saved.version.id)
    expect(restored.workingCopy.documentId).toBe(created.item.id)
    expect(logRepository.records.some((log) => log.action === 'version_restored')).toBe(true)
  })

  it('reports failures with scoped action logs', async () => {
    const scope = testScope()
    await service.reportFailure(scope, {
      operation: 'export svg',
      errorMessage: 'Nothing to export',
      recoverable: true
    })

    expect(logRepository.records[0]).toEqual(
      expect.objectContaining({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        action: 'failure_reported',
        errorMessage: 'Nothing to export'
      })
    )
  })
})

function asRepository<T extends FakeEntity>(repository: FakeRepository<T>) {
  return repository as unknown as Repository<T>
}

function testScope(overrides: Partial<PencilScope> = {}): PencilScope {
  return {
    tenantId: 'tenant',
    organizationId: 'org',
    workspaceId: 'workspace',
    projectId: 'project',
    userId: 'user',
    assistantId: 'assistant',
    conversationId: 'conversation',
    ...overrides
  }
}

function pendingRenderDraft(id: string): PencilPendingRenderDraft {
  return {
    id,
    sourceJsx: '<Frame />',
    normalizedJsx: '<Frame />',
    renderArgs: {},
    revision: 1,
    status: 'active',
    sourceChecksum: id,
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  }
}

/** Simulates TypeORM's select:false behavior for the large pendingRenderDraft JSONB column. */
function applyFakeSelect<T extends FakeEntity>(record: T, select?: Partial<Record<keyof T, boolean>>) {
  const selected = { ...record }
  if (!select || Reflect.get(select, 'pendingRenderDraft') !== true) {
    Reflect.deleteProperty(selected, 'pendingRenderDraft')
  }
  return selected
}

function matchesWhere<T extends FakeEntity>(record: T, where: Partial<T>) {
  return Object.entries(where).every(([key, value]) => {
    const actual = Reflect.get(record, key)
    const rawParameters = readRawFindOperatorParameters(value)
    if (!rawParameters) {
      return actual === value
    }
    if (!isRecord(actual)) {
      return false
    }
    return actual.id === rawParameters.pencilRenderDraftId &&
      actual.revision === rawParameters.pencilRenderDraftRevision &&
      (rawParameters.pencilRenderDraftStatus === undefined || actual.status === rawParameters.pencilRenderDraftStatus)
  })
}

/** Mirrors only the JSONB ownership parameters used by the service's TypeORM Raw predicate. */
function readRawFindOperatorParameters(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || Reflect.get(value, '_type') !== 'raw') {
    return null
  }
  const parameters = Reflect.get(value, '_objectLiteralParameters')
  return isRecord(parameters) ? parameters : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
