import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { GitHubApp } from './github-app.js'
import { ReviewRepository } from './automation-entities.js'
import { defaultPolicy, policySettingsSchema, type PolicySettings } from './automation-domain.js'
import { ReviewError, type Scope } from './domain.js'

export const repositoryScope = (s: Scope) => ({ tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId, userId: s.userId })
@Injectable()
export class Repositories {
  constructor(@InjectRepository(ReviewRepository) readonly records: Repository<ReviewRepository>, readonly app: GitHubApp) {}
  list(s: Scope) { return this.records.find({ where: repositoryScope(s), order: { createdAt: 'DESC' }, take: 100 }) }
  async get(s: Scope, id: string) {
    const record = await this.records.findOneBy({ ...repositoryScope(s), id })
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
    let binding = { githubIntegrationId: existing.githubIntegrationId, githubAppId: existing.githubAppId }
    // Revalidate GitHub authority before expanding unattended access. Pausing remains available when disconnected.
    if (settings.enabled) {
      const identity = await this.app.inspect(s, existing.owner, existing.repository)
      if (identity.installationId !== existing.installationId || identity.repositoryId !== existing.repositoryId) throw new ReviewError('installation_changed')
      binding = { githubIntegrationId: identity.githubIntegrationId, githubAppId: identity.githubAppId }
    }
    const result = await this.records.update({ ...repositoryScope(s), id, revision }, { ...binding, settings, revision: revision + 1, confirmedAt: new Date(), errorCode: null })
    if (result.affected !== 1) throw new ReviewError('revision_conflict')
    return this.get(s, id)
  }
  async github(s: Scope, id: string) {
    const p = await this.get(s, id)
    return this.app.installation(p.installationId, p.repositoryId, s, p)
  }
}
