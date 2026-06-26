import 'reflect-metadata'
jest.mock('fractional-indexing', () => ({
  generateKeyBetween: jest.fn(() => 'a1')
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol.for('XPERT_RUNTIME_CAPABILITIES_TOKEN')
}))
jest.mock('tldraw', () => ({
  createTLStore: () => createMockTlStore()
}))

import { CanvasService } from './canvas.service.js'
import { CanvasActionLog, CanvasDocument, CanvasDocumentVersion } from './entities/index.js'
import { createEmptyCanvasSnapshot, normalizeCanvasSnapshot } from './canvas-snapshot.validation.js'
import type { AgentMiddlewareRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import type { CanvasJsonValue, CanvasRecord, CanvasScope, CanvasSnapshotData, CanvasWorkspaceFileRecord, CanvasWorkspaceFilesApi } from './types.js'
import { CANVAS_WORKSPACE_FILES_RUNTIME_CAPABILITY } from './types.js'

type FakeEntity = {
  id?: string
  createdAt?: Date
  updatedAt?: Date
  versionNumber?: number
}

type FakeFindOptions<T extends FakeEntity> = {
  where?: Partial<T>
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
    return typeof options.take === 'number' ? filtered.slice(0, options.take) : filtered
  }

  async findOne(options: FakeFindOptions<T> = {}) {
    return (await this.find(options))[0] ?? null
  }

  async delete(where: Partial<T>) {
    const before = this.records.length
    this.records = this.records.filter((record) => !matchesWhere(record, where ?? {}))
    return { affected: before - this.records.length }
  }
}

describe('CanvasService', () => {
  let documentRepository: FakeRepository<CanvasDocument>
  let versionRepository: FakeRepository<CanvasDocumentVersion>
  let logRepository: FakeRepository<CanvasActionLog>
  let service: CanvasService

  function createService(runtimeRegistry?: AgentMiddlewareRuntimeCapabilityRegistry) {
    return new CanvasService(
      asRepository(documentRepository),
      asRepository(versionRepository),
      asRepository(logRepository),
      runtimeRegistry
    )
  }

  beforeEach(() => {
    documentRepository = new FakeRepository<CanvasDocument>()
    versionRepository = new FakeRepository<CanvasDocumentVersion>()
    logRepository = new FakeRepository<CanvasActionLog>()
    service = createService()
  })

  it('creates scoped documents and saves validated snapshots', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Product moodboard',
      kind: 'moodboard'
    })

    expect(created.item.title).toBe('Product moodboard')
    expect(created.item.tenantId).toBe(scope.tenantId)
    expect(created.item.organizationId).toBe(scope.organizationId)

    const saved = await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: createEmptyCanvasSnapshot(),
      changeSummary: 'Initial board'
    })

    expect(saved.version.versionNumber).toBe(1)
    expect(saved.document.item.currentVersionNumber).toBe(1)
    expect(saved.document.snapshotSummary.recordCount).toBeGreaterThan(0)
  })

  it('scopes reads by tenant and organization', async () => {
    const created = await service.createDocument(testScope({ tenantId: 'tenant-a', organizationId: 'org-a' }), {
      title: 'Private canvas'
    })

    await expect(
      service.getDocument(testScope({ tenantId: 'tenant-b', organizationId: 'org-a' }), {
        documentId: created.item.id
      })
    ).rejects.toThrow('Canvas document was not found')
  })

  it('patches records and rejects invalid snapshot records', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Patch target',
      snapshot: createEmptyCanvasSnapshot()
    })
    const currentVersion = created.currentVersion as CanvasDocumentVersion
    const pageRecord = Object.values(currentVersion.snapshot?.store ?? {}).find((record) => record.typeName === 'page')
    const pageId = pageRecord?.id

    const result = await service.patchRecords(scope, {
      documentId: created.item.id,
      putRecords: [
        {
          id: 'shape:test-note',
          typeName: 'shape',
          type: 'text',
          parentId: pageId,
          x: 10,
          y: 10,
          rotation: 0,
          index: 'a1',
          opacity: 1,
          isLocked: false,
          props: {
            color: 'black',
            size: 'm',
            font: 'draw',
            text: 'Hello',
            autoSize: true,
            w: 120
          },
          meta: {}
        }
      ],
      changeSummary: 'Add note'
    })

    expect(result.version.versionNumber).toBe(2)
    await expect(
      service.patchRecords(scope, {
        documentId: created.item.id,
        putRecords: [{ id: '', typeName: 'shape' }]
      })
    ).rejects.toThrow('non-empty id')
  })

  it('inserts image data URLs and records failures', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Image board',
      snapshot: createEmptyCanvasSnapshot()
    })
    const inserted = await service.insertImage(scope, {
      documentId: created.item.id,
      dataUrl: onePixelPng(),
      fileName: 'sample.png'
    })

    expect(inserted.insertion.assetId).toMatch(/^asset:/)
    expect(inserted.insertion.shapeId).toMatch(/^shape:/)

    await service.reportFailure(scope, {
      documentId: created.item.id,
      operation: 'test',
      errorMessage: 'boom',
      recoverable: true
    })
    expect(logRepository.records.some((log) => log.action === 'failure_reported')).toBe(true)
  })

  it('autosaves a working copy and fixed current snapshot image without creating a version', async () => {
    const runtime = createWorkspaceRuntime()
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Autosave target'
    })

    const result = await service.autosaveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('draft note'),
      viewState: { currentPageId: 'page:page' },
      selectionSummary: { selectedShapeIds: ['shape:autosave-note'] },
      snapshotImage: { dataUrl: onePixelPng(), width: 1, height: 1, pageId: 'page:page' }
    })

    expect(result.document.item.currentVersionNumber).toBe(0)
    expect(versionRepository.records).toHaveLength(0)
    expect(result.document.workingCopy.snapshot.store['shape:autosave-note']).toBeTruthy()
    expect(result.autosave.snapshotImagePath).toBe(`files/canvas/documents/${created.item.id}/snapshots/current.png`)
    expect(runtime.uploads).toHaveLength(1)
    expect(runtime.uploads[0]).toEqual(expect.objectContaining({ catalog: 'projects', scopeId: scope.projectId, fileName: 'current.png' }))
  })

  it('saves version snapshot images while keeping the fixed current image path on the document', async () => {
    const runtime = createWorkspaceRuntime()
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Version target'
    })

    const saved = await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('version note'),
      snapshotImage: { dataUrl: onePixelPng(), width: 1, height: 1, pageId: 'page:page' },
      changeSummary: 'Snapshot with image'
    })

    expect(saved.version.versionNumber).toBe(1)
    expect(saved.version.snapshotImagePath).toMatch(new RegExp(`^files/canvas/documents/${created.item.id}/snapshots/versions/v1-[a-f0-9]{8}\\.png$`))
    expect(saved.document.item.snapshotImagePath).toBe(`files/canvas/documents/${created.item.id}/snapshots/current.png`)
    expect(runtime.uploads.map((upload) => upload.fileName)).toContain('current.png')
    expect(runtime.uploads.some((upload) => /^v1-[a-f0-9]{8}\.png$/.test(upload.fileName))).toBe(true)
  })

  it('reads autosaved working-copy records by default and historical versions explicitly', async () => {
    const runtime = createWorkspaceRuntime()
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Read target'
    })
    await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('version text', 'shape:version-note')
    })
    await service.autosaveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('working text', 'shape:working-note'),
      snapshotImage: { dataUrl: onePixelPng() }
    })

    const defaultRecord = await service.getRecord(scope, {
      documentId: created.item.id,
      recordId: 'shape:working-note'
    })
    const historicalRecord = await service.getRecord(scope, {
      documentId: created.item.id,
      recordId: 'shape:version-note',
      versionNumber: 1
    })

    expect(defaultRecord.sceneSource).toBe('autosave')
    expect(defaultRecord.record.props?.text).toBe('working text')
    expect(historicalRecord.sceneSource).toBe('version')
    expect(historicalRecord.record.props?.text).toBe('version text')
  })

  it('keeps the autosaved working copy after service recreation', async () => {
    const runtime = createWorkspaceRuntime()
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Restart target'
    })
    await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('A version', 'shape:a-note')
    })
    await service.autosaveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('AB working copy', 'shape:ab-note'),
      snapshotImage: { dataUrl: onePixelPng() }
    })

    service = createService(runtime.registry)
    const detail = await service.getDocument(scope, {
      documentId: created.item.id,
      includeSnapshot: true
    })
    const currentVersion = detail.currentVersion as CanvasDocumentVersion

    expect(detail.sceneSource).toBe('autosave')
    expect(detail.workingCopy?.snapshot?.store['shape:ab-note']?.props?.text).toBe('AB working copy')
    expect(currentVersion.snapshot?.store['shape:a-note']?.props?.text).toBe('A version')
  })

  it('requires workspace file runtime capability for autosave image storage', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Missing runtime target'
    })

    await expect(
      service.autosaveSnapshot(scope, {
        documentId: created.item.id,
        snapshot: createEmptyCanvasSnapshot(),
        snapshotImage: { dataUrl: onePixelPng() }
      })
    ).rejects.toThrow('workspace file runtime capability')
  })

  it('normalizes tldraw snapshots and rejects malformed values', () => {
    expect(() => normalizeCanvasSnapshot({ nope: true })).toThrow()
  })
})

function testScope(overrides: Partial<CanvasScope> = {}): CanvasScope {
  return {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    userId: 'user-1',
    assistantId: 'assistant-1',
    conversationId: 'conversation-1',
    ...overrides
  }
}

function matchesWhere<T extends object>(record: T, where: Partial<T>) {
  return Object.entries(where).every(([key, value]) => record[key as keyof T] === value)
}

function onePixelPng() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
}

function snapshotWithText(text: string, shapeId = 'shape:autosave-note') {
  const snapshot = createEmptyCanvasSnapshot()
  snapshot.store[shapeId] = {
    id: shapeId,
    typeName: 'shape',
    type: 'text',
    parentId: 'page:page',
    x: 10,
    y: 10,
    rotation: 0,
    index: 'a1',
    opacity: 1,
    isLocked: false,
    props: {
      color: 'black',
      size: 'm',
      font: 'draw',
      text,
      autoSize: true,
      w: 120
    },
    meta: {}
  } satisfies CanvasRecord
  return snapshot
}

function createWorkspaceRuntime() {
  type UploadInput = Parameters<CanvasWorkspaceFilesApi['uploadBuffer']>[0]
  type DeleteInput = Parameters<CanvasWorkspaceFilesApi['deleteFile']>[0]
  const uploads: UploadInput[] = []
  const deleted: DeleteInput[] = []
  const files: CanvasWorkspaceFilesApi = {
    uploadBuffer: jest.fn(async (input: UploadInput): Promise<CanvasWorkspaceFileRecord> => {
      uploads.push(input)
      return {
        filePath: `${input.folder}/${input.fileName}`,
        fileUrl: `workspace://${input.catalog}/${input.scopeId}/${input.folder}/${input.fileName}`,
        mimeType: input.mimeType,
        size: input.size,
        catalog: input.catalog,
        scopeId: input.scopeId
      }
    }),
    deleteFile: jest.fn(async (input: DeleteInput) => {
      deleted.push(input)
    })
  }
  return {
    uploads,
    deleted,
    files,
    registry: asRuntimeRegistry({
      get: jest.fn((name: string) => (name === CANVAS_WORKSPACE_FILES_RUNTIME_CAPABILITY ? files : undefined)),
      has: jest.fn((name: string) => name === CANVAS_WORKSPACE_FILES_RUNTIME_CAPABILITY),
      require: jest.fn((name: string) => files)
    })
  }
}

function asRepository<T extends FakeEntity>(repository: FakeRepository<T>): Repository<T> {
  return repository as object as Repository<T>
}

function asRuntimeRegistry(registry: object): AgentMiddlewareRuntimeCapabilityRegistry {
  return registry as object as AgentMiddlewareRuntimeCapabilityRegistry
}

function createMockTlStore() {
  const records = new Map<string, CanvasRecord>()
  return {
    getStoreSnapshot: () => ({
      schema: { mock: true },
      store: {
        'document:document': { id: 'document:document', typeName: 'document', name: '' },
        'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1' }
      }
    }),
    migrateSnapshot: (snapshot: object) => snapshot,
    put: (items: CanvasRecord[]) => {
      for (const item of items) {
        if (!item?.id) {
          throw new Error('Missing id')
        }
        records.set(item.id, item)
      }
    },
    get: (id: string) => records.get(id)
  }
}
