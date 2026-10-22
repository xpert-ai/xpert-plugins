import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProjectAccessRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { projectContext, ReviewPipelineCatalog } from './pipeline/catalog.js'
import { GitHubApp } from './github-app.js'
import { ReviewRepository } from './automation-entities.js'
import { defaultPolicy, policySettingsSchema, type PolicySettings } from './automation-domain.js'
import { ReviewError, type Scope } from './domain.js'

export const repositoryScope = (s: Scope) => ({ tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId, userId: s.userId })
@Injectable()
export class Repositories {
  constructor(@InjectRepository(ReviewRepository) readonly records: Repository<ReviewRepository>, readonly app: GitHubApp, private readonly catalog: ReviewPipelineCatalog,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}
  async list(s: Scope) {
    const projectId = s.runtime?.projectId
    if (!projectId) return this.records.find({ where: repositoryScope(s), order: { createdAt: 'DESC' }, take: 100 })
    await this.capabilities.require(ProjectAccessRuntimeCapability).assertEdit(projectContext(s, projectId))
    return this.records.createQueryBuilder('repository').where('repository."tenantId" = :tenantId AND repository."organizationId" = :organizationId', s)
      .andWhere('repository."assistantId" = :assistantId', { assistantId: s.assistantId })
      .andWhere(`(repository."userId" = :userId OR
        (repository.settings->>'visibility' = 'project' AND repository.settings->'pipeline'->>'projectId' = :projectId))`, { ...s, projectId })
      .orderBy('repository."createdAt"', 'DESC').take(100).getMany()
  }
  async get(s: Scope, id: string) {
    const record = await this.records.findOneBy({ tenantId: s.tenantId, organizationId: s.organizationId, id })
    if (record && (record.userId !== s.userId || record.assistantId !== s.assistantId)) {
      if (!record.settings.pipeline || record.settings.visibility !== 'project') throw new ReviewError('repository_not_found')
      await this.capabilities.require(ProjectAccessRuntimeCapability).assertManage(projectContext(s, record.settings.pipeline.projectId))
    }
    if (!record) throw new ReviewError('repository_not_found')
    return record
  }
  async add(s: Scope, owner: string, repository: string) {
    if (!s.workspaceId) throw new ReviewError('workspace_required')
    const identity = await this.app.inspect(s, owner, repository)
    const prior = await this.records.findOneBy({ installationId: identity.installationId, repositoryId: identity.repositoryId })
    if (prior) {
      if (prior.tenantId !== s.tenantId || prior.organizationId !== s.organizationId || prior.assistantId !== s.assistantId || prior.userId !== s.userId)
        throw new ReviewError('repository_already_configured')
      return prior
    }
    return this.records.save(this.records.create({ ...repositoryScope(s), workspaceId: s.workspaceId, ...identity, settings: defaultPolicy }))
  }
  async save(s: Scope, id: string, revision: number, input: PolicySettings) {
    const settings = policySettingsSchema.parse(input), existing = await this.get(s, id)
    if (settings.enabled && !settings.pipeline) throw new ReviewError('pipeline_binding_required')
    if (settings.pipeline) {
      if (settings.visibility !== 'project' || settings.delivery !== 'draft') throw new ReviewError('pipeline_policy_invalid')
      await this.catalog.validate(s, settings.pipeline)
    }
    let binding = { githubIntegrationId: existing.githubIntegrationId, githubAppId: existing.githubAppId }
    // Revalidate GitHub authority before expanding unattended access. Pausing remains available when disconnected.
    if (settings.enabled) {
      const identity = await this.app.inspect(s, existing.owner, existing.repository)
      if (identity.installationId !== existing.installationId || identity.repositoryId !== existing.repositoryId) throw new ReviewError('installation_changed')
      binding = { githubIntegrationId: identity.githubIntegrationId, githubAppId: identity.githubAppId }
    }
    const result = await this.records.update({ ...repositoryScope(existing), id, revision }, { ...binding, settings, revision: revision + 1, confirmedAt: new Date(), errorCode: null })
    if (result.affected !== 1) throw new ReviewError('revision_conflict')
    return this.get(s, id)
  }
  async github(s: Scope, id: string) {
    const p = await this.get(s, id)
    return this.app.installation(p.installationId, p.repositoryId, s, p)
  }
}
