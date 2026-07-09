import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { UnauthorizedException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { SitesDeployment, SitesEnvironmentVariable, SitesProject, SitesShareLink, SitesVersion } from './entities/index.js'
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
        for (const item of input) {
          saved.push(await this.save(item) as T)
        }
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
      if (index >= 0) {
        items[index] = entity
      } else {
        items.push(entity)
      }
      return entity
    },
    async findOne(options: { where: Partial<T> }) {
      return items.find((item) => matchesWhere(item, options.where)) ?? null
    },
    async find(options?: { where?: Partial<T>; take?: number }) {
      const rows = options?.where ? items.filter((item) => matchesWhere(item, options.where ?? {})) : [...items]
      return typeof options?.take === 'number' ? rows.slice(0, options.take) : rows
    },
    async count(options?: { where?: Partial<T> }) {
      return options?.where ? items.filter((item) => matchesWhere(item, options.where ?? {})).length : items.length
    },
    async delete(where: Partial<T>) {
      const before = items.length
      for (let index = items.length - 1; index >= 0; index--) {
        if (matchesWhere(items[index], where)) {
          items.splice(index, 1)
        }
      }
      return { affected: before - items.length }
    }
  }
}

function matchesWhere<T>(item: T, where: Partial<T>) {
  return Object.entries(where).every(([key, expected]) => {
    const value = Reflect.get(item as object, key)
    return expected === undefined || value === expected
  })
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

function createService() {
  const projectRepository = createRepository<SitesProject>([
    {
      id: 'project-id',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      assistantId: scope.assistantId,
      createdById: scope.userId,
      slug: 'site-slug',
      name: 'Site'
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
      previewHtml: '<!doctype html><html><body>Shared site</body></html>',
      artifactDigest: 'artifact-digest',
      files: []
    }
  ])
  const deploymentRepository = createRepository<SitesDeployment>([
    {
      id: 'deployment-id',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      assistantId: scope.assistantId,
      projectId: 'project-id',
      versionId: 'version-id',
      deploymentUrl: 'https://example.com/api/xpert-sites/site-slug?v=1',
      status: 'deployed',
      accessMode: 'workspace_all'
    }
  ])
  const environmentRepository = createRepository<SitesEnvironmentVariable>()
  const shareLinkRepository = createRepository<SitesShareLink>()
  const service = new SitesService(
    asRepository(projectRepository),
    asRepository(versionRepository),
    asRepository(deploymentRepository),
    asRepository(environmentRepository),
    asRepository(shareLinkRepository)
  )

  return {
    service,
    repositories: {
      shareLinks: shareLinkRepository
    }
  }
}

export async function assertSitesShareLinkBehavior() {
  const previousApiBaseUrl = process.env['API_BASE_URL']
  process.env['API_BASE_URL'] = 'https://xpert.example.com/api'

  try {
    const { service, repositories } = createService()

    const share = await service.createDeploymentShareLink(
      {
        deploymentId: 'deployment-id',
        noExpiry: true,
        label: 'review'
      },
      scope
    )

    assert.equal(share.shareLink.deploymentId, 'deployment-id')
    assert.equal(share.shareLink.projectId, 'project-id')
    assert.equal(share.shareLink.versionId, 'version-id')
    assert.equal(share.shareLink.status, 'active')
    assert.equal(share.shareLink.label, 'review')
    assert.equal(Object.prototype.hasOwnProperty.call(share.shareLink, 'tokenHash'), false)
    assert.match(share.previewUrl, /^https:\/\/xpert\.example\.com\/api\/xpert-sites\/share\/id-1\?token=/)

    const persisted = repositories.shareLinks.items[0]
    assert.equal(persisted.accessCount, 0)
    assert.equal(persisted.tokenHash?.length, 64)
    assert.notEqual(persisted.tokenHash, share.token)

    const sharedSite = await service.findSharedDeploymentSite(share.shareLink.id ?? '', share.token)
    assert.equal(sharedSite.html, '<!doctype html><html><body>Shared site</body></html>')
    assert.equal(repositories.shareLinks.items[0].accessCount, 1)
    assert.ok(repositories.shareLinks.items[0].lastAccessedAt instanceof Date)

    await assert.rejects(
      service.findSharedDeploymentSite(share.shareLink.id ?? '', 'wrong-token'),
      UnauthorizedException
    )

    const expiring = await service.createDeploymentShareLink(
      {
        deploymentId: 'deployment-id',
        expiresAt: new Date(Date.now() + 60_000)
      },
      scope
    )
    const expiringRecord = repositories.shareLinks.items.find((link) => link.id === expiring.shareLink.id)
    assert.ok(expiringRecord?.expiresAt instanceof Date)
    expiringRecord.expiresAt = new Date(Date.now() - 1_000)
    await assert.rejects(
      service.findSharedDeploymentSite(expiring.shareLink.id ?? '', expiring.token),
      UnauthorizedException
    )

    const revoked = await service.revokeShareLink(
      {
        shareLinkId: share.shareLink.id ?? '',
        reason: 'no longer needed'
      },
      scope
    )
    assert.equal(revoked.status, 'revoked')
    assert.equal(revoked.revokedById, scope.userId)
    assert.equal(revoked.revokedReason, 'no longer needed')
    await assert.rejects(
      service.findSharedDeploymentSite(share.shareLink.id ?? '', share.token),
      UnauthorizedException
    )

    const listed = await service.listShareLinks(
      {
        deploymentId: 'deployment-id',
        status: 'revoked',
        limit: 10
      },
      scope
    )
    assert.deepEqual(listed.map((link) => link.id), [share.shareLink.id])
  } finally {
    if (previousApiBaseUrl === undefined) {
      delete process.env['API_BASE_URL']
    } else {
      process.env['API_BASE_URL'] = previousApiBaseUrl
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertSitesShareLinkBehavior().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
