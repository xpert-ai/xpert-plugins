import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, type EntityManager } from 'typeorm'
import { ArtifactContentRuntimeCapability, ArtifactsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME } from '../dashboard.service'
import { LibraryFileRecord, LibraryVersionRecord, LibraryDraftRecord } from './entities'
import { LIBRARY_FILE_TYPE, type AssetDescriptor } from './resource-contract'
import { validateAsset } from './asset-validation'
import type { LibraryActor } from './access'

@Injectable()
export class LibraryFilesService {
  constructor(@InjectRepository(LibraryFileRecord) readonly files: Repository<LibraryFileRecord>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  async store(actor: LibraryActor, descriptor: AssetDescriptor, bytes: Buffer): Promise<LibraryFileRecord> {
    validateAsset(descriptor, bytes)
    const where = { ...actor, sha256: descriptor.sha256 }
    await this.files.createQueryBuilder().insert().values({ ...where, size: descriptor.size, mimeType: descriptor.mimeType, fileName: descriptor.fileName, state: 'pending' }).orIgnore().execute()
    return this.files.manager.transaction(async manager => {
      const repository = manager.getRepository(LibraryFileRecord), file = await repository.findOne({ where, lock: { mode: 'pessimistic_write' } })
      if (!file || file.size !== descriptor.size || file.mimeType !== descriptor.mimeType) throw new ConflictException('LIBRARY_ASSET_CONFLICT')
      if (file.state === 'ready') return file
      const artifacts = this.runtime.require(ArtifactsRuntimeCapability)
      const source = { pluginName: PLUGIN_NAME, resourceType: LIBRARY_FILE_TYPE, resourceId: `user/${actor.ownerId}/${actor.organizationId}/${descriptor.sha256}` }
      const artifact = await artifacts.findArtifactBySource(source) ?? await artifacts.createArtifact({ source,
        type: { pluginName: PLUGIN_NAME, resourceType: LIBRARY_FILE_TYPE }, kind: 'file', title: descriptor.fileName,
        scope: { tenantId: actor.tenantId, organizationId: actor.organizationId, userId: actor.ownerId } })
      const content = await this.runtime.require(ArtifactContentRuntimeCapability).write({ artifactId: artifact.id, buffer: bytes })
      const { version } = await artifacts.ensureArtifactVersion({ artifactId: artifact.id, idempotencyKey: descriptor.sha256,
        workspaceFileRef: content, mimeType: descriptor.mimeType, fileName: descriptor.fileName, sha256: descriptor.sha256, size: bytes.length, setCurrent: false })
      file.artifactId = artifact.id; file.artifactVersionId = version.id; file.state = 'ready'
      return repository.save(file)
    })
  }
  async read(actor: LibraryActor, descriptor: AssetDescriptor): Promise<Buffer> {
    const where = { ...actor, sha256: descriptor.sha256, state: 'ready' as const }, file = await this.files.findOneBy(where)
    if (!file?.artifactId || !file.artifactVersionId || file.mimeType !== descriptor.mimeType) throw new BadRequestException('LIBRARY_ASSET_MISSING')
    const result = await this.runtime.require(ArtifactsRuntimeCapability).readArtifactVersion({ artifactId: file.artifactId, artifactVersionId: file.artifactVersionId, purpose: 'copy' })
    validateAsset(descriptor, result.buffer)
    const current = await this.files.findOneBy({ ...where, artifactId: file.artifactId, artifactVersionId: file.artifactVersionId })
    if (!current) throw new BadRequestException('LIBRARY_ASSET_MISSING')
    return result.buffer
  }
  /** The caller keeps these row locks until its referencing draft/version transaction commits. */
  async lockReferences(manager: EntityManager, actor: LibraryActor, assets: AssetDescriptor[]) {
    for (const descriptor of [...assets].sort((a, b) => a.sha256.localeCompare(b.sha256))) {
      const file = await manager.getRepository(LibraryFileRecord).findOne({ where: { ...actor, sha256: descriptor.sha256, state: 'ready' }, lock: { mode: 'pessimistic_write' } })
      if (!file || file.size !== descriptor.size || file.mimeType !== descriptor.mimeType) throw new BadRequestException('LIBRARY_ASSET_MISSING')
    }
  }
  /** Only owner-scoped, old, unreferenced objects are eligible. Failed deletions keep a retryable row. */
  async cleanup(actor: LibraryActor, before: Date, afterId?: string) {
    if (!Number.isFinite(before.getTime()) || before.getTime() > Date.now() - 24 * 60 * 60 * 1000) throw new BadRequestException('LIBRARY_RETENTION_REQUIRED')
    const query = this.files.createQueryBuilder('f').where('f."tenantId" = :tenantId AND f."organizationId" = :organizationId AND f."ownerId" = :ownerId', actor)
      .andWhere('f."createdAt" < :before', { before }).orderBy('f.id', 'ASC').take(50)
    if (afterId) query.andWhere('f.id > :afterId', { afterId })
    const candidates = await query.getMany()
    let removed = 0
    for (const candidate of candidates) await this.files.manager.transaction(async manager => {
      const repository = manager.getRepository(LibraryFileRecord), file = await repository.findOne({ where: { id: candidate.id, ...actor }, lock: { mode: 'pessimistic_write' } })
      if (!file) return
      for (const entity of [LibraryVersionRecord, LibraryDraftRecord]) {
        const used = await manager.getRepository(entity).createQueryBuilder('r')
          .where('r."tenantId" = :tenantId AND r."organizationId" = :organizationId AND r."ownerId" = :ownerId', actor)
          .andWhere("r.document->'assets' @> CAST(:asset AS jsonb)", { asset: JSON.stringify([{ sha256: file.sha256 }]) }).getExists()
        if (used) return
      }
      // Platform Artifacts own content retention; deleting that container revokes its access.
      const artifacts = this.runtime.require(ArtifactsRuntimeCapability)
      const artifactId = file.artifactId ?? (await artifacts.findArtifactBySource({ pluginName: PLUGIN_NAME,
        resourceType: LIBRARY_FILE_TYPE, resourceId: `user/${actor.ownerId}/${actor.organizationId}/${file.sha256}` }))?.id
      if (artifactId) await artifacts.deleteArtifact(artifactId)
      await repository.delete({ id: file.id, ...actor }); removed++
    })
    return { removed, scanned: candidates.length, nextCursor: candidates.length === 50 ? candidates.at(-1)!.id : null }
  }
}
