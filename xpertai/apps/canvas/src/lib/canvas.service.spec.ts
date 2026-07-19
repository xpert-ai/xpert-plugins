import 'reflect-metadata'
jest.mock('fractional-indexing', () => ({
  generateKeyBetween: jest.fn(() => 'a1')
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`,
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol.for('XPERT_RUNTIME_CAPABILITIES_TOKEN'),
  CollaborationRuntimeCapability: { id: 'platform.collaboration' }
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
import { CollaborationRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { createCanvasYDoc, encodeCanvasYDoc } from './canvas-yjs.js'
import * as Y from 'yjs'

type FakeEntity = {
  id?: string
  createdAt?: Date
  updatedAt?: Date
  versionNumber?: number
}

type FakeFindOptions<T extends FakeEntity> = {
  where?: Partial<T> | Partial<T>[]
  order?: {
    updatedAt?: 'ASC' | 'DESC'
    versionNumber?: 'ASC' | 'DESC'
    createdAt?: 'ASC' | 'DESC'
    id?: 'ASC' | 'DESC'
  }
  skip?: number
  take?: number
}

class FakeRepository<T extends FakeEntity> {
  records: T[] = []
  private sequence = 0
  manager?: {
    transaction<R>(callback: (manager: { getRepository(): FakeRepository<T> }) => Promise<R>): Promise<R>
  }

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
    const where = options.where ?? {}
    const candidates = Array.isArray(where) ? where : [where]
    const filtered = this.records.filter((record) => candidates.some((candidate) => matchesWhere(record, candidate)))
    if (options.order?.updatedAt === 'DESC') {
      filtered.sort((left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
    }
    if (options.order?.versionNumber === 'DESC') {
      filtered.sort((left, right) => Number(right.versionNumber ?? 0) - Number(left.versionNumber ?? 0))
    }
    if (options.order?.createdAt === 'DESC') {
      filtered.sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
    }
    if (options.order?.id === 'ASC') {
      filtered.sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? '')))
    }
    const start = options.skip ?? 0
    return typeof options.take === 'number' ? filtered.slice(start, start + options.take) : filtered.slice(start)
  }

  async findAndCount(options: FakeFindOptions<T> = {}) {
    const where = options.where ?? {}
    const candidates = Array.isArray(where) ? where : [where]
    const total = this.records.filter((record) => candidates.some((candidate) => matchesWhere(record, candidate))).length
    return [await this.find(options), total] as const
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

class FakeCanvasCollaboration {
  private readonly states = new Map<string, {
    id: string
    resourceId: string
    updateBase64: string
    stateVectorBase64: string
    sequenceNumber: number
    status: 'active' | 'archived' | 'deleted'
  }>()

  constructor(private readonly documents: FakeRepository<CanvasDocument>) {}

  async ensureDocument(input: { resourceId: string }) {
    let state = this.states.get(input.resourceId)
    if (!state) {
      const document = this.documents.records.find((item) => item.id === input.resourceId)
      if (!document) throw new Error('Canvas document was not found for fake collaboration initialization.')
      const encoded = encodeCanvasYDoc(createCanvasYDoc(document.autosaveSnapshot ?? createEmptyCanvasSnapshot()))
      state = {
        id: `collaboration:${input.resourceId}`,
        resourceId: input.resourceId,
        updateBase64: encoded.stateBase64,
        stateVectorBase64: encoded.stateVectorBase64,
        sequenceNumber: document.workingCopyRevision ?? 0,
        status: 'active'
      }
      this.states.set(input.resourceId, state)
    }
    return this.record(state)
  }

  async getDocument(input: { documentId?: string; resourceId?: string }) {
    const state = this.requireState(input)
    return this.record(state)
  }

  async getDocumentState(input: { documentId: string }) {
    const state = this.requireState(input)
    return {
      document: this.record(state),
      updateBase64: state.updateBase64,
      stateVectorBase64: state.stateVectorBase64,
      sequenceNumber: state.sequenceNumber
    }
  }

  async applyUpdate(input: { documentId: string; updateBase64: string; expectedSequence?: number | null }) {
    const state = this.requireState(input)
    if (input.expectedSequence != null && input.expectedSequence !== state.sequenceNumber) {
      throw new Error('Fake collaboration sequence conflict.')
    }
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Buffer.from(state.updateBase64, 'base64'))
    Y.applyUpdate(doc, Buffer.from(input.updateBase64, 'base64'))
    const encoded = encodeCanvasYDoc(doc)
    state.updateBase64 = encoded.stateBase64
    state.stateVectorBase64 = encoded.stateVectorBase64
    state.sequenceNumber += 1
    return {
      documentId: state.id,
      duplicate: false,
      sequenceNumber: state.sequenceNumber,
      stateVectorBase64: state.stateVectorBase64,
      materializationStatus: 'ready' as const
    }
  }

  async createSession(input: { documentId: string; access?: 'read' | 'write' }) {
    const state = this.requireState(input)
    return {
      sessionId: 'session-1', clientKey: 'client-1', documentId: state.id, namespace: '/collaboration',
      connectionUrl: 'http://localhost:3000', access: input.access ?? 'write', expiresAt: Date.now() + 60_000,
      actor: { presenceId: 'user-1', actorType: 'user' as const, displayName: 'Test User', color: '#0f766e', avatarUrl: null }
    }
  }

  async listPresence() { return [] }
  async upsertVirtualPresence() { return null }
  async removeVirtualPresence() {}
  async archiveDocument(input: { documentId?: string; resourceId?: string }) {
    const state = this.requireState(input)
    state.status = 'archived'
    return this.record(state)
  }
  async deleteDocument(input: { documentId?: string; resourceId?: string }) {
    const state = this.requireState(input)
    state.status = 'deleted'
    return this.record(state)
  }

  private requireState(input: { documentId?: string; resourceId?: string }) {
    const state = input.resourceId
      ? this.states.get(input.resourceId)
      : [...this.states.values()].find((item) => item.id === input.documentId)
    if (!state) throw new Error('Fake collaboration document was not found.')
    return state
  }

  private record(state: ReturnType<FakeCanvasCollaboration['requireState']>) {
    return {
      id: state.id,
      providerKey: 'canvas.document',
      resourceId: state.resourceId,
      engine: 'yjs' as const,
      schemaVersion: 1,
      status: state.status,
      sequenceNumber: state.sequenceNumber,
      updateCount: state.sequenceNumber,
      materializedSequence: state.sequenceNumber,
      materializationStatus: 'ready' as const
    }
  }
}

describe('CanvasService', () => {
  let documentRepository: FakeRepository<CanvasDocument>
  let versionRepository: FakeRepository<CanvasDocumentVersion>
  let logRepository: FakeRepository<CanvasActionLog>
  let service: CanvasService

  function createService(runtimeRegistry?: AgentMiddlewareRuntimeCapabilityRegistry) {
    const collaboration = new FakeCanvasCollaboration(documentRepository)
    const externalGet = runtimeRegistry
      ? Reflect.get(runtimeRegistry, 'get') as ((capability: unknown) => unknown) | undefined
      : undefined
    const registry = asRuntimeRegistry({
      get: (capability: unknown) => capability === CollaborationRuntimeCapability
        ? collaboration
        : typeof externalGet === 'function'
          ? externalGet.call(runtimeRegistry, capability)
          : undefined
    })
    return new CanvasService(
      asRepository(documentRepository),
      asRepository(versionRepository),
      asRepository(logRepository),
      registry
    )
  }

  beforeEach(() => {
    documentRepository = new FakeRepository<CanvasDocument>()
    versionRepository = new FakeRepository<CanvasDocumentVersion>()
    logRepository = new FakeRepository<CanvasActionLog>()
    documentRepository.manager = {
      transaction: async (callback) => callback({ getRepository: () => documentRepository })
    }
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
    expect(saved.document.currentVersionNumber).toBe(1)
    expect(saved.version.snapshotSummary.recordCount).toBeGreaterThan(0)
  })

  it('reports a clear error when saving a version without a complete snapshot', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Snapshot required'
    })
    const input = { documentId: created.item.id } as Parameters<CanvasService['saveSnapshot']>[1]

    await expect(service.saveSnapshot(scope, input)).rejects.toThrow(
      'canvas_save_snapshot requires a complete tldraw snapshot'
    )
  })

  it('imports a snapshot into the working copy without creating a version', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, { title: 'Import target' })
    const importedSnapshot = snapshotWithText('Imported working copy', 'shape:imported')

    const imported = await service.importSnapshotToWorkingCopy(scope, {
      documentId: created.item.id,
      snapshot: importedSnapshot,
      sourceType: 'import',
      changeSummary: 'Import into existing canvas'
    })

    expect(imported.document.currentVersionNumber).toBe(0)
    expect(imported.workingCopyRevision).toBe(1)
    expect(versionRepository.records).toHaveLength(0)
    expect(documentRepository.records[0].autosaveSnapshot?.store['shape:imported']).toBeDefined()
    expect(logRepository.records.some((record) => record.action === 'snapshot_imported')).toBe(true)
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

  it('authorizes collaboration only for the exact Xpert-owned Canvas resource', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, { title: 'Scoped collaboration canvas' })
    const baseContext = {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      providerKey: 'canvas.document',
      resourceId: created.item.id,
      operation: 'write' as const
    }

    await expect(service.authorizeCollaborationDocument({ ...baseContext, xpertId: scope.assistantId })).resolves.toBe(true)
    await expect(service.authorizeCollaborationDocument({ ...baseContext, xpertId: 'another-assistant' })).resolves.toBe(false)
  })

  it('patches records and rejects invalid snapshot records', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Patch target',
      snapshot: createEmptyCanvasSnapshot()
    })
    const pageRecord = Object.values(getSnapshotScene(created).store).find((record) => record.typeName === 'page')
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

    expect(result.document.currentVersionNumber).toBe(0)
    expect(versionRepository.records).toHaveLength(0)
    expect(result.autosave.snapshotSummary.recordCount).toBeGreaterThan(0)
    expect(documentRepository.records[0].autosaveSnapshot?.store['shape:test-note']).toBeTruthy()
    await expect(
      service.patchRecords(scope, {
        documentId: created.item.id,
        putRecords: [{ id: '', typeName: 'shape' }]
      })
    ).rejects.toThrow('non-empty id')
  })

  it('applies idempotent Agent stages and uses checksums for targeted updates', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, { title: 'Staged Canvas' })
    const documentId = created.item.id as string
    const firstStage = {
      documentId,
      operationId: 'canvas-stage-operation-1',
      batchId: 'canvas-stage-batch-1',
      stageIndex: 1,
      stageLabel: 'Add the first task',
      isFinalStage: false,
      baseRevision: 0,
      createShapes: [{
        id: 'shape:stage-one',
        type: 'text' as const,
        x: 0,
        y: 0,
        text: 'Stage one'
      }],
      changeSummary: 'Add the first task'
    }

    const applied = await service.applyAgentRecordBatch(scope, firstStage)
    const duplicate = await service.applyAgentRecordBatch(scope, firstStage)

    expect(applied).toEqual(expect.objectContaining({
      duplicate: false,
      workingCopyRevision: 1,
      createdRecordIds: ['shape:stage-one']
    }))
    expect(duplicate).toEqual(expect.objectContaining({
      duplicate: true,
      workingCopyRevision: 1,
      createdRecordIds: ['shape:stage-one']
    }))
    await expect(service.applyAgentRecordBatch(scope, {
      ...firstStage,
      stageLabel: 'Reuse the operation for different content'
    })).rejects.toThrow('[CANVAS_OPERATION_ID_REUSED]')
    expect(logRepository.records.filter((record) => record.action === 'records_patched')).toHaveLength(1)

    const detail = await service.getRecordForAgent(scope, {
      documentId,
      recordId: 'shape:stage-one',
      expectedRevision: 1
    })
    const checksum = detail.record.checksum as string
    const updated = await service.applyAgentRecordBatch(scope, {
      documentId,
      operationId: 'canvas-stage-operation-2',
      batchId: 'canvas-stage-batch-1',
      stageIndex: 2,
      stageLabel: 'Rename the first task',
      isFinalStage: true,
      baseRevision: 1,
      updateRecords: [{
        id: 'shape:stage-one',
        expectedChecksum: checksum,
        patch: { props: { richText: testRichText('Stage two') }, x: 40 }
      }],
      changeSummary: 'Rename the first task'
    })

    expect(updated).toEqual(expect.objectContaining({ workingCopyRevision: 2, updatedRecordIds: ['shape:stage-one'] }))
    expect(documentRepository.records[0].autosaveSnapshot?.store['shape:stage-one']).toEqual(expect.objectContaining({
      x: 40,
      props: expect.objectContaining({ richText: testRichText('Stage two'), color: 'black' })
    }))
    expect(versionRepository.records).toHaveLength(0)
    await expect(service.saveSnapshot(scope, {
      documentId,
      snapshot: documentRepository.records[0].autosaveSnapshot,
      sourceType: 'agent_patch',
      changeSummary: 'Agent must not checkpoint staged work'
    })).rejects.toThrow('human Workbench New Version action')
    const checkpoint = await service.saveSnapshot(scope, {
      documentId,
      snapshot: documentRepository.records[0].autosaveSnapshot,
      sourceType: 'workbench',
      changeSummary: 'Human checkpoint of staged work'
    })
    expect(checkpoint.version).toEqual(expect.objectContaining({ versionNumber: 1 }))
    expect(versionRepository.records[0].snapshot?.store['shape:stage-one']?.props?.richText).toEqual(testRichText('Stage two'))
    await expect(service.applyAgentRecordBatch(scope, {
      documentId,
      operationId: 'canvas-stage-operation-3',
      batchId: 'canvas-stage-batch-1',
      stageIndex: 3,
      stageLabel: 'Apply a stale edit',
      isFinalStage: true,
      baseRevision: 2,
      updateRecords: [{ id: 'shape:stage-one', expectedChecksum: checksum, patch: { x: 80 } }],
      changeSummary: 'Apply a stale edit'
    })).rejects.toThrow('[CANVAS_RECORD_CONFLICT]')
  })

  it('discloses Canvas records through revision-bound cursor pages', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, { title: 'Paged Canvas' })
    const documentId = created.item.id as string
    const shapes = ['alpha', 'beta', 'gamma'].map((name, index) => ({
      id: `shape:${name}`,
      type: 'text' as const,
      x: index * 100,
      y: 0,
      text: name
    }))
    await service.applyAgentRecordBatch(scope, {
      documentId,
      operationId: 'canvas-page-operation-1',
      batchId: 'canvas-page-batch-1',
      stageIndex: 1,
      stageLabel: 'Add paged records',
      isFinalStage: true,
      baseRevision: 0,
      createShapes: shapes,
      changeSummary: 'Add paged records'
    })

    const summary = await service.getDocumentSummaryForAgent(scope, { documentId })
    const firstPage = await service.listRecordsForAgent(scope, {
      documentId,
      expectedRevision: summary.workingCopyRevision,
      typeNames: ['shape'],
      limit: 2
    })
    const secondPage = await service.listRecordsForAgent(scope, {
      documentId,
      expectedRevision: summary.workingCopyRevision,
      typeNames: ['shape'],
      cursor: firstPage.nextCursor as string,
      limit: 2
    })

    expect(summary).not.toHaveProperty('scene')
    expect(summary).not.toHaveProperty('snapshot')
    expect(firstPage.items).toHaveLength(2)
    expect(firstPage.hasMore).toBe(true)
    expect(firstPage.items[0]).not.toHaveProperty('props')
    expect(secondPage.items).toHaveLength(1)
    expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size).toBe(3)
    await expect(service.listRecordsForAgent(scope, {
      documentId,
      expectedRevision: 0,
      typeNames: ['shape']
    })).rejects.toThrow('[CANVAS_REVISION_CONFLICT]')
  })

  it('paginates Canvas document search in the repository', async () => {
    const scope = testScope()
    await service.createDocument(scope, { title: 'Canvas A' })
    await service.createDocument(scope, { title: 'Canvas B' })
    await service.createDocument(scope, { title: 'Canvas C' })

    const result = await service.searchDocuments(scope, { page: 2, pageSize: 2 })

    expect(result.total).toBe(3)
    expect(result.items).toHaveLength(1)
    expect(result.page).toBe(2)
    expect(result.pageSize).toBe(2)
  })

  it('inserts image data URLs, base64 payloads, and records failures', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Image board',
      snapshot: createEmptyCanvasSnapshot()
    })
    const inserted = await service.insertImage(scope, {
      documentId: created.item.id,
      dataUrl: onePixelPng()
    })

    expect(inserted.insertion.assetId).toMatch(/^asset:/)
    expect(inserted.insertion.shapeId).toMatch(/^shape:/)

    const base64Inserted = await service.insertImage(scope, {
      documentId: created.item.id,
      base64: onePixelPngBase64(),
      mimeType: 'image/png'
    })

    expect(base64Inserted.insertion.assetId).toMatch(/^asset:/)
    expect(base64Inserted.insertion.shapeId).toMatch(/^shape:/)
    expect(base64Inserted.document.currentVersionNumber).toBe(0)
    expect(versionRepository.records).toHaveLength(0)
    const imageSummary = await service.getDocumentSummaryForAgent(scope, { documentId: created.item.id })
    const assetDetail = await service.getRecordForAgent(scope, {
      documentId: created.item.id,
      recordId: inserted.insertion.assetId,
      expectedRevision: imageSummary.workingCopyRevision
    })
    expect(assetDetail.record.props?.src).toBe('[redacted:src]')

    await service.reportFailure(scope, {
      documentId: created.item.id,
      operation: 'test',
      errorMessage: 'boom',
      recoverable: true
    })
    expect(logRepository.records.some((log) => log.action === 'failure_reported')).toBe(true)
  })

  it('inserts Seedream workspace images using the provided project scope', async () => {
    const runtime = createWorkspaceRuntime()
    runtime.filesByPath.set('files/seedream-aigc/images/generated.png', { buffer: onePixelPngBuffer(), mimeType: 'image/png' })
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Seedream target',
      snapshot: createEmptyCanvasSnapshot()
    })

    const inserted = await service.insertImage(scope, {
      documentId: created.item.id,
      workspaceFilePath: 'files/seedream-aigc/images/generated.png',
      changeSummary: 'Insert Seedream result'
    })
    const detail = await service.getDocument(scope, {
      documentId: created.item.id,
      includeSnapshot: true
    })
    const asset = getSnapshotScene(detail).store[inserted.insertion.assetId]

    expect(runtime.reads[0]).toEqual(expect.objectContaining({ catalog: 'projects', scopeId: scope.projectId }))
    expect(asset?.props?.src).toEqual(expect.stringMatching(/^data:image\/png;base64,/))
    expect(inserted.document.currentVersionNumber).toBe(0)
    expect(detail.sceneSource).toBe('autosave')
    expect(versionRepository.records).toHaveLength(0)
  })

  it('falls back to the xpert workspace scope when no project scope is available', async () => {
    const runtime = createWorkspaceRuntime()
    runtime.filesByPath.set('files/seedream-aigc/images/xpert-generated.png', { buffer: onePixelPngBuffer(), mimeType: 'image/png' })
    service = createService(runtime.registry)
    const scope = testScope({ projectId: null })
    const created = await service.createDocument(scope, {
      title: 'Xpert scoped target',
      snapshot: createEmptyCanvasSnapshot()
    })

    await service.insertImage(scope, {
      documentId: created.item.id,
      workspaceFilePath: 'files/seedream-aigc/images/xpert-generated.png'
    })

    expect(runtime.reads[0]).toEqual(expect.objectContaining({ catalog: 'xperts', scopeId: scope.assistantId, xpertId: scope.assistantId }))
  })

  it('reports a missing workspace readBuffer capability for workspace image insertion', async () => {
    const runtime = createWorkspaceRuntime()
    const filesWithoutRead = runtime.files as { readBuffer?: CanvasWorkspaceFilesApi['readBuffer'] }
    delete filesWithoutRead.readBuffer
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Missing read capability',
      snapshot: createEmptyCanvasSnapshot()
    })

    await expect(
      service.insertImage(scope, {
        documentId: created.item.id,
        workspaceFilePath: 'files/seedream-aigc/images/generated.png'
      })
    ).rejects.toThrow('readBuffer')
  })

  it('replaces only prior generated images inside the same AI holder', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Holder target',
      snapshot: snapshotWithAiHolderAndImages()
    })

    const inserted = await service.insertImage(scope, {
      documentId: created.item.id,
      dataUrl: onePixelPng(),
      target: {
        shapeId: 'shape:holder',
        width: 512,
        height: 683
      },
      changeSummary: 'Replace holder image'
    })
    const detail = await service.getDocument(scope, {
      documentId: created.item.id,
      includeSnapshot: true
    })
    const store = getSnapshotScene(detail).store
    const newShape = store[inserted.insertion.shapeId]

    expect(store['shape:old-generated']).toBeUndefined()
    expect(store['asset:old-generated']).toBeUndefined()
    expect(store['shape:manual-image']).toBeTruthy()
    expect(store['asset:manual-image']).toBeTruthy()
    expect(newShape?.parentId).toBe('shape:holder')
    expect(newShape?.x).toBe(0)
    expect(newShape?.y).toBe(0)
    expect(newShape?.props?.w).toBe(512)
    expect(newShape?.props?.h).toBe(683)
    expect(inserted.insertion.replacedShapeIds).toEqual(['shape:old-generated'])
    expect(inserted.insertion.replacedAssetIds).toEqual(['asset:old-generated'])
    expect(documentRepository.records).toHaveLength(1)
  })

  it('replaces a selected image shape in place when the target is a normal image', async () => {
    const scope = testScope()
    const snapshot = createEmptyCanvasSnapshot()
    snapshot.store['asset:selected-image'] = imageAssetRecord('asset:selected-image', 'selected.png')
    snapshot.store['shape:selected-image'] = {
      ...imageShapeRecord('shape:selected-image', 'asset:selected-image', 'page:page', { userPlaced: true }),
      x: 120,
      y: 140,
      index: 'a4'
    }
    const created = await service.createDocument(scope, {
      title: 'Replace selected image',
      snapshot
    })

    const inserted = await service.insertImage(scope, {
      documentId: created.item.id,
      dataUrl: onePixelPng(),
      target: {
        shapeId: 'shape:selected-image',
        width: 320,
        height: 480
      },
      changeSummary: 'Replace selected image'
    })
    const detail = await service.getDocument(scope, {
      documentId: created.item.id,
      includeSnapshot: true
    })
    const store = getSnapshotScene(detail).store
    const replacedShape = store['shape:selected-image']

    expect(inserted.insertion.shapeId).toBe('shape:selected-image')
    expect(inserted.insertion.replacedShapeIds).toEqual(['shape:selected-image'])
    expect(inserted.insertion.replacedAssetIds).toEqual(['asset:selected-image'])
    expect(store['asset:selected-image']).toBeUndefined()
    expect(replacedShape?.x).toBe(120)
    expect(replacedShape?.y).toBe(140)
    expect(replacedShape?.index).toBe('a4')
    expect(replacedShape?.props?.assetId).toBe(inserted.insertion.assetId)
    expect(replacedShape?.props?.w).toBe(320)
    expect(replacedShape?.props?.h).toBe(480)
    expect(detail.sceneSource).toBe('autosave')
    expect(versionRepository.records).toHaveLength(0)
  })

  it('inserts an image after adding a default page when the current snapshot has no page record', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Missing page target',
      snapshot: snapshotWithoutPages()
    })

    const inserted = await service.insertImage(scope, {
      documentId: created.item.id,
      dataUrl: onePixelPng(),
      changeSummary: 'Insert into repaired page'
    })
    const detail = await service.getDocument(scope, {
      documentId: created.item.id,
      includeSnapshot: true
    })
    const store = getSnapshotScene(detail).store
    const insertedShape = store[inserted.insertion.shapeId]

    expect(Object.values(store).some((record) => record.typeName === 'page')).toBe(true)
    expect(insertedShape?.type).toBe('image')
    expect(store[insertedShape?.parentId as string]?.typeName).toBe('page')
  })

  it('autosaves a working copy and fixed current snapshot image without creating a version', async () => {
    const runtime = createWorkspaceRuntime()
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Autosave target'
    })
    const draft = snapshotWithText('draft note')
    await service.patchRecords(scope, {
      documentId: created.item.id,
      putRecords: [draft.store['shape:autosave-note']]
    })

    const result = await service.autosaveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: draft,
      viewState: { currentPageId: 'page:page' },
      selectionSummary: { selectedShapeIds: ['shape:autosave-note'] },
      snapshotImage: { dataUrl: onePixelPng(), width: 1, height: 1, pageId: 'page:page' }
    })

    expect(result.document.currentVersionNumber).toBe(0)
    expect(versionRepository.records).toHaveLength(0)
    expect(documentRepository.records[0].autosaveSnapshot?.store['shape:autosave-note']).toBeTruthy()
    expect(result.autosave.workingCopyRevision).toBe(1)
    expect(result.autosave.snapshotChecksum).toMatch(/^[a-f0-9]{64}$/)
    expect(result.autosave.snapshotImagePath).toBe(`files/canvas/documents/${created.item.id}/snapshots/current.png`)
    expect(runtime.uploads).toHaveLength(1)
    expect(runtime.uploads[0]).toEqual(expect.objectContaining({ catalog: 'projects', scopeId: scope.projectId, fileName: 'current.png' }))
  })

  it('does not let a stale full autosave overwrite authoritative collaboration state', async () => {
    const runtime = createWorkspaceRuntime()
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Autosave conflict target'
    })
    const first = await service.autosaveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('frontend draft', 'shape:frontend-note'),
      snapshotImage: { dataUrl: onePixelPng() }
    })
    await service.insertImage(scope, {
      documentId: created.item.id,
      dataUrl: onePixelPng(),
      changeSummary: 'Agent image update'
    })

    const autosaved = await service.autosaveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('stale frontend draft', 'shape:stale-note'),
      snapshotImage: { dataUrl: onePixelPng() },
      baseRevision: first.autosave.workingCopyRevision
    })
    expect(autosaved.autosave.workingCopyRevision).toBeGreaterThan(first.autosave.workingCopyRevision)
    expect(documentRepository.records[0].autosaveSnapshot?.store['shape:stale-note']).toBeUndefined()
    expect(Object.values(documentRepository.records[0].autosaveSnapshot?.store ?? {}).some((record) => record.type === 'image')).toBe(true)
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
    expect(saved.document.snapshotImagePath).toBe(`files/canvas/documents/${created.item.id}/snapshots/current.png`)
    expect(runtime.uploads.map((upload) => upload.fileName)).toContain('current.png')
    expect(runtime.uploads.some((upload) => /^v1-[a-f0-9]{8}\.png$/.test(upload.fileName))).toBe(true)
  })

  it('deletes versions and moves the current version pointer to the latest remaining version', async () => {
    const runtime = createWorkspaceRuntime()
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Version deletion target'
    })
    const first = await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('first', 'shape:first-note'),
      snapshotImage: { dataUrl: onePixelPng() }
    })
    const second = await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('second', 'shape:second-note'),
      snapshotImage: { dataUrl: onePixelPng() }
    })

    const deleted = await service.deleteVersion(scope, created.item.id, second.version.id)
    const detail = await service.getDocument(scope, {
      documentId: created.item.id
    })

    expect(deleted.deletedVersionId).toBe(second.version.id)
    expect(versionRepository.records.map((version) => version.id)).toEqual([first.version.id])
    expect(detail.item.currentVersionId).toBe(first.version.id)
    expect(detail.item.currentVersionNumber).toBe(1)
    expect(logRepository.records.some((log) => log.action === 'version_deleted')).toBe(true)
    expect(runtime.deleted.some((item) => item.filePath === second.version.snapshotImagePath)).toBe(true)
  })

  it('restores a historical version into the working copy without creating a new version', async () => {
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Restore target'
    })
    const first = await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('first', 'shape:first-note')
    })
    const second = await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('second', 'shape:second-note')
    })

    const restored = await service.restoreVersion(scope, created.item.id, first.version.id)
    const detail = await service.getDocument(scope, {
      documentId: created.item.id,
      includeSnapshot: true
    })
    const store = getSnapshotScene(detail).store

    expect(restored.document.currentVersionId).toBe(second.version.id)
    expect(restored.document.currentVersionNumber).toBe(2)
    expect(restored.restoredVersion?.id).toBe(first.version.id)
    expect(versionRepository.records.map((version) => version.id)).toEqual([first.version.id, second.version.id])
    expect(detail.sceneSource).toBe('autosave')
    expect(store['shape:first-note']).toBeTruthy()
    expect(store['shape:second-note']).toBeUndefined()
  })

  it('deletes documents with versions and best-effort workspace image cleanup', async () => {
    const runtime = createWorkspaceRuntime()
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Document deletion target'
    })
    const saved = await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('version', 'shape:version-note'),
      snapshotImage: { dataUrl: onePixelPng() }
    })
    await service.autosaveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('working', 'shape:working-note'),
      snapshotImage: { dataUrl: onePixelPng() },
      baseRevision: saved.document.workingCopyRevision
    })

    const deleted = await service.deleteDocument(scope, created.item.id)

    expect(deleted.deletedDocumentId).toBe(created.item.id)
    expect(documentRepository.records).toHaveLength(0)
    expect(versionRepository.records).toHaveLength(0)
    expect(logRepository.records).toHaveLength(0)
    expect(runtime.deleted.map((item) => item.filePath)).toContain(`files/canvas/documents/${created.item.id}/snapshots/current.png`)
    expect(runtime.deleted.some((item) => item.filePath.includes('/snapshots/versions/v1-'))).toBe(true)
  })

  it('reads autosaved working-copy records by default and historical versions explicitly', async () => {
    const runtime = createWorkspaceRuntime()
    service = createService(runtime.registry)
    const scope = testScope()
    const created = await service.createDocument(scope, {
      title: 'Read target'
    })
    const saved = await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('version text', 'shape:version-note')
    })
    const working = snapshotWithText('working text', 'shape:working-note')
    await service.patchRecords(scope, {
      documentId: created.item.id,
      putRecords: [working.store['shape:working-note']],
      removeRecordIds: ['shape:version-note']
    })
    await service.autosaveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: working,
      snapshotImage: { dataUrl: onePixelPng() },
      baseRevision: saved.document.workingCopyRevision
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
    const saved = await service.saveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: snapshotWithText('A version', 'shape:a-note')
    })
    const working = snapshotWithText('AB working copy', 'shape:ab-note')
    await service.patchRecords(scope, {
      documentId: created.item.id,
      putRecords: [working.store['shape:ab-note']],
      removeRecordIds: ['shape:a-note']
    })
    await service.autosaveSnapshot(scope, {
      documentId: created.item.id,
      snapshot: working,
      snapshotImage: { dataUrl: onePixelPng() },
      baseRevision: saved.document.workingCopyRevision
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

function onePixelPngBase64() {
  return onePixelPng().split(',')[1]
}

function onePixelPngBuffer() {
  return Buffer.from(onePixelPngBase64(), 'base64')
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

function testRichText(text: string): CanvasJsonValue {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
  }
}

function snapshotWithAiHolderAndImages() {
  const snapshot = createEmptyCanvasSnapshot()
  snapshot.store['shape:holder'] = {
    id: 'shape:holder',
    typeName: 'shape',
    type: 'frame',
    parentId: 'page:page',
    x: 100,
    y: 120,
    rotation: 0,
    index: 'a1',
    opacity: 1,
    isLocked: false,
    props: {
      w: 512,
      h: 683,
      name: 'AI image',
      color: 'blue'
    },
    meta: {
      canvasAiImageHolder: true
    }
  } satisfies CanvasRecord
  snapshot.store['asset:old-generated'] = imageAssetRecord('asset:old-generated', 'old-generated.png')
  snapshot.store['shape:old-generated'] = imageShapeRecord('shape:old-generated', 'asset:old-generated', 'shape:holder', {
    canvasGeneratedForAiImageHolder: 'shape:holder'
  })
  snapshot.store['asset:manual-image'] = imageAssetRecord('asset:manual-image', 'manual.png')
  snapshot.store['shape:manual-image'] = imageShapeRecord('shape:manual-image', 'asset:manual-image', 'shape:holder', {
    userPlaced: true
  })
  return snapshot
}

function snapshotWithoutPages() {
  const snapshot = createEmptyCanvasSnapshot()
  for (const [id, record] of Object.entries(snapshot.store)) {
    if (record.typeName === 'page') {
      delete snapshot.store[id]
    }
  }
  return snapshot
}

function imageAssetRecord(id: string, name: string): CanvasRecord {
  return {
    id,
    typeName: 'asset',
    type: 'image',
    props: {
      name,
      src: onePixelPng(),
      w: 1,
      h: 1,
      fileSize: onePixelPngBuffer().byteLength,
      mimeType: 'image/png',
      isAnimated: false
    },
    meta: {}
  }
}

function imageShapeRecord(id: string, assetId: string, parentId: string, meta: CanvasRecord['meta']): CanvasRecord {
  return {
    id,
    typeName: 'shape',
    type: 'image',
    parentId,
    x: 0,
    y: 0,
    rotation: 0,
    index: id.endsWith('manual-image') ? 'a3' : 'a2',
    opacity: 1,
    isLocked: false,
    props: {
      w: 512,
      h: 683,
      assetId,
      playing: true,
      url: '',
      crop: null,
      flipX: false,
      flipY: false,
      altText: id
    },
    meta
  }
}

function getSnapshotScene(detail: Awaited<ReturnType<CanvasService['getDocument']>>): CanvasSnapshotData {
  if (detail.scene && 'store' in detail.scene) {
    return detail.scene
  }
  throw new Error('Expected getDocument(includeSnapshot) to return a full canvas snapshot scene.')
}

function createWorkspaceRuntime() {
  type UploadInput = Parameters<CanvasWorkspaceFilesApi['uploadBuffer']>[0]
  type ReadInput = Parameters<CanvasWorkspaceFilesApi['readBuffer']>[0]
  type DeleteInput = Parameters<CanvasWorkspaceFilesApi['deleteFile']>[0]
  const uploads: UploadInput[] = []
  const reads: ReadInput[] = []
  const deleted: DeleteInput[] = []
  const filesByPath = new Map<string, { buffer: Buffer; mimeType?: string }>()
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
    readBuffer: jest.fn(async (input: ReadInput) => {
      reads.push(input)
      const file = filesByPath.get(input.filePath)
      if (!file) {
        throw new Error(`Missing workspace file: ${input.filePath}`)
      }
      return {
        name: input.filePath.split('/').filter(Boolean).at(-1) ?? input.filePath,
        filePath: input.filePath,
        workspacePath: input.filePath,
        fileUrl: `workspace://${input.catalog}/${input.scopeId}/${input.filePath}`,
        mimeType: file.mimeType,
        size: file.buffer.byteLength,
        catalog: input.catalog,
        scopeId: input.scopeId,
        buffer: file.buffer
      }
    }),
    deleteFile: jest.fn(async (input: DeleteInput) => {
      deleted.push(input)
    })
  }
  return {
    uploads,
    reads,
    deleted,
    filesByPath,
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
