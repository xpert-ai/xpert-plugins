import type { SpaceActor } from './domain.js'
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  ArtifactsRuntimeCapability, WorkspaceFilesRuntimeCapability, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  type AgentMiddlewareRuntimeServiceApi, type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { SpaceAccess } from './access.js'
import { Space, SpaceItem, SpaceFileVersion } from './entities.js'
import { SpacePages } from './pages.js'
import { SpaceDocuments, contentHash } from './documents.js'
import { SpaceKnowledge } from './knowledge.js'
import { SpacesService } from './spaces.js'
import { denied, PLUGIN, scoped } from './domain.js'

@Injectable()
export class SpaceFiles {
  constructor(private readonly access: SpaceAccess, private readonly pages: SpacePages, private readonly spaces: SpacesService,
    private readonly documents: SpaceDocuments,
    private readonly knowledge: SpaceKnowledge,
    @InjectRepository(SpaceFileVersion) private readonly versions: Repository<SpaceFileVersion>,
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN) private readonly runtime: AgentMiddlewareRuntimeServiceApi) {}

  async put(actor: SpaceActor, itemId: string, buffer: Buffer, fileName: string, mimeType: string, revisionId: string | null = null, updateCurrent = true) {
    const access = await this.access.resource(actor, itemId, 'write')
    if (!access.space.projectId || !access.item || buffer.byteLength > 25 * 1024 * 1024) throw denied()
    const safeName = fileName.replace(/[\\/\u0000-\u001f]/gu, '_').replace(/^\.+/u, '_').slice(0, 180) || 'file'
    const versionId = randomUUID()
    // Space is a Project extension; current files and snapshots share its volume and ACL.
    const folder = `.space-history/${itemId}/${versionId}`
    const scope = { ...scoped(actor), userId: actor.userId, catalog: 'projects' as const,
      projectId: access.space.projectId, scopeId: access.space.projectId }
    const files = this.runtime.createScopedApi(scope).capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new Error('spaces.files_unavailable')
    const uploaded = await files.uploadBuffer({ ...scope, buffer, originalName: safeName, fileName: safeName, folder, mimeType })
    const reference: WorkspacePortableFileReference = { ...scope, source: 'platform.workspace.files',
      filePath: uploaded.filePath, workspacePath: uploaded.filePath, originalName: safeName, mimeType, size: buffer.byteLength }
    const version = await this.versions.save(this.versions.create({ ...scoped(actor), id: versionId, itemId,
      createdById: actor.userId, reference, revisionId, sha256: createHash('sha256').update(buffer).digest('hex') }))
    if (updateCurrent) {
      await this.documents.write(actor, itemId, buffer)
      await this.access.items.update({ ...scoped(actor), id: itemId }, { file: reference, currentFileVersionId: version.id })
      await this.knowledge.sync(actor, access.space, access.item)
    }
    return version
  }
  /** Opaque file protocol. Editor plugins own parsing; this resource owns snapshots and CAS. */
  async editorRead(actor: SpaceActor, itemId: string) {
    const { item, space } = await this.access.resource(actor, itemId, 'read')
    if (!item?.editorKey || !item.currentFileVersionId) throw denied()
    const disk = await this.documents.read(actor, space, item)
    if (!disk || disk.sha256 !== item.fileHash) throw new ConflictException('spaces.version_conflict')
    return { buffer: disk.buffer, revision: this.editorRevision(item) }
  }
  private editorRevision(item: SpaceItem) {
    // Metadata changes (move/trash/restore) invalidate a previously opened file as well.
    return `${item.version}:${item.currentFileVersionId}:${item.fileHash}`
  }
  async editorWrite(actor: SpaceActor, itemId: string, expectedRevision: string, buffer: Buffer) {
    const access = await this.access.resource(actor, itemId, 'write')
    const result = await this.access.items.manager.transaction(async (manager) => {
      await manager.getRepository(Space).findOneOrFail({ where: { ...scoped(actor), id: access.space.id }, lock: { mode: 'pessimistic_write' } })
      const repo = manager.getRepository(SpaceItem)
      const item = await repo.findOneOrFail({ where: { ...scoped(actor), id: itemId }, lock: { mode: 'pessimistic_write' } })
      await this.access.resource(actor, itemId, 'write')
      if (!item.editorKey || !item.currentFileVersionId || !item.filePath || item.deleted) throw denied()
      if (this.editorRevision(item) !== expectedRevision) throw new ConflictException('spaces.version_conflict')
      const disk = await this.documents.read(actor, access.space, item)
      if (!disk || disk.sha256 !== item.fileHash) throw new ConflictException('spaces.version_conflict')
      const version = await this.put(actor, itemId, buffer, item.filePath.split('/').pop() ?? item.title,
        item.file?.mimeType ?? 'application/octet-stream', null, false)
      // ProjectFiles performs a second atomic hash check against edits made outside this resource.
      await this.documents.api().write({ ...this.documents.scope(actor, access.space), path: item.filePath,
        buffer, expectedHash: item.fileHash })
      const updated = { ...item, currentFileVersionId: version.id, file: version.reference,
        fileHash: contentHash(buffer), version: item.version + 1, syncStatus: 'ready' as const, syncError: null }
      await repo.update(item.id, { currentFileVersionId: updated.currentFileVersionId, file: updated.file,
        fileHash: updated.fileHash, version: updated.version, syncStatus: updated.syncStatus, syncError: null })
      return { revision: this.editorRevision(updated) }
    })
    await this.knowledge.sync(actor, access.space, await this.access.items.findOneByOrFail({ ...scoped(actor), id: itemId }))
    return result
  }
  async readBytes(actor: SpaceActor, versionId: string) {
    const version = await this.get(actor, versionId)
    const files = this.runtime.createScopedApi(actor).capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new Error('spaces.files_unavailable')
    return (await files.readBuffer(version.reference)).buffer
  }
  async upload(actor: SpaceActor, spaceId: string, parentId: string | null, fileName: string, mimeType: string, buffer: Buffer) {
    await this.access.resource(actor, parentId ?? spaceId, 'write')
    if (buffer.byteLength > 25 * 1024 * 1024) throw new Error('spaces.file_too_large')
    const item = await this.spaces.createItem(actor, { spaceId, parentId, title: fileName.slice(0, 200), kind: 'file' })
    try { return { item, version: await this.put(actor, item.id, buffer, fileName, mimeType) } }
    catch (error) { await this.access.items.update({ ...scoped(actor), id: item.id }, { deleted: true }); throw error }
  }
  async get(actor: SpaceActor, versionId: string) {
    const version = await this.versions.findOneByOrFail({ ...scoped(actor), id: versionId })
    await this.access.resource(actor, version.itemId, 'read')
    return version
  }
  async list(actor: SpaceActor, itemId: string) {
    await this.access.resource(actor, itemId, 'read')
    return this.versions.find({ where: { ...scoped(actor), itemId }, order: { createdAt: 'DESC' } })
  }
  async exportPage(actor: SpaceActor, itemId: string) {
    const revision = await this.pages.checkpoint(actor, itemId, 'Export')
    const access = await this.access.resource(actor, itemId, 'write')
    const file = await this.put(actor, itemId, Buffer.from(revision.markdown || '\n', 'utf8'), `${access.item?.title ?? 'Page'}.md`, 'text/markdown', revision.id)
    const artifacts = this.runtime.createScopedApi(actor).capabilities?.get(ArtifactsRuntimeCapability)
    if (!artifacts) throw new Error('spaces.artifacts_unavailable')
    const artifact = await artifacts.createArtifact({ source: { pluginName: PLUGIN, resourceType: 'space-item', resourceId: itemId },
      authorizationProviderKey: 'spaces', scope: { projectId: access.space.projectId, userId: null }, kind: 'markdown', title: access.item?.title })
    const version = await artifacts.ensureArtifactVersion({ artifactId: artifact.id, idempotencyKey: `revision:${revision.id}`,
      workspaceFileRef: file.reference, mimeType: 'text/markdown', fileName: file.reference.originalName, sha256: file.sha256,
      sourceVersionId: revision.id })
    const link = await artifacts.createArtifactLink({ artifactId: artifact.id, artifactVersionId: version.version.id,
      versionMode: 'version', access: { mode: 'organization_all' }, presentation: { disposition: 'attachment', allowDownload: true } })
    return { fileVersionId: file.id, revisionId: revision.id, sequence: revision.sequence, artifactId: artifact.id, versionId: version.version.id, url: link.publicUrl }
  }
  async collect(actor: SpaceActor, spaceId: string, parentId: string | null, artifactId: string, versionId: string) {
    await this.access.resource(actor, parentId ?? spaceId, 'write')
    const { artifact, version, buffer } = await this.artifactBytes(actor, artifactId, versionId)
    const item = await this.spaces.createItem(actor, { spaceId, parentId, title: version.fileName ?? artifact.title ?? 'Artifact', kind: 'artifact', artifactId, artifactVersionId: versionId })
    try {
      await this.put(actor, item.id, buffer, version.fileName ?? item.title, version.mimeType ?? 'application/octet-stream')
    } catch (error) { await this.access.items.update(item.id, { deleted: true }); throw error }
    return item
  }
  async artifactBytes(actor: SpaceActor, artifactId: string, versionId: string) {
    const artifacts = this.runtime.createScopedApi(actor).capabilities?.get(ArtifactsRuntimeCapability)
    if (!artifacts) throw new Error('spaces.artifacts_unavailable')
    return artifacts.readArtifactVersion({ artifactId, artifactVersionId: versionId, purpose: 'copy' })
  }
  async available(actor: SpaceActor, page: number) {
    await this.access.project(actor)
    const api = this.runtime.createScopedApi(actor).capabilities?.require(ArtifactsRuntimeCapability)
    if (!api) throw new Error('spaces.artifacts_unavailable')
    const result = await api.listArtifacts({ page, pageSize: 40 })
    return { ...result, items: await Promise.all(result.items.map(async (artifact) => ({
      id: artifact.id, title: artifact.title, versions: (await api.listArtifactVersions({ artifactId: artifact.id })).filter((version) => version.workspaceFileRef)
    }))) }
  }
  async current(actor: SpaceActor, itemId: string) {
    const { item, space } = await this.access.resource(actor, itemId, 'read')
    if (!space.projectId || !item?.filePath || item.kind === 'folder') throw denied()
    return { reference: { ...scoped(actor), userId: actor.userId, projectId: space.projectId,
      catalog: 'projects' as const, source: 'platform.workspace.files' as const, filePath: item.filePath,
      scopeId: space.projectId, workspacePath: item.filePath }, fileName: item.filePath.split('/').pop() ?? item.title,
      mimeType: item.kind === 'page' ? 'text/markdown' : item.file?.mimeType ?? 'application/octet-stream' }
  }
  async openArtifact(actor: SpaceActor, itemId: string) {
    const access = await this.access.resource(actor, itemId, 'read')
    if (!access.item?.artifactId) throw denied()
    // Legacy source inspection only. Collected SpaceItems contain independent Project copies.
    const artifacts = this.runtime.createScopedApi(actor).capabilities?.get(ArtifactsRuntimeCapability)
    if (!artifacts) throw new Error('spaces.artifacts_unavailable')
    const artifact = await artifacts.getArtifact(access.item.artifactId)
    const versions = await artifacts.listArtifactVersions({ artifactId: artifact.id })
    const version = versions.find((entry) => entry.id === access.item?.artifactVersionId)
    if (!version) throw denied()
    return { artifact, version }
  }
}
