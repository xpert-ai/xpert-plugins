import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { LibraryTransferRecord, LibraryVersionRecord } from './entities'
import { LibraryCatalogService } from './catalog.service'
import { decodePackage, encodePackage, remapPackage } from './archive'
import { sha256, resourceHash } from './resource-json'

const leaseMs = 120_000
const jobItem = (row: LibraryTransferRecord) => ({ importId: row.id, status: row.status, mode: row.mode,
  releaseIds: row.releaseIds, failureCode: row.failureCode, createdAt: row.createdAt.toISOString() })

/** @beta Durable import jobs use portable Workspace Files references, never a storage-provider setting. */
@Injectable()
export class LibraryTransfersService {
  constructor(@InjectRepository(LibraryTransferRecord) readonly transfers: Repository<LibraryTransferRecord>,
    private readonly catalog: LibraryCatalogService,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  async prepare(context: XpertResolvedViewHostContext, bytes: Buffer, mode: 'reuse' | 'copy', requestId: string) {
    const actor = await this.catalog.actor(context, true), archive = this.decode(bytes), digest = sha256(bytes)
    const files = this.runtime.require(WorkspaceFilesRuntimeCapability)
    const job = await this.transfers.manager.transaction(async manager => {
      // Serializes only preparations for this owner/request; no persistent lock or platform table is used.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [JSON.stringify(actor), requestId])
      const repository = manager.getRepository(LibraryTransferRecord), previous = await repository.findOneBy({ ...actor, requestId })
      if (previous) {
        if (previous.sha256 !== digest || previous.mode !== mode) throw new ConflictException('LIBRARY_REQUEST_CONFLICT')
        return previous
      }
      const id = randomUUID(), identityMap: Record<string, string> = {}
      for (const document of archive.resources) identityMap[document.logicalId] ??= mode === 'copy' ? randomUUID() : document.logicalId
      const file = await files.writeRuntimeBuffer({ catalog: 'users', tenantId: actor.tenantId, organizationId: actor.organizationId,
        userId: actor.ownerId, folder: `dashboards/library/imports/${id}`, fileName: `${digest}.zip`, buffer: bytes, mimeType: 'application/zip' })
      return repository.save(repository.create({ id, ...actor, requestId, sha256: digest, file: file.reference,
        mode, identityMap, releaseIds: [], status: 'prepared' }))
    })
    return this.inspect(context, job.id)
  }
  private decode(bytes: Buffer) {
    try { return decodePackage(bytes) }
    catch (error) { throw new BadRequestException(error instanceof Error && /^LIBRARY_[A-Z_]+$/.test(error.message) ? error.message : 'LIBRARY_ARCHIVE_INVALID') }
  }
  private async job(context: XpertResolvedViewHostContext, id: string, write = false) {
    const actor = await this.catalog.actor(context, write), job = await this.transfers.findOneBy({ id, ...actor })
    if (!job) throw new ForbiddenException('LIBRARY_IMPORT_DENIED')
    return { actor, job }
  }
  private async input(job: LibraryTransferRecord) {
    const { buffer } = await this.runtime.require(WorkspaceFilesRuntimeCapability).readRuntimeBuffer(job.file)
    if (sha256(buffer) !== job.sha256) throw new BadRequestException('LIBRARY_IMPORT_INTEGRITY')
    const archive = this.decode(buffer)
    return job.mode === 'copy' ? remapPackage(archive, job.identityMap) : archive
  }
  async inspect(context: XpertResolvedViewHostContext, id: string) {
    const { actor, job } = await this.job(context, id)
    if (job.status === 'complete' || job.status === 'cancelled') return { ...jobItem(job), items: [] }
    const archive = await this.input(job), items = []
    for (const document of archive.resources) {
      const existing = await this.catalog.versions.findOneBy({ ...actor, logicalId: document.logicalId, version: document.version })
      items.push({ logicalId: document.logicalId, version: document.version, kind: document.kind, title: document.title,
        outcome: !existing ? 'create' : existing.sha256 === resourceHash(document) && existing.state === 'ready' ? 'reuse' : 'conflict' })
    }
    return { ...jobItem(job), items }
  }
  async commit(context: XpertResolvedViewHostContext, id: string) {
    const { actor, job } = await this.job(context, id, true)
    if (job.status === 'complete') return this.inspect(context, id)
    if (job.status === 'cancelled') throw new ConflictException('LIBRARY_IMPORT_CANCELLED')
    const token = randomUUID()
    const lease = await this.transfers.createQueryBuilder().update().set({ status: 'running', leaseToken: token,
      leaseUntil: new Date(Date.now() + leaseMs), failureCode: null }).where('id = :id', { id })
      .andWhere('"tenantId" = :tenantId AND "organizationId" = :organizationId AND "ownerId" = :ownerId', actor)
      .andWhere("status IN ('prepared', 'failed', 'running')").andWhere('("leaseUntil" IS NULL OR "leaseUntil" < :now)', { now: new Date() }).execute()
    if (lease.affected !== 1) throw new ConflictException('LIBRARY_IMPORT_RUNNING')
    try {
      const archive = await this.input(job)
      if ((await this.inspect(context, id)).items.some(item => item.outcome === 'conflict')) throw new ConflictException('LIBRARY_VERSION_CONFLICT')
      for (const document of archive.resources) for (const asset of document.assets) {
        const renewed = await this.transfers.update({ id, ...actor, leaseToken: token }, { leaseUntil: new Date(Date.now() + leaseMs) })
        if (renewed.affected !== 1) throw new ConflictException('LIBRARY_IMPORT_LEASE_LOST')
        await this.catalog.files.store(actor, asset, archive.blobs.get(asset.sha256)!)
      }
      // Attachment writes can outlive a failed attempt; all catalog versions become visible atomically.
      await this.transfers.manager.transaction(async manager => {
        const repository = manager.getRepository(LibraryTransferRecord)
        const current = await repository.findOne({ where: { id, ...actor }, lock: { mode: 'pessimistic_write' } })
        if (current?.leaseToken !== token || !current.leaseUntil || current.leaseUntil.getTime() < Date.now()) throw new ConflictException('LIBRARY_IMPORT_LEASE_LOST')
        const rows: LibraryVersionRecord[] = []
        // Stable advisory order prevents overlapping graphs from locking containers in opposite orders.
        for (const logicalId of [...new Set(archive.resources.map(document => document.logicalId))].sort()) {
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [JSON.stringify(actor), logicalId])
        }
        for (const document of archive.resources) rows.push(await this.catalog.persistVersion(manager, actor, document, id))
        await this.catalog.promote(manager, actor, rows)
        await repository.update({ id, ...actor, leaseToken: token }, { status: 'complete', releaseIds: rows.map(row => row.id), leaseToken: null, leaseUntil: null })
      })
    } catch (error) {
      const failureCode = error instanceof Error && /^LIBRARY_[A-Z_]+$/.test(error.message) ? error.message : 'LIBRARY_IMPORT_FAILED'
      await this.transfers.update({ id, ...actor, leaseToken: token }, { status: 'failed', failureCode, leaseToken: null, leaseUntil: null })
      throw error
    }
    return this.inspect(context, id)
  }
  async cancel(context: XpertResolvedViewHostContext, id: string) {
    const { actor } = await this.job(context, id, true)
    await this.transfers.manager.transaction(async manager => {
      const repository = manager.getRepository(LibraryTransferRecord)
      const row = await repository.findOne({ where: { id, ...actor }, lock: { mode: 'pessimistic_write' } })
      if (!row || row.status === 'complete') throw new ConflictException('LIBRARY_IMPORT_COMPLETE')
      if (row.leaseUntil && row.leaseUntil.getTime() >= Date.now()) throw new ConflictException('LIBRARY_IMPORT_RUNNING')
      await repository.update({ id, ...actor }, { status: 'cancelled', leaseToken: null, leaseUntil: null })
    })
    return this.inspect(context, id)
  }
  async jobs(context: XpertResolvedViewHostContext) {
    const rows = await this.transfers.find({ where: await this.catalog.actor(context), order: { createdAt: 'DESC', id: 'DESC' }, take: 50 })
    return rows.map(jobItem)
  }
  /** Retryable deletion of terminal import ZIPs; version and attachment records remain intact. */
  async cleanup(context: XpertResolvedViewHostContext, before: Date) {
    const actor = await this.catalog.actor(context, true)
    if (!Number.isFinite(before.getTime()) || before.getTime() > Date.now() - 86_400_000) throw new BadRequestException('LIBRARY_RETENTION_REQUIRED')
    const candidates = await this.transfers.createQueryBuilder('j')
      .where('j."tenantId" = :tenantId AND j."organizationId" = :organizationId AND j."ownerId" = :ownerId', actor)
      .andWhere("j.status IN ('complete', 'cancelled') AND j.\"filesClearedAt\" IS NULL AND j.\"updatedAt\" < :before", { before })
      .orderBy('j.id', 'ASC').take(50).getMany()
    let removed = 0
    for (const candidate of candidates) await this.transfers.manager.transaction(async manager => {
      const repository = manager.getRepository(LibraryTransferRecord)
      const row = await repository.findOne({ where: { id: candidate.id, ...actor }, lock: { mode: 'pessimistic_write' } })
      if (!row || row.filesClearedAt || !['complete', 'cancelled'].includes(row.status)) return
      await this.runtime.require(WorkspaceFilesRuntimeCapability).deleteFile({ ...row.file, organizationId: actor.organizationId })
      await repository.update({ id: row.id, ...actor }, { filesClearedAt: new Date() }); removed++
    })
    return { removed, scanned: candidates.length }
  }
  async exportFile(context: XpertResolvedViewHostContext, id: string) {
    const actor = await this.catalog.actor(context), buffer = encodePackage(await this.catalog.exportPackage(context, [id]))
    const file = await this.runtime.require(WorkspaceFilesRuntimeCapability).writeRuntimeBuffer({ catalog: 'users', tenantId: actor.tenantId,
      organizationId: actor.organizationId, userId: actor.ownerId, folder: 'dashboards/library/exports', fileName: `${sha256(buffer)}.zip`, buffer, mimeType: 'application/zip' })
    // The provider re-resolves authorization on every grant; a stale file key is not download authority.
    await this.catalog.closure(context, [id])
    return { reference: file.reference, fileName: 'resources.xpert-library-v2.zip', mimeType: 'application/zip', size: buffer.length }
  }
}
