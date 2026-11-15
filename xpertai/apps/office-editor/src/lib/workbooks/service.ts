import { workbookTransaction } from './write-queue.js'
import { authorizeDocumentEvidence } from '../documents/evidence-access.js'
import { readWorkbookChanges } from './changes.js'
import type { ContentTransferSnapshot } from '@xpert-ai/contracts'
import { workbookFromTransfer } from './transfer.js'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository, EntityManager, Between, LessThan } from 'typeorm'
import { xpertWorkbook, workbookSubmission, diffWorkbook, mergeWorkbookOperationResult, stableJson, type WorkbookSubmission } from './core.js'
import { createStructuralState } from './structure/model.js'
import { fromUniver, toUniver, reconcileSnapshotAxes } from './univer-adapter.js'
import { z } from 'zod/v3'
import { CollaborationRuntimeCapability, ContentResourcesRuntimeCapability, ProjectAccessRuntimeCapability, ProjectFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type ContentDocumentScope, type ContentResourceMutation } from '@xpert-ai/plugin-sdk'
import { OfficeDocument, OfficeSnapshot, OfficeOperation } from '../entities/index.js'
import type { OfficeScope, ExcelAutomationOperation, OfficeSnapshotSource } from '../types.js'
import { blankWorkbook, parseWorkbook, workbookSourceRoot, workbookText, WORKBOOK_MODEL, WORKBOOK_PROVIDER, type NativeWorkbook } from './model.js'
import { editWorkbook, readWorkbookRange } from './operations.js'
import { importWorkbookFile, exportWorkbookFile } from './files.js'

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

  async documentSourceAccess(scope: ContentDocumentScope, document: OfficeDocument) {
    await authorizeDocumentEvidence(this.runtime, this.documents.manager.getRepository(OfficeSnapshot), scope, document)
  }

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
    return decodeSnapshot(snapshot.snapshot, doc.id!)
  }
  async session(scope: ContentDocumentScope, id: string) {
    await this.require(scope, id)
    const api = this.runtime.require(CollaborationRuntimeCapability)
    if (!api.notifyRevision) throw new BadRequestException('office.collaboration_upgrade_required')
    const document = await api.ensureDocument({ providerKey: 'office-editor.workbook-operations', resourceId: id })
    // Read access includes ephemeral selection, while writes remain in submit().
    return api.createSession({ documentId: document.id, access: 'read' })
  }
  private async notifyRevision(id: string) {
    try {
      await this.runtime.get(CollaborationRuntimeCapability)?.notifyRevision?.({ providerKey: 'office-editor.workbook-operations', resourceId: id })
    } catch (error) {
      // A lost notification cannot undo a committed domain write. Reconnect/head
      // reconciliation recovers it from the authoritative snapshot and log.
      this.logger.debug(`Workbook revision notification unavailable: ${error instanceof Error ? error.message : 'unknown'}`)
    }
  }
  async head(scope: ContentDocumentScope, id: string) {
    const access = await this.access(scope), doc = await this.require(scope, id)
    return { revision: String(doc.currentVersionNumber), canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role) }
  }
  async read(scope: ContentDocumentScope, id: string) {
    const access = await this.access(scope), doc = await this.require(scope, id)
    const snapshot = await this.snapshot(this.documents.manager, doc), workbook = fromUniver(snapshot)
    return { documentId: doc.id!, title: doc.title, revision: String(doc.currentVersionNumber), snapshot,
      canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role),
      collaboration: 'operations' as const, workbook, operationProtocol: workbook.axes ? 'xpert.workbook.operations@2' : 'xpert.workbook.operations@1', sourcePath: doc.sourceSnapshotPath, sourceHash: doc.sourceSnapshotHash }
  }
  async create(scope: ContentDocumentScope, requestId: string, title: string, copy?: { id: string; revision: string }, initialContent?: ContentTransferSnapshot) {
    await this.access(scope, 'write'); uuid.parse(requestId); title = titleSchema.parse(title)
    const fingerprint = digest({ title, copy: copy ?? null, ...(initialContent ? { initialContent } : {}) })
    await workbookTransaction(this.documents.manager, requestId, Buffer.byteLength(JSON.stringify({ title, copy, initialContent })), async manager => {
      // INSERT conflict waits for an in-flight create, without overwriting its head.
      await manager.getRepository(OfficeDocument).createQueryBuilder().insert().values({ ...workbookWhere(scope), id: requestId,
        title, documentType: 'spreadsheet', status: 'active', currentVersionNumber: 0, createRequestHash: fingerprint,
        createdById: scope.actor.userId, lastEditedById: scope.actor.userId, assistantId: scope.assistantId,
        workspaceCatalog: 'projects', workspaceScopeId: scope.projectId }).orIgnore().execute()
      const doc = await this.require(scope, requestId, manager, true, true)
      if (doc.createRequestHash !== fingerprint) throw new ConflictException('office.request_conflict')
      if (doc.currentVersionNumber) return
      if (copy && initialContent) throw new BadRequestException('office.request_conflict')
      let book = initialContent ? workbookFromTransfer(requestId, title, initialContent) : blankWorkbook(requestId, title)
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
    await this.access(scope, 'write')
    await this.require(scope, id)
    const base = await this.revision(this.documents.manager, scope, id, Number(expectedRevision))
    if (operations.some(operation => operation.type === 'rename_sheet')) {
      if (operations.length !== 1 || operations[0].type !== 'rename_sheet') throw new BadRequestException('office.workbook_structure_separate')
      const rename = operations[0], sheetId = base.sheetOrder.find(key => base.sheets[key].name === rename.sheetName)
      if (!sheetId) throw new BadRequestException('office.sheet_not_found')
      return this.submit(scope, id, { protocol: 'xpert.workbook.operations@2', baseRevision: Number(expectedRevision), requestId,
        operations: [{ kind: 'transform_structure', identitySeed: deterministicSheetId(id, requestId, 'identity'),
          operation: { kind: 'rename_sheet', sheetId, title: rename.newSheetName } }] }, 'agent')
    }
    const edited = editWorkbook(base, operations, name => deterministicSheetId(id, requestId, name))
    const axes = reconcileSnapshotAxes(edited, fromUniver(base).axes, deterministicSheetId(id, requestId, 'agent'))
    const delta = diffWorkbook(fromUniver(base), fromUniver({ ...edited, ...(axes ? { xpertStructure: axes } : {}) }))
    if (!delta.length) return { ...await this.read(scope, id), catalogPending: false }
    return this.submit(scope, id, { protocol: fromUniver(base).axes ? 'xpert.workbook.operations@2' : 'xpert.workbook.operations@1', baseRevision: Number(expectedRevision), requestId, operations: delta }, 'agent')
  }
  private async revision(manager: EntityManager, scope: ContentDocumentScope, id: string, revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 1 || revision > 2147483647) throw new BadRequestException('office.invalid_revision')
    const row = await manager.getRepository(OfficeSnapshot).findOneBy({ documentId: id, tenantId: scope.actor.tenantId,
      organizationId: scope.actor.organizationId, projectId: scope.projectId, versionNumber: revision })
    if (!row) throw new ConflictException('office.version_conflict')
    return decodeSnapshot(row.snapshot, id)
  }
  async submit(scope: ContentDocumentScope, id: string, raw: WorkbookSubmission, source: OfficeSnapshotSource = 'workbench', origin?: { undoOfRevision: number }) {
    await this.access(scope, 'write')
    if (Buffer.byteLength(JSON.stringify(raw)) > 20 * 1024 * 1024) throw new BadRequestException('office.workbook_size_limit')
    const checked = workbookSubmission.safeParse(raw)
    if (!checked.success) throw new BadRequestException('office.workbook_invalid')
    const input = checked.data, fingerprint = digest(stableJson({ actor: scope.actor.userId, source, input, origin }))
    if (input.operations.some(op => op.kind === 'transform_structure' &&
      (input.protocol !== 'xpert.workbook.operations@2' || (op.identitySeed !== input.requestId && op.identitySeed !== deterministicSheetId(id, input.requestId, 'identity')))))
      throw new BadRequestException('office.workbook_protocol_upgrade_required')
    let appliedRevision = 0, replayed = false
    await workbookTransaction(this.documents.manager, id, Buffer.byteLength(JSON.stringify(raw)), async manager => {
      const doc = await this.require(scope, id, manager, false, true)
      await this.access(scope, 'write')
      const operations = manager.getRepository(OfficeOperation), key = `workbook-op:${input.requestId}`
      const previous = await operations.findOneBy({ documentId: id, idempotencyKey: key,
        tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId, projectId: scope.projectId })
      if (previous) {
        if (previous.input !== fingerprint) throw new ConflictException('office.request_conflict')
        const receipt = operationReceipt.parse(previous.result)
        appliedRevision = receipt.revision; replayed = true; return
      }
      const head = doc.currentVersionNumber!
      if (input.baseRevision > head || head - input.baseRevision > 100) throw new ConflictException('office.version_conflict')
      const base = fromUniver(await this.revision(manager, scope, id, input.baseRevision))
      if (base.axes && input.protocol !== 'xpert.workbook.operations@2') throw new BadRequestException('office.workbook_protocol_upgrade_required')
      const history = head > input.baseRevision ? await manager.getRepository(OfficeSnapshot).find({
        where: { documentId: id, tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
          projectId: scope.projectId, versionNumber: Between(input.baseRevision + 1, head) }, order: { versionNumber: 'ASC' }, take: 100 }) : []
      if (history.length !== head - input.baseRevision || history.some((row, i) => row.versionNumber !== input.baseRevision + i + 1))
        throw new ConflictException('office.version_conflict')
      // Restore and legacy full-snapshot writes remain barriers even if their
      // resulting cells happen to equal an earlier revision (ABA).
      if (history.some(row => !['xpert.workbook.operations@1', 'xpert.workbook.operations@2', 'xpert.workbook.structure@2'].includes(row.changeSummary))) throw new ConflictException('office.version_conflict')
      let book: NativeWorkbook
      let appliedOperations = input.operations
      try {
        const merged = mergeWorkbookOperationResult(base, history.map(row => fromUniver(decodeSnapshot(row.snapshot, id))), input.operations)
        // Unknown/full-snapshot structure is an epoch barrier. Never trust its
        // caller-supplied identity map for future stale-coordinate rebasing.
        if (input.operations.some(op => op.kind === 'replace_structure') && (base.axes || merged.workbook.axes)) {
          merged.workbook.schemaVersion = 2
          merged.workbook.axes = createStructuralState(merged.workbook, deterministicSheetId(id, input.requestId, 'structure'))
        }
        book = parseWorkbook(toUniver(merged.workbook), id); appliedOperations = merged.operations
      }
      catch (error) {
        if (error instanceof Error && error.message === 'office.version_conflict') throw new ConflictException('office.version_conflict')
        if (error instanceof Error && /^office\.workbook_(?:formula_transform_unsupported|structure_extensions_unsupported|range_reordered|merge_invalid|merge_would_discard|sort_formula_unsupported)$/.test(error.message))
          throw new BadRequestException(error.message)
        throw new BadRequestException('office.workbook_invalid')
      }
      const summary = input.operations.some(op => op.kind === 'replace_structure') ? 'xpert.workbook.structure@1'
        : input.operations.some(op => op.kind === 'transform_structure') ? 'xpert.workbook.structure@2' : input.protocol
      const snapshot = await this.commit(manager, scope, doc, book, source, summary)
      appliedRevision = snapshot.versionNumber
      await operations.save(operations.create({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
        projectId: scope.projectId, documentId: id, snapshotId: snapshot.id, operationType: 'excel_automation',
        source: source === 'agent' ? 'agent' : 'workbench', status: 'applied', input: fingerprint,
        result: { protocol: input.protocol, revision: appliedRevision, baseRevision: input.baseRevision, appliedBaseRevision: head, operations: appliedOperations, ...origin },
        idempotencyKey: key, createdById: scope.actor.userId }))
    })
    await this.notifyRevision(id)
    const catalogPending = !(await this.register(scope, id))
    return { ...await this.read(scope, id), appliedRevision, replayed, catalogPending }
  }
  async changes(scope: ContentDocumentScope, id: string, after: number) {
    const document = await this.require(scope, id)
    const result = await readWorkbookChanges(this.documents, scope, document, z.number().int().positive().max(2147483647).parse(after))
    const access = await this.access(scope)
    return result.reset ? result : { ...result, canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role) }
  }
  async history(scope: ContentDocumentScope, id: string, before = 2147483647) {
    await this.require(scope, id)
    const rows = await this.documents.manager.getRepository(OfficeSnapshot).find({
      where: { documentId: id, tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
        projectId: scope.projectId, versionNumber: LessThan(before) }, order: { versionNumber: 'DESC' }, take: 51 })
    return { items: rows.slice(0, 50).map(row => ({ revision: row.versionNumber, source: row.source,
      createdAt: row.createdAt, createdById: row.createdById,
      canUndo: row.versionNumber > 1 && row.createdById === scope.actor.userId && ['xpert.workbook.operations@1', 'xpert.workbook.operations@2'].includes(row.changeSummary)
    })), nextCursor: rows.length > 50 ? rows[49].versionNumber : null }
  }
  /** Invert only this actor's cell edit. The normal writer checks every later
   * transition (including ABA) and preserves unrelated collaborators' edits. */
  async undo(scope: ContentDocumentScope, id: string, revision: number, requestId: string) {
    await this.access(scope, 'write'); await this.require(scope, id)
    z.number().int().min(2).max(2147483647).parse(revision); uuid.parse(requestId)
    const row = await this.documents.manager.getRepository(OfficeSnapshot).findOneBy({ documentId: id,
      tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId, projectId: scope.projectId, versionNumber: revision })
    if (!row || row.createdById !== scope.actor.userId || !['xpert.workbook.operations@1', 'xpert.workbook.operations@2'].includes(row.changeSummary))
      throw new BadRequestException('office.workbook_undo_unavailable')
    const before = fromUniver(await this.revision(this.documents.manager, scope, id, revision - 1))
    const after = fromUniver(decodeSnapshot(row.snapshot, id))
    const inverse = diffWorkbook(after, before)
    if (!inverse.length || inverse.some(operation => operation.kind !== 'set_cell'))
      throw new BadRequestException('office.workbook_undo_unavailable')
    return this.submit(scope, id, { protocol: after.axes ? 'xpert.workbook.operations@2' : 'xpert.workbook.operations@1', requestId: `undo:${requestId}`,
      baseRevision: revision, operations: inverse }, 'workbench', { undoOfRevision: revision })
  }
  async restore(scope: ContentDocumentScope, id: string, revision: number, expectedRevision: string, requestId: string) {
    await this.access(scope, 'write'); await this.require(scope, id)
    const book = await this.revision(this.documents.manager, scope, id, revision)
    return this.write(scope, id, expectedRevision, requestId, { restoreRevision: revision }, () => book, 'workbench')
  }
  async previewRevision(scope: ContentDocumentScope, id: string, revision: number) {
    await this.require(scope, id)
    const snapshot = await this.revision(this.documents.manager, scope, id, revision)
    await this.access(scope, 'read')
    return { revision, snapshot, workbook: fromUniver(snapshot) }
  }
  async importDraft(scope: ContentDocumentScope, id: string, expectedRevision: string, fileName: string, buffer: Buffer) {
    await this.access(scope, 'write')
    const doc = await this.require(scope, id)
    this.assertRevision(doc, expectedRevision)
    const snapshot = await importWorkbookFile(id, doc.title, fileName, buffer)
    await this.access(scope, 'write')
    this.assertRevision(await this.require(scope, id), expectedRevision)
    return { snapshot, revision: expectedRevision, fidelity: /\.xpert-workbook\.json$/i.test(fileName) ? 'native' : 'best_effort' }
  }
  async exportFile(scope: ContentDocumentScope, id: string, expectedRevision: string, format: 'xlsx' | 'csv' | 'native', sheetId?: string) {
    const doc = await this.require(scope, id)
    this.assertRevision(doc, expectedRevision)
    const file = exportWorkbookFile(await this.snapshot(this.documents.manager, doc), format, sheetId, Number(expectedRevision))
    await this.access(scope, 'read')
    return { base64: file.buffer.toString('base64'), mimeType: file.mimeType,
      fileName: `${doc.title}.${format === 'native' ? 'xpert-workbook.json' : format}`, revision: expectedRevision }
  }
  private async write(scope: ContentDocumentScope, id: string, expectedRevision: string, requestId: string, intent: object,
    update: (book: NativeWorkbook) => NativeWorkbook, source: OfficeSnapshotSource) {
    await this.access(scope, 'write')
    if (!requestId || requestId.length > 128) throw new BadRequestException('office.request_required')
    const fingerprint = digest({ expectedRevision, intent, actor: scope.actor.userId })
    await workbookTransaction(this.documents.manager, id, Buffer.byteLength(JSON.stringify(intent)), async manager => {
      const doc = await this.require(scope, id, manager, false, true)
      await this.access(scope, 'write')
      const operations = manager.getRepository(OfficeOperation), key = `workbook:${requestId}`
      const previous = await operations.findOneBy({ documentId: id, idempotencyKey: key })
      if (previous) {
        if (previous.input !== fingerprint) throw new ConflictException('office.request_conflict')
        return
      }
      this.assertRevision(doc, expectedRevision)
      const current = await this.snapshot(manager, doc), currentAxes = fromUniver(current).axes
      const updated = update(current)
      if (currentAxes && 'snapshot' in intent && !updated.xpertStructure) throw new BadRequestException('office.workbook_protocol_upgrade_required')
      // Explicit restores never downgrade the storage contract, even when the
      // historical body predates stable identities. They start a fresh epoch.
      const axes = reconcileSnapshotAxes(updated, currentAxes, deterministicSheetId(id, requestId, 'snapshot'), true)
      const book = parseWorkbook({ ...updated, ...(axes ? { xpertStructure: axes } : {}) }, id)
      const snapshot = await this.commit(manager, scope, doc, book, source)
      await operations.save(operations.create({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
        projectId: scope.projectId, documentId: id, snapshotId: snapshot.id, operationType: 'excel_automation', source: source === 'agent' ? 'agent' : 'workbench',
        status: 'applied', input: fingerprint, idempotencyKey: key, createdById: scope.actor.userId }))
    })
    await this.notifyRevision(id)
    const catalogPending = !(await this.register(scope, id))
    return { ...await this.read(scope, id), catalogPending }
  }
  private async commit(manager: EntityManager, scope: ContentDocumentScope, doc: OfficeDocument, book: NativeWorkbook, source: OfficeSnapshotSource, changeSummary?: string) {
    const revision = (doc.currentVersionNumber ?? 0) + 1
    const file = await this.persist(scope, doc.id!, revision, book)
    const snapshots = manager.getRepository(OfficeSnapshot)
    const snapshot = await snapshots.save(snapshots.create({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
      projectId: scope.projectId, documentId: doc.id!, versionNumber: revision, source, snapshot: fromUniver(book), changeSummary,
      snapshotText: workbookText(book).map(section => section.text).join('\n'), createdById: scope.actor.userId }))
    await manager.getRepository(OfficeDocument).save({ ...doc, title: book.name, currentSnapshotId: snapshot.id,
      currentVersionNumber: revision, sourceSnapshotPath: file.path, sourceSnapshotHash: file.sha256,
      lastEditedById: scope.actor.userId, lastEditedAt: new Date() })
    return snapshot
  }
  private async persist(scope: ContentDocumentScope, id: string, revision: number, book: NativeWorkbook, canonical = true) {
    const { buffer, path, sha256: hash } = workbookProjection(id, revision, book, canonical)
    const files = this.runtime.require(ProjectFilesRuntimeCapability)
    await files.mkdir({ ...scope, path: `${workbookSourceRoot(id)}/revisions` })
    try { await files.write({ ...scope, path, buffer, expectedHash: null }) }
    catch (error) { const stored = await files.read({ ...scope, path }).catch(() => null); if (stored?.sha256 !== hash) throw error }
    return { path, sha256: hash }
  }
  async reconcile(scope: ContentDocumentScope, id: string) {
    await this.access(scope, 'write')
    await workbookTransaction(this.documents.manager, id, 0, async manager => {
      const doc = await this.require(scope, id, manager, true, true)
      await this.access(scope, 'write')
      const stored = await manager.getRepository(OfficeSnapshot).findOneByOrFail({ id: doc.currentSnapshotId, documentId: id })
      const book = await this.snapshot(manager, doc), canonical = xpertWorkbook.safeParse(stored.snapshot).success
      const file = workbookProjection(id, doc.currentVersionNumber!, book, canonical)
      if (file.path !== doc.sourceSnapshotPath || file.sha256 !== doc.sourceSnapshotHash) throw new ConflictException('office.source_conflict')
      const files = this.runtime.require(ProjectFilesRuntimeCapability)
      const disk = await files.read({ ...scope, path: file.path }).catch(() => null)
      if (!disk) { await this.persist(scope, id, doc.currentVersionNumber!, book, canonical); return }
      if (disk.sha256 === file.sha256) return
      // The DB snapshot is authoritative. Preserve damaged projection bytes before
      // repairing with CAS; a concurrent file change must never be overwritten.
      const folder = `${workbookSourceRoot(id)}/quarantine`, path = `${folder}/${doc.currentVersionNumber}-${disk.sha256}.json`
      await files.mkdir({ ...scope, path: folder })
      try { await files.write({ ...scope, path, buffer: disk.buffer, expectedHash: null }) }
      catch (error) { if ((await files.read({ ...scope, path }).catch(() => null))?.sha256 !== disk.sha256) throw error }
      await this.access(scope, 'write')
      await files.write({ ...scope, path: file.path, buffer: file.buffer, expectedHash: disk.sha256 })
      this.logger.warn(`Workbook projection repaired: document=${id} revision=${doc.currentVersionNumber} quarantinedHash=${disk.sha256}`)
    })
  }
  async mutate(scope: ContentDocumentScope, id: string, expectedRevision: string, change: ContentResourceMutation) {
    if (change.action === 'duplicate') return (await this.create(scope, change.requestId, change.title, { id, revision: expectedRevision })).documentId
    const mode = change.action === 'trash' || change.action === 'restore' ? 'manage' : 'write'
    await this.access(scope, mode)
    await workbookTransaction(this.documents.manager, id, Buffer.byteLength(JSON.stringify(change)), async manager => {
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

const operationReceipt = z.object({ revision: z.number().int().positive() })
function workbookProjection(id: string, revision: number, book: NativeWorkbook, canonical: boolean) {
  const buffer = Buffer.from(JSON.stringify({ format: WORKBOOK_MODEL.modelId, schemaVersion: 1, documentId: id, revision,
    workbook: canonical ? fromUniver(book) : book }))
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  return { buffer, sha256, path: `${workbookSourceRoot(id)}/revisions/${revision}-${sha256}.json` }
}
export function decodeSnapshot(value: unknown, id: string): NativeWorkbook {
  const canonical = xpertWorkbook.safeParse(value)
  return parseWorkbook(canonical.success ? toUniver(canonical.data) : value, id)
}

function deterministicSheetId(id: string, requestId: string, name: string) {
  const hash = digest({ id, requestId, name })
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
