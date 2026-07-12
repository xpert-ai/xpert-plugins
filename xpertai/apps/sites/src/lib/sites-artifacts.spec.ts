import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import type { Repository } from 'typeorm'
import {
  ArtifactsRuntimeCapability,
  DefaultRuntimeCapabilityRegistry,
  WorkspaceFilesRuntimeCapability,
  type ArtifactLinkRecord,
  type ArtifactsApi,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { SitesDeployment, SitesEnvironmentVariable, SitesProject, SitesVersion } from './entities/index.js'
import { SitesService } from './sites.service.js'
import type { SitesScope } from './types.js'

type TestEntity = { id?: string; createdAt?: Date; updatedAt?: Date }

function createRepository<T extends TestEntity>(initial: T[] = []) {
  const items = [...initial]
  let nextId = items.length + 1

  return {
    items,
    create(input: Partial<T>) {
      return { ...input } as T
    },
    async save(input: Partial<T> | Partial<T>[]) {
      if (Array.isArray(input)) {
        const saved: T[] = []
        for (const item of input) saved.push((await this.save(item)) as T)
        return saved
      }
      const now = new Date()
      const entity = {
        ...input,
        id: input.id ?? `id-${nextId++}`,
        createdAt: input.createdAt ?? now,
        updatedAt: now
      } as T
      const index = items.findIndex((item) => item.id === entity.id)
      if (index >= 0) items[index] = entity
      else items.push(entity)
      return entity
    },
    async findOne(options: { where: Partial<T>; order?: Partial<Record<keyof T, 'ASC' | 'DESC'>> }) {
      const rows = items.filter((item) => matchesWhere(item, options.where))
      if (options.order?.['versionNumber' as keyof T] === 'DESC') {
        rows.sort((left, right) => Number(Reflect.get(right, 'versionNumber') ?? 0) - Number(Reflect.get(left, 'versionNumber') ?? 0))
      }
      return rows[0] ?? null
    },
    async find(options?: { where?: Partial<T>; take?: number; order?: Partial<Record<keyof T, 'ASC' | 'DESC'>> }) {
      const rows = options?.where ? items.filter((item) => matchesWhere(item, options.where ?? {})) : [...items]
      return typeof options?.take === 'number' ? rows.slice(0, options.take) : rows
    },
    async count(options?: { where?: Partial<T> }) {
      return options?.where ? items.filter((item) => matchesWhere(item, options.where ?? {})).length : items.length
    },
    async delete(where: Partial<T>) {
      const before = items.length
      for (let index = items.length - 1; index >= 0; index--) {
        if (matchesWhere(items[index], where)) items.splice(index, 1)
      }
      return { affected: before - items.length }
    }
  }
}

function matchesWhere<T>(item: T, where: Partial<T>) {
  return Object.entries(where).every(([key, expected]) => expected === undefined || Reflect.get(item as object, key) === expected)
}

function asRepository<T extends TestEntity>(repository: ReturnType<typeof createRepository<T>>) {
  return repository as unknown as Repository<T>
}

const scope: SitesScope = {
  tenantId: 'tenant-id',
  organizationId: 'organization-id',
  userId: 'user-id',
  assistantId: 'assistant-id',
  conversationId: 'conversation-id'
}

function artifactLink(overrides: Partial<ArtifactLinkRecord> = {}): ArtifactLinkRecord {
  return {
    id: 'artifact-link-1',
    artifactId: 'artifact-1',
    artifactVersionId: null,
    versionMode: 'latest',
    slug: 'AbCdEfGhJkMn',
    publicUrl: 'https://xpert.example.com/artifacts/share/AbCdEfGhJkMn',
    accessMode: 'owner_only',
    status: 'active',
    disposition: 'inline',
    allowDownload: false,
    safeHtmlProfile: 'interactive',
    ...overrides
  }
}

function createFixture() {
  const projectRepository = createRepository<SitesProject>([
    {
      id: 'project-id',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      assistantId: scope.assistantId,
      createdById: scope.userId,
      slug: 'site-slug',
      name: 'Site',
      audience: 'admins_only'
    }
  ])
  const versionRepository = createRepository<SitesVersion>([
    {
      id: 'version-id',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      assistantId: scope.assistantId,
      projectId: 'project-id',
      versionNumber: 1,
      status: 'saved',
      previewHtml: '<!doctype html><html><body>Artifact site</body></html>',
      artifactDigest: 'artifact-digest',
      files: []
    }
  ])
  const deploymentRepository = createRepository<SitesDeployment>()
  const environmentRepository = createRepository<SitesEnvironmentVariable>()
  const calls = {
    createArtifact: [] as Parameters<ArtifactsApi['createArtifact']>[],
    createArtifactVersion: [] as Parameters<ArtifactsApi['createArtifactVersion']>[],
    createArtifactLink: [] as Parameters<ArtifactsApi['createArtifactLink']>[],
    updateArtifactLinkAccess: [] as Parameters<ArtifactsApi['updateArtifactLinkAccess']>[],
    revokeArtifactLink: [] as Parameters<ArtifactsApi['revokeArtifactLink']>[]
  }
  let versionNumber = 0
  const artifacts: ArtifactsApi = {
    async createArtifact(input) {
      calls.createArtifact.push([input])
      return {
        id: 'artifact-1',
        pluginName: input.source.pluginName,
        resourceType: input.source.resourceType,
        resourceId: input.source.resourceId,
        kind: input.kind ?? 'site',
        status: 'active'
      }
    },
    async createArtifactVersion(input) {
      calls.createArtifactVersion.push([input])
      versionNumber += 1
      return {
        id: `artifact-version-${versionNumber}`,
        artifactId: input.artifactId,
        versionNumber,
        status: 'active',
        mimeType: input.mimeType
      }
    },
    async createArtifactLink(input) {
      calls.createArtifactLink.push([input])
      return artifactLink({ accessMode: input.access.mode })
    },
    async updateArtifactLinkAccess(id, patch) {
      calls.updateArtifactLinkAccess.push([id, patch])
      return artifactLink({ id, accessMode: patch.access?.mode ?? 'owner_only' })
    },
    async revokeArtifactLink(idOrSlug) {
      calls.revokeArtifactLink.push([idOrSlug])
      return artifactLink({ id: idOrSlug, status: 'revoked' })
    },
    async createSignedPreviewLink(input) {
      return artifactLink({ artifactId: input.artifactId, accessMode: 'signed_preview' })
    },
    async getArtifact() {
      throw new Error('not used')
    },
    async listArtifacts() {
      return { items: [], total: 0, page: 1, pageSize: 20 }
    },
    async archiveArtifact() {
      throw new Error('not used')
    },
    async deleteArtifact() {
      throw new Error('not used')
    }
  }
  const workspaceFiles: WorkspaceFilesApi = {
    async writeRuntimeBuffer(input) {
      return {
        name: input.fileName ?? input.originalName ?? 'site.html',
        filePath: `sites/deployments/${input.fileName ?? 'site.html'}`,
        workspacePath: `/workspace/sites/deployments/${input.fileName ?? 'site.html'}`,
        mimeType: input.mimeType ?? 'text/html',
        size: input.buffer.length,
        catalog: input.catalog ?? 'xperts',
        scopeId: input.scopeId ?? undefined,
        reference: {
          source: 'platform.workspace.files',
          filePath: `sites/deployments/${input.fileName ?? 'site.html'}`,
          workspacePath: `/workspace/sites/deployments/${input.fileName ?? 'site.html'}`,
          mimeType: input.mimeType ?? 'text/html',
          size: input.buffer.length,
          catalog: input.catalog ?? 'xperts',
          scopeId: input.scopeId ?? undefined
        }
      }
    },
    async uploadBuffer() { throw new Error('not used') },
    async understandFile() { throw new Error('not used') },
    async readBuffer() { throw new Error('not used') },
    async deleteFile() { throw new Error('not used') },
    async resolveRuntimeReference() { throw new Error('not used') },
    async readRuntimeBuffer() { throw new Error('not used') }
  }
  const capabilities = new DefaultRuntimeCapabilityRegistry()
    .register(ArtifactsRuntimeCapability, artifacts)
    .register(WorkspaceFilesRuntimeCapability, workspaceFiles)
  const service = new SitesService(
    asRepository(projectRepository),
    asRepository(versionRepository),
    asRepository(deploymentRepository),
    asRepository(environmentRepository),
    capabilities
  )

  return { service, calls, repositories: { projects: projectRepository, deployments: deploymentRepository } }
}

export async function assertSitesArtifactsBehavior() {
  const fixture = createFixture()
  const first = await fixture.service.deployVersion({ projectId: 'project-id', versionId: 'version-id' }, scope)

  assert.equal(first.artifactId, 'artifact-1')
  assert.equal(first.artifactVersionId, 'artifact-version-1')
  assert.equal(first.artifactLinkId, 'artifact-link-1')
  assert.match(first.deploymentUrl ?? '', /\/artifacts\/share\/[23456789A-HJ-NP-Za-km-z]{12}$/)
  assert.equal(fixture.calls.createArtifact[0][0].source.resourceType, 'sites_project')
  assert.equal(fixture.calls.createArtifact[0][0].source.resourceId, 'project-id')
  assert.equal(fixture.calls.createArtifactLink[0][0].versionMode, 'latest')

  const second = await fixture.service.deployVersion({ projectId: 'project-id', versionId: 'version-id' }, scope)
  assert.equal(second.artifactId, 'artifact-1')
  assert.equal(second.artifactVersionId, 'artifact-version-2')
  assert.equal(fixture.calls.createArtifactVersion.length, 2)
  assert.equal(fixture.calls.createArtifactLink.length, 1)
  assert.equal(fixture.calls.updateArtifactLinkAccess.length, 1)

  await assert.rejects(
    fixture.service.deployVersion({
      projectId: 'project-id',
      versionId: 'version-id',
      accessMode: 'public_link'
    }, scope),
    /explicit user confirmation/
  )

  const published = await fixture.service.publishArtifactLink({
    deploymentId: second.id ?? '',
    userConfirmedPublicLink: true
  }, scope)
  assert.equal(published.accessMode, 'public_link')
  assert.equal(fixture.calls.updateArtifactLinkAccess.at(-1)?.[1].access?.userConfirmedPublicLink, true)

  const revoked = await fixture.service.revokeArtifactLink({ deploymentId: second.id ?? '' }, scope)
  assert.equal(revoked.deployment.artifactLinkId, null)
  assert.equal(revoked.deployment.deploymentUrl, '')
  assert.equal(fixture.calls.revokeArtifactLink.at(-1)?.[0], 'artifact-link-1')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertSitesArtifactsBehavior().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
