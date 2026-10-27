import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository, EntityManager } from 'typeorm'
import { z } from 'zod/v3'
import { ContentResourcesRuntimeCapability, ProjectAccessRuntimeCapability, ProjectFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type ContentDocumentScope, type ContentResourceMutation } from '@xpert-ai/plugin-sdk'
import { OfficeDocument, OfficeSnapshot, OfficeOperation } from '../entities/index.js'
import type { OfficeScope, ExcelAutomationOperation, OfficeSnapshotSource } from '../types.js'
import { blankWorkbook, parseWorkbook, workbookSourceRoot, workbookText, WORKBOOK_MODEL, WORKBOOK_PROVIDER, type NativeWorkbook } from './model.js'
import { editWorkbook, readWorkbookRange } from './operations.js'

const scopeSchema = z.object({ actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() }),
  projectId: z.string().uuid(), assistantId: z.string().min(1).optional() })
export function workbookScope(scope: OfficeScope): ContentDocumentScope {
  const checked = scopeSchema.safeParse({ actor: scope, projectId: scope.projectId, assistantId: scope.assistantId ?? undefined })
  if (!checked.success) throw new ForbiddenException('office.project_required')
  return checked.data as ContentDocumentScope
}
export const workbookWhere = (scope: ContentDocumentScope) => ({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
  projectId: scope.projectId, contentModel: WORKBOOK_MODEL.modelId })
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const titleSchema = z.string().trim().min(1).max(300)
const uuid = z.string().uuid()

/** One native snapshot writer for people, tools and catalog operations. Files are
 * immutable write-before-commit projections; no Yjs/XLSX writer may target this model. */
@Injectable()
export class OfficeWorkbookService {
  private readonly logger = new Logger(OfficeWorkbookService.name)
  constructor(@InjectRepository(OfficeDocument) readonly documents: Repository<OfficeDocument>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  async access(scope: ContentDocumentScope, mode: 'read' | 'write' | 'manage' = 'read') {
    const api = this.runtime.require(ProjectAccessRuntimeCapability)
    const access = scope.assistantId ? await api.assertAssistant({ ...scope, assistantId: scope.assistantId })
      : (await api.listReadable({ actor: scope.actor, projectIds: [scope.projectId] }))[0]
    if (!access) throw new ForbiddenException('office.access_denied')
    if (mode === 'write') await api.assertEdit(scope)
    if (mode === 'manage') await api.assertManage(scope)
    return access
  }
  async require(scope: ContentDocumentScope, id: string, manager = this.documents.manager, includeArchived = false, lock = false) {
    await this.access(scope)
    const document = await manager.getRepository(OfficeDocument).findOne({ where: { ...workbookWhere(scope), id: uuid.parse(id) },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) })
    if (!document || (!includeArchived && document.status === 'archived')) throw new ForbiddenException('office.access_denied')
    return document
  }
  private async snapshot(manager: EntityManager, doc: OfficeDocument) {
    const snapshot = await manager.getRepository(OfficeSnapshot).findOneByOrFail({ id: doc.currentSnapshotId, documentId: doc.id,
      tenantId: doc.tenantId, organizationId: doc.organizationId, projectId: doc.projectId })
    return parseWorkbook(snapshot.snapshot, doc.id)
  }
  async read(scope: ContentDocumentScope, id: string) {
    const access = await this.access(scope), doc = await this.require(scope, id)
    const snapshot = await this.snapshot(this.documents.manager, doc)
    return { documentId: doc.id!, title: doc.title, revision: String(doc.currentVersionNumber), snapshot,
      canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role),
      collaboration: 'versioned' as const, sourcePath: doc.sourceSnapshotPath, sourceHash: doc.sourceSnapshotHash }
  }
  async create(scope: ContentDocumentScope, requestId: string, title: string, copy?: { id: string; revision: string }) {
    await this.access(scope, 'write'); uuid.parse(requestId); title = titleSchema.parse(title)
    const fingerprint = digest({ title, copy: copy ?? null })
    await this.documents.manager.transaction(async manager => {
      // INSERT conflict waits for an in-flight create, without overwriting its head.
      await manager.getRepository(OfficeDocument).createQueryBuilder().insert().values({ ...workbookWhere(scope), id: requestId,
        title, documentType: 'spreadsheet', status: 'active', currentVersionNumber: 0, createRequestHash: fingerprint,
        createdById: scope.actor.userId, lastEditedById: scope.actor.userId, assistantId: scope.assistantId,
        workspaceCatalog: 'projects', workspaceScopeId: scope.projectId }).orIgnore().execute()
      const doc = await this.require(scope, requestId, manager, true, true)
      if (doc.createRequestHash !== fingerprint) throw new ConflictException('office.request_conflict')
      if (doc.currentVersionNumber) return
      let book = blankWorkbook(requestId, title)
      if (copy) {
        const source = await this.require(scope, copy.id, manager, false, true)
        this.assertRevision(source, copy.revision)
        book = { ...await this.snapshot(manager, source), id: requestId, name: title }
      }
      await this.commit(manager, scope, doc, book, 'system')
    })
    await this.register(scope, requestId)
    return this.read(scope, requestId)
  }
  private assertRevision(doc: OfficeDocument, expected: string) {
    if (!expected || String(doc.currentVersionNumber) !== expected) throw new ConflictException('office.version_conflict')
  }
  async save(scope: ContentDocumentScope, id: string, expectedRevision: string, input: unknown, requestId: string) {
    const book = parseWorkbook(input, id)
    return this.write(scope, id, expectedRevision, requestId, { snapshot: book }, () => book, 'workbench')
  }
  async edit(scope: ContentDocumentScope, id: string, expectedRevision: string, operations: ExcelAutomationOperation[], requestId: string) {
    return this.write(scope, id, expectedRevision, requestId, { operations }, current => editWorkbook(current, operations), 'agent')
  }
  private async write(scope: ContentDocumentScope, id: string, expectedRevision: string, requestId: string, intent: object,
    update: (book: NativeWorkbook) => NativeWorkbook, source: OfficeSnapshotSource) {
    await this.access(scope, 'write')
    if (!requestId || requestId.length > 128) throw new BadRequestException('office.request_required')
    const fingerprint = digest({ expectedRevision, intent })
    await this.documents.manager.transaction(async manager => {
      const doc = await this.require(scope, id, manager, false, true)
      await this.access(scope, 'write')
      const operations = manager.getRepository(OfficeOperation), key = `workbook:${requestId}`
      const previous = await operations.findOneBy({ documentId: id, idempotencyKey: key })
      if (previous) {
        if (previous.input !== fingerprint) throw new ConflictException('office.request_conflict')
        return
      }
      this.assertRevision(doc, expectedRevision)
      const book = parseWorkbook(update(await this.snapshot(manager, doc)), id)
      const snapshot = await this.commit(manager, scope, doc, book, source)
      await operations.save(operations.create({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
        projectId: scope.projectId, documentId: id, snapshotId: snapshot.id, operationType: 'excel_automation', source: source === 'agent' ? 'agent' : 'workbench',
        status: 'applied', input: fingerprint, idempotencyKey: key, createdById: scope.actor.userId }))
    })
    const catalogPending = !(await this.register(scope, id))
    return { ...await this.read(scope, id), catalogPending }
  }
  private async commit(manager: EntityManager, scope: ContentDocumentScope, doc: OfficeDocument, book: NativeWorkbook, source: OfficeSnapshotSource) {
    const revision = (doc.currentVersionNumber ?? 0) + 1
    const file = await this.persist(scope, doc.id!, revision, book)
    const snapshots = manager.getRepository(OfficeSnapshot)
    const snapshot = await snapshots.save(snapshots.create({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
      projectId: scope.projectId, documentId: doc.id!, versionNumber: revision, source, snapshot: book,
      snapshotText: workbookText(book).map(section => section.text).join('\n'), createdById: scope.actor.userId }))
    await manager.getRepository(OfficeDocument).save({ ...doc, title: book.name, currentSnapshotId: snapshot.id,
      currentVersionNumber: revision, sourceSnapshotPath: file.path, sourceSnapshotHash: file.sha256,
      lastEditedById: scope.actor.userId, lastEditedAt: new Date() })
    return snapshot
  }
  private async persist(scope: ContentDocumentScope, id: string, revision: number, book: NativeWorkbook) {
    const buffer = Buffer.from(JSON.stringify({ format: WORKBOOK_MODEL.modelId, schemaVersion: 1, documentId: id, revision, workbook: book }))
    const hash = createHash('sha256').update(buffer).digest('hex'), folder = `${workbookSourceRoot(id)}/revisions`
    const path = `${folder}/${revision}-${hash}.json`, files = this.runtime.require(ProjectFilesRuntimeCapability)
    await files.mkdir({ ...scope, path: folder })
    try { await files.write({ ...scope, path, buffer, expectedHash: null }) }
    catch (error) { const stored = await files.read({ ...scope, path }).catch(() => null); if (stored?.sha256 !== hash) throw error }
    return { path, sha256: hash }
  }
  async reconcile(scope: ContentDocumentScope, id: string) {
    await this.access(scope, 'write')
    await this.documents.manager.transaction(async manager => {
      const doc = await this.require(scope, id, manager, true, true)
      const file = await this.persist(scope, id, doc.currentVersionNumber!, await this.snapshot(manager, doc))
      if (file.path !== doc.sourceSnapshotPath || file.sha256 !== doc.sourceSnapshotHash) throw new ConflictException('office.source_conflict')
    })
  }
  async mutate(scope: ContentDocumentScope, id: string, expectedRevision: string, change: ContentResourceMutation) {
    if (change.action === 'duplicate') return (await this.create(scope, change.requestId, change.title, { id, revision: expectedRevision })).documentId
    const mode = change.action === 'trash' || change.action === 'restore' ? 'manage' : 'write'
    await this.access(scope, mode)
    await this.documents.manager.transaction(async manager => {
      const doc = await this.require(scope, id, manager, true, true)
      await this.access(scope, mode); this.assertRevision(doc, expectedRevision)
      const book = await this.snapshot(manager, doc)
      if (change.action === 'rename' && doc.status !== 'archived') book.name = titleSchema.parse(change.title)
      else if (change.action === 'trash' && doc.status !== 'archived') doc.status = 'archived'
      else if (change.action === 'restore' && doc.status === 'archived') doc.status = 'active'
      else throw new BadRequestException('office.action_unavailable')
      await this.commit(manager, scope, doc, book, 'system')
    })
    return id
  }
  async readRange(scope: ContentDocumentScope, id: string, sheetName?: string | null, range?: string | null) {
    const result = await this.read(scope, id)
    return { documentId: id, title: result.title, modelId: WORKBOOK_MODEL.modelId, editProtocol: WORKBOOK_MODEL.editProtocol,
      versionNumber: Number(result.revision), ...readWorkbookRange(result.snapshot, sheetName, range),
      calculation: 'Formula results are recalculated by Univer when opened; persisted cached values may be stale.' }
  }
  async register(scope: ContentDocumentScope, id: string) {
    try { await this.runtime.require(ContentResourcesRuntimeCapability).catalog.register({ ...scope, source: { providerKey: WORKBOOK_PROVIDER, resourceId: id } }); return true }
    catch { this.logger.warn('Workbook saved; catalog discovery will retry registration'); return false }
  }
}
