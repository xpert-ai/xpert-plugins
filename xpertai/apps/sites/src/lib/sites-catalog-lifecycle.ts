import { BadRequestException, ConflictException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { ArtifactsRuntimeCapability, type ContentResourceMutation, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { SitesProject, SitesDeployment } from './entities/index.js'
import { assertSitesProject, sitesWhere } from './sites-project-access.js'
import { readProjectSiteSource, stageProjectSiteRestore } from './sites-project-source.js'
import { siteSourceRevision } from './sites-search.js'
import type { SitesScope } from './types.js'

export const siteCatalogRevision = (site: SitesProject, source: Parameters<typeof siteSourceRevision>[0]) =>
  `${siteSourceRevision(source)}:${site.catalogRevision ?? 0}`

/** Native site row is the lock shared by version capture, publication and lifecycle.
 * Do not copy deployments, environment credentials or audience when duplicating. */
export async function mutateSiteCatalog(runtime: RuntimeCapabilityRegistry, sites: Repository<SitesProject>, scope: SitesScope,
  id: string, expectedRevision: string, change: ContentResourceMutation) {
  await assertSitesProject(runtime, scope, change.action === 'trash' || change.action === 'restore' ? 'manage' : 'write')
  return sites.manager.transaction(async manager => {
    const repo = manager.getRepository(SitesProject)
    const site = await repo.findOneOrFail({ where: { ...sitesWhere(scope), id }, lock: { mode: 'pessimistic_write' } })
    const source = await readProjectSiteSource(runtime, scope, id, site.sourcePath)
    if (siteCatalogRevision(site, source) !== expectedRevision) throw new ConflictException('SITES_VERSION_CONFLICT')
    if (change.action === 'duplicate') {
      if (site.status === 'archived') throw new BadRequestException('SITES_ARCHIVED')
      const existing = await repo.findOneBy({ ...sitesWhere(scope), id: change.requestId })
      if (existing) {
        if (existing.copiedFromId !== id) throw new ConflictException('SITES_COPY_REQUEST_CONFLICT')
        return existing.id!
      }
      // Stage a complete generation before committing the new identity. Failed staging
      // cannot expose a half-copied resource or overwrite a previous successful copy.
      const sourcePath = await stageProjectSiteRestore(runtime, scope, change.requestId, source.files)
      await repo.createQueryBuilder().insert().values({ id: change.requestId, tenantId: scope.tenantId,
        organizationId: scope.organizationId, hostProjectId: scope.hostProjectId, assistantId: scope.assistantId,
        createdById: scope.userId, name: change.title, slug: `site-${change.requestId}`, status: 'draft',
        storageShape: 'static', audience: 'admins_only', sourcePath, copiedFromId: id }).orIgnore().execute()
      const copy = await repo.findOneByOrFail({ ...sitesWhere(scope), id: change.requestId })
      if (copy.copiedFromId !== id) throw new ConflictException('SITES_COPY_REQUEST_CONFLICT')
      return copy.id!
    }
    if (change.action === 'rename') {
      if (site.status === 'archived') throw new BadRequestException('SITES_ARCHIVED')
      site.name = change.title
    } else if (change.action === 'trash') {
      // All historical publication paths, not only the current deployment, must close.
      // A failure aborts the transition; retry is safe for already-revoked paths.
      const artifacts = runtime.require(ArtifactsRuntimeCapability)
      const deployments = await manager.getRepository(SitesDeployment).findBy({ ...sitesWhere(scope), projectId: id })
      for (const deployment of deployments) {
        if (deployment.artifactLinkId) await artifacts.revokeArtifactLink(deployment.artifactLinkId)
        if (deployment.artifactId) await artifacts.archiveArtifact(deployment.artifactId)
      }
      site.status = 'archived'
      site.currentDeploymentId = undefined
      site.currentDeploymentUrl = undefined
    } else if (change.action === 'restore') {
      if (site.status !== 'archived') throw new ConflictException('SITES_VERSION_CONFLICT')
      site.status = 'draft'
    } else throw new BadRequestException('SITES_ACTION_UNAVAILABLE')
    site.catalogRevision = (site.catalogRevision ?? 0) + 1
    // undefined is omitted by TypeORM. Clear publication pointers explicitly in SQL.
    await repo.update({ id: site.id }, { name: site.name, status: site.status, catalogRevision: site.catalogRevision,
      ...(change.action === 'trash' || change.action === 'restore' ? { currentDeploymentId: () => 'NULL', currentDeploymentUrl: () => 'NULL' } : {}) })
    return id
  })
}
