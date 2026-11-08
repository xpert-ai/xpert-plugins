import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, type EntityManager } from 'typeorm'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { DashboardService } from '../dashboard.service'
import { libraryActor, ownedBy, type LibraryActor } from './access'
import { LibraryResourceRecord, LibraryDraftRecord, LibraryVersionRecord, LibraryPublicationRecord } from './entities'
import { catalogV2Query, resourceV2Schema, libraryTable, limits, identity, type ResourceDocumentV2, type AssetDescriptor } from './resource-contract'
import { resourceHash, resourceBytes } from './resource-json'
import { reference, validatePackage, type ResourcePackage } from './archive'
import { LibraryFilesService } from './files.service'

const versionTable = libraryTable('resource_version_v2'), publicationTable = libraryTable('resource_publication_v2')
export const versionItem = (row: LibraryVersionRecord) => ({ releaseId: row.id, logicalId: row.logicalId, version: row.version,
  kind: row.kind, title: row.title, description: row.description, categories: row.categories, sha256: row.sha256, formatVersion: 2,
  ...row.catalogMetadata,
  createdAt: row.createdAt.toISOString() })

/** @beta Canonical V2 catalog. Legacy V1 entries remain read-only migration inputs, not silently reinterpreted. */
@Injectable()
export class LibraryCatalogService {
  constructor(@InjectRepository(LibraryVersionRecord) readonly versions: Repository<LibraryVersionRecord>,
    private readonly dashboards: DashboardService, readonly files: LibraryFilesService) {}
  actor(context: XpertResolvedViewHostContext, write = false) { return libraryActor(this.dashboards, context, write) }

  async list(context: XpertResolvedViewHostContext, input: z.input<typeof catalogV2Query>) {
    const actor = await this.actor(context), query = catalogV2Query.parse(input)
    const qb = this.versions.createQueryBuilder('v').where('v.state = :ready', { ready: 'ready' })
    const publicClause = (alias: string) => `EXISTS (SELECT 1 FROM ${publicationTable} p WHERE p."versionId" = ${alias}.id AND p.active = true AND p."tenantId" = ${alias}."tenantId" AND p."organizationId" = ${alias}."organizationId" AND p."ownerId" = ${alias}."ownerId")`
    if (query.audience === 'public') qb.andWhere(publicClause('v'))
    else qb.andWhere('v."tenantId" = :tenantId AND v."organizationId" = :organizationId AND v."ownerId" = :ownerId', actor)
    qb.andWhere(`NOT EXISTS (SELECT 1 FROM ${versionTable} n WHERE n."resourceId" = v."resourceId" AND n.state = 'ready' AND string_to_array(n.version, '.')::int[] > string_to_array(v.version, '.')::int[] ${query.audience === 'public' ? `AND ${publicClause('n')}` : ''})`)
    if (query.kind) qb.andWhere('v.kind = :kind', { kind: query.kind })
    if (query.appearance !== 'all') qb.andWhere("v.\"catalogMetadata\"->'presentation'->>'appearance' = :appearance", { appearance: query.appearance })
    if (query.category) qb.andWhere('v.categories @> CAST(:category AS jsonb)', { category: JSON.stringify([query.category]) })
    if (query.search) qb.andWhere(`(COALESCE(v."catalogMetadata"->'translations'->:locale->>'title', v.title) ILIKE :search OR COALESCE(v."catalogMetadata"->'translations'->:locale->>'description', v.description) ILIKE :search)`, { locale: query.locale, search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%` })
    // The catalog query never fetches large JSON definitions or file bytes.
    qb.select(['v.id', 'v.logicalId', 'v.version', 'v.kind', 'v.title', 'v.description', 'v.categories', 'v.catalogMetadata', 'v.sha256', 'v.createdAt'])
    const [rows, total] = await qb.orderBy('v.createdAt', 'DESC').addOrderBy('v.id', 'DESC').skip((query.page - 1) * query.pageSize).take(query.pageSize).getManyAndCount()
    return { items: rows.map(versionItem), total, page: query.page, pageSize: query.pageSize }
  }

  async matchOwned(context: XpertResolvedViewHostContext, entries: { logicalId: string; kind: string }[]) {
    const actor = await this.actor(context)
    if (!entries.length || entries.length > 50) return []
    return this.versions.createQueryBuilder('v').where({ ...actor, state: 'ready', logicalId: In(entries.map(item => item.logicalId)) })
      .andWhere(`NOT EXISTS (SELECT 1 FROM ${versionTable} n WHERE n."resourceId" = v."resourceId" AND n.state = 'ready' AND string_to_array(n.version, '.')::int[] > string_to_array(v.version, '.')::int[])`)
      .select(['v.id', 'v.logicalId', 'v.version', 'v.kind', 'v.title', 'v.description', 'v.categories', 'v.catalogMetadata', 'v.sha256', 'v.createdAt']).getMany()
  }

  async resolve(context: XpertResolvedViewHostContext, id: string, write = false) {
    const actor = await this.actor(context, write), row = await this.versions.findOneBy({ id, state: 'ready' })
    if (!row) throw new ForbiddenException('LIBRARY_RESOURCE_DENIED')
    const own = ownedBy(row, actor)
    if (!own && (write || !await this.versions.manager.getRepository(LibraryPublicationRecord).existsBy({
      tenantId: row.tenantId, organizationId: row.organizationId, ownerId: row.ownerId, versionId: row.id, active: true
    }))) throw new ForbiddenException('LIBRARY_RESOURCE_DENIED')
    const document = resourceV2Schema.parse(row.document)
    if (resourceHash(document) !== row.sha256 || identity(document) !== identity(row) || document.kind !== row.kind) throw new BadRequestException('LIBRARY_RESOURCE_INTEGRITY')
    return { row, own, actor, document }
  }
  async read(context: XpertResolvedViewHostContext, id: string) {
    const { row, document, own } = await this.resolve(context, id)
    let canPublish = false
    if (own && (await this.dashboards.access(context)).canEdit) {
      try { canPublish = (await this.closure(context, [id], true)).resources.every(resource => !resource.assets.length) }
      catch { canPublish = false }
    }
    const canWithdraw = own && await this.versions.manager.getRepository(LibraryPublicationRecord).existsBy({ versionId: id, active: true, ...await this.actor(context) })
    return { item: versionItem(row), document, capabilities: { canExport: own || !document.assets.length, canPublish, canWithdraw,
      reasons: !own && document.assets.length ? ['LIBRARY_PUBLIC_FILE_COPY_UNAVAILABLE'] : [] } }
  }
  async closure(context: XpertResolvedViewHostContext, ids: string[], ownOnly = false) {
    const resources: ResourceDocumentV2[] = [], rows: LibraryVersionRecord[] = [], seen = new Set<string>(), active = new Set<string>()
    const visit = async (id: string) => {
      if (active.has(id)) throw new BadRequestException('LIBRARY_DEPENDENCY_CYCLE')
      if (seen.has(id)) return
      if (seen.size + active.size >= limits.resources) throw new BadRequestException('LIBRARY_ARCHIVE_LIMIT')
      const { row, document, own } = await this.resolve(context, id, ownOnly)
      if (!own && document.assets.length) throw new BadRequestException('LIBRARY_PUBLIC_FILE_COPY_UNAVAILABLE')
      active.add(id)
      for (const dep of document.dependencies) {
        const child = await this.versions.findOneBy({ tenantId: row.tenantId, organizationId: row.organizationId, ownerId: row.ownerId,
          logicalId: dep.logicalId, version: dep.version, state: 'ready' })
        if (!child || child.sha256 !== dep.sha256 || child.kind !== dep.kind) throw new BadRequestException('LIBRARY_DEPENDENCY_MISSING')
        await visit(child.id)
      }
      active.delete(id); seen.add(id); rows.push(row); resources.push(document)
    }
    for (const id of ids) await visit(id)
    return { resources, rows, roots: ids.map(id => reference(resources[rows.findIndex(row => row.id === id)])) }
  }
  async exportPackage(context: XpertResolvedViewHostContext, ids: string[]): Promise<ResourcePackage> {
    const actor = await this.actor(context), closure = await this.closure(context, ids), blobs = new Map<string, Buffer>()
    for (const document of closure.resources) for (const asset of document.assets) {
      if (!blobs.has(asset.sha256)) blobs.set(asset.sha256, await this.files.read(actor, asset))
    }
    for (const row of closure.rows) await this.resolve(context, row.id)
    const result = { resources: closure.resources, roots: closure.roots, blobs }; validatePackage(result)
    return result
  }
  async upload(context: XpertResolvedViewHostContext, asset: AssetDescriptor, bytes: Buffer) {
    await this.files.store(await this.actor(context, true), asset, bytes)
    return { sha256: asset.sha256, size: asset.size, mimeType: asset.mimeType }
  }

  private async resource(manager: EntityManager, actor: LibraryActor, document: ResourceDocumentV2) {
    const repository = manager.getRepository(LibraryResourceRecord), where = { ...actor, logicalId: document.logicalId }
    await repository.createQueryBuilder().insert().values({ ...where, kind: document.kind }).orIgnore().execute()
    const row = await repository.findOne({ where, lock: { mode: 'pessimistic_write' } })
    if (!row || row.kind !== document.kind) throw new ConflictException('LIBRARY_RESOURCE_KIND_CONFLICT')
    return row
  }
  async saveDraft(context: XpertResolvedViewHostContext, document: ResourceDocumentV2, expectedRevision: number) {
    const actor = await this.actor(context, true); document = resourceV2Schema.parse(document); resourceBytes(document)
    return this.versions.manager.transaction(async manager => {
      const resource = await this.resource(manager, actor, document), repository = manager.getRepository(LibraryDraftRecord)
      const previous = await repository.findOneBy({ ...actor, resourceId: resource.id })
      if ((previous?.revision ?? 0) !== expectedRevision) throw new ConflictException('LIBRARY_DRAFT_CONFLICT')
      await this.files.lockReferences(manager, actor, document.assets)
      const draft = await repository.save(repository.create({ ...previous, ...actor, resourceId: resource.id, document, revision: expectedRevision + 1 }))
      return { draftId: draft.id, resourceId: resource.id, revision: draft.revision, document: draft.document }
    })
  }
  async getDraft(context: XpertResolvedViewHostContext, id: string) {
    const actor = await this.actor(context), draft = await this.versions.manager.getRepository(LibraryDraftRecord).findOneBy({ id, ...actor })
    if (!draft) throw new ForbiddenException('LIBRARY_DRAFT_DENIED')
    return { draftId: draft.id, resourceId: draft.resourceId, revision: draft.revision, document: resourceV2Schema.parse(draft.document) }
  }
  async releaseDraft(context: XpertResolvedViewHostContext, id: string, expectedRevision: number) {
    const actor = await this.actor(context, true)
    return this.versions.manager.transaction(async manager => {
      const repository = manager.getRepository(LibraryDraftRecord), initial = await repository.findOneBy({ id, ...actor })
      if (!initial) throw new ForbiddenException('LIBRARY_DRAFT_DENIED')
      await this.resource(manager, actor, initial.document)
      const draft = await repository.findOneBy({ id, ...actor })
      if (!draft || draft.revision !== expectedRevision) throw new ConflictException('LIBRARY_DRAFT_CONFLICT')
      const row = await this.persistVersion(manager, actor, draft.document, null)
      return versionItem(row)
    })
  }
  /** Used by release and import within their transaction. No public caller controls storage identities. */
  async persistVersion(manager: EntityManager, actor: LibraryActor, input: ResourceDocumentV2, jobId: string | null) {
    const document = resourceV2Schema.parse(input), sha256 = resourceHash(document)
    const resource = await this.resource(manager, actor, document), repository = manager.getRepository(LibraryVersionRecord)
    const where = { ...actor, logicalId: document.logicalId, version: document.version }
    const existing = await repository.findOneBy(where)
    if (existing) {
      if (existing.sha256 !== sha256 || existing.state === 'staging' && existing.jobId !== jobId) throw new ConflictException('LIBRARY_VERSION_CONFLICT')
      return existing
    }
    await this.files.lockReferences(manager, actor, document.assets)
    for (const dep of document.dependencies) {
      const child = await repository.findOneBy({ ...actor, logicalId: dep.logicalId, version: dep.version })
      if (!child || child.sha256 !== dep.sha256 || child.kind !== dep.kind || child.state !== 'ready' && (!jobId || child.jobId !== jobId)) throw new BadRequestException('LIBRARY_DEPENDENCY_MISSING')
    }
    const row = await repository.save(repository.create({ ...where, resourceId: resource.id, kind: document.kind, title: document.title,
      description: document.description, categories: document.categories,
      catalogMetadata: { locale: document.locale, translations: document.translations, tags: document.tags, license: document.license, presentation: document.presentation,
        ...(document.kind === 'example-task' && document.content.dataRequirement ? { taskData: document.content.dataRequirement } : {}) },
      document, sha256, jobId, state: jobId ? 'staging' : 'ready' }))
    if (!jobId) await this.promote(manager, actor, [row])
    return row
  }
  async promote(manager: EntityManager, actor: LibraryActor, rows: LibraryVersionRecord[]) {
    for (const row of [...rows].sort((a, b) => a.resourceId.localeCompare(b.resourceId))) {
      const resources = manager.getRepository(LibraryResourceRecord)
      const resource = await resources.findOne({ where: { id: row.resourceId, ...actor }, lock: { mode: 'pessimistic_write' } })
      if (!resource) throw new ForbiddenException('LIBRARY_RESOURCE_DENIED')
      const current = resource.currentVersionId ? await manager.getRepository(LibraryVersionRecord).findOneBy({ id: resource.currentVersionId, ...actor }) : null
      const parts = row.version.split('.').map(Number), old = current?.version.split('.').map(Number)
      const comparison = old ? parts.map((n, i) => n - old[i]).find(n => n !== 0) ?? 0 : 1
      await manager.getRepository(LibraryVersionRecord).update({ id: row.id, ...actor }, { state: 'ready' })
      if (comparison > 0) await resources.update({ id: resource.id, ...actor }, { currentVersionId: row.id })
    }
  }
  async publish(context: XpertResolvedViewHostContext, id: string, confirmed: boolean) {
    if (!confirmed) throw new BadRequestException('LIBRARY_PUBLIC_CONFIRMATION_REQUIRED')
    const actor = await this.actor(context, true), closure = await this.closure(context, [id], true)
    if (closure.resources.some(r => r.assets.length)) throw new BadRequestException('LIBRARY_PUBLIC_FILE_COPY_UNAVAILABLE')
    await this.versions.manager.transaction(async manager => {
      for (const row of [...closure.rows].sort((a, b) => a.id.localeCompare(b.id))) {
        const current = await manager.getRepository(LibraryVersionRecord).findOne({ where: { id: row.id, ...actor, state: 'ready' }, lock: { mode: 'pessimistic_write' } })
        if (!current || current.sha256 !== row.sha256) throw new ConflictException('LIBRARY_VERSION_CONFLICT')
        await manager.getRepository(LibraryPublicationRecord).upsert({ ...actor, versionId: row.id, active: true }, ['tenantId', 'organizationId', 'ownerId', 'versionId'])
      }
    })
    return this.read(context, id)
  }
  async withdraw(context: XpertResolvedViewHostContext, id: string) {
    const { actor } = await this.resolve(context, id, true)
    await this.versions.manager.transaction(async manager => {
      await manager.getRepository(LibraryVersionRecord).findOne({ where: { id, ...actor }, lock: { mode: 'pessimistic_write' } })
      await manager.getRepository(LibraryPublicationRecord).update({ ...actor, versionId: id }, { active: false })
    })
    return { releaseId: id }
  }
}
