// Organization policy metadata and execution evidence have independent authorization boundaries.
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, Repository } from 'typeorm'
import { AIPermissionsEnum, PermissionsEnum } from '@xpert-ai/contracts'
import { AssistantMiddlewareAccessRuntimeCapability, ProjectAccessRuntimeCapability, RequestContext, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { projectContext, ReviewPipelineCatalog } from './pipeline/catalog.js'
import { GitHubApp } from './github-app.js'
import { ReviewPolicyAudit, ReviewRepository, ReviewRun } from './automation-entities.js'
import { defaultPolicy, policySettingsSchema, type PolicySettings } from './automation-domain.js'
import { PLUGIN, MIDDLEWARE, FEATURE, ReviewError, type Scope } from './domain.js'
import { ReviewEvents } from './event-subscription.js'

export const repositoryScope = (s: Scope) => ({ tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId, userId: s.userId })
@Injectable()
export class Repositories {
  constructor(@InjectRepository(ReviewRepository) readonly records: Repository<ReviewRepository>, readonly app: GitHubApp, private readonly catalog: ReviewPipelineCatalog,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry,
    private readonly events: ReviewEvents) {}
  async access(s: Scope) {
    return { canRead: !!s.assistant, canManage: !!s.assistant && !!s.permissions?.includes(AIPermissionsEnum.XPERT_EDIT), organizationName: s.hostSnapshot?.organization?.name ?? '' }
  }
  private canManageOrganization(s: Scope) {
    return [PermissionsEnum.ALL_ORG_EDIT, PermissionsEnum.SUPER_ADMIN_EDIT].some(permission => s.permissions?.includes(permission))
  }
  private actorLabel(s: Scope) {
    const user = RequestContext.currentUser()
    return user?.id === s.userId && user.tenantId === s.tenantId
      ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '' : ''
  }
  async manage(s: Scope) {
    const access = await this.access(s)
    if (!access.canManage) throw new ReviewError('assistant_manager_required')
    return access
  }
  async list(s: Scope) {
    if ((await this.access(s)).canRead) return this.records.find({ where: { tenantId: s.tenantId, organizationId: s.organizationId, ...(this.canManageOrganization(s) ? {} : { assistantId: s.assistantId }) }, order: { createdAt: 'DESC' }, take: 100 })
    const projectId = s.runtime?.projectId
    if (!projectId) return this.records.find({ where: repositoryScope(s), order: { createdAt: 'DESC' }, take: 100 })
    await this.capabilities.require(ProjectAccessRuntimeCapability).assertEdit(projectContext(s, projectId))
    return this.records.createQueryBuilder('repository').where('repository."tenantId" = :tenantId AND repository."organizationId" = :organizationId', s)
      .andWhere(`(repository."userId" = :userId AND repository."assistantId" = :assistantId OR
        (repository.settings->>'visibility' = 'project' AND repository.settings->'pipeline'->>'projectId' = :projectId))`, { ...s, projectId })
      .orderBy('repository."createdAt"', 'DESC').take(100).getMany()
  }
  async get(s: Scope, id: string) {
    const record = await this.records.findOneBy({ tenantId: s.tenantId, organizationId: s.organizationId, id })
    if (!record) throw new ReviewError('repository_not_found')
    if (record.ownership === 'assistant' && record.executionUserId === s.userId) {
      const execution = await this.execution(record)
      if (execution.assistantId !== s.assistantId) throw new ReviewError('repository_not_found')
      return execution
    }
    if ((await this.access(s)).canRead && (record.assistantId === s.assistantId || this.canManageOrganization(s))) return record
    if (record.userId === s.userId && record.assistantId === s.assistantId) return record
    if (!record.settings.pipeline || record.settings.visibility !== 'project') throw new ReviewError('repository_not_found')
    await this.capabilities.require(ProjectAccessRuntimeCapability).assertManage(projectContext(s, record.settings.pipeline.projectId))
    return record
  }
  async execution(p: ReviewRepository): Promise<ReviewRepository> {
    if (p.ownership !== 'assistant' || !p.executionUserId) throw new ReviewError('assistant_binding_required')
    await this.capabilities.require(AssistantMiddlewareAccessRuntimeCapability).assertAccess({
      actor: { tenantId: p.tenantId, organizationId: p.organizationId, userId: p.executionUserId }, assistantId: p.assistantId,
      provider: MIDDLEWARE, requiredFeature: FEATURE, scope: { type: 'assistant' }
    }).catch(() => { throw new ReviewError('assistant_execution_unavailable') })
    return { ...p, userId: p.executionUserId, revision: p.executionRevision }
  }

  private async audit(manager: EntityManager, s: Scope, p: ReviewRepository, action: ReviewPolicyAudit['action']) {
    await manager.getRepository(ReviewPolicyAudit).save({ tenantId: p.tenantId, organizationId: p.organizationId, repositoryPolicyId: p.id,
      revision: p.revision, actorId: s.userId, action, snapshot: { actorLabel: this.actorLabel(s), assistantLabel: p.assistantId === s.assistantId ? s.hostSnapshot?.title || s.hostSnapshot?.name || '' : '', workspaceLabel: p.workspaceId === s.workspaceId ? s.hostSnapshot?.workspace?.name ?? '' : '', ownership: p.ownership, assistantId: p.assistantId, workspaceId: p.workspaceId,
        configuredById: p.configuredById, responsibleUserId: p.responsibleUserId, executionRevision: p.executionRevision, settings: p.settings } })
  }
  async add(s: Scope, owner: string, repository: string) {
    await this.manage(s)
    const workspaceId = s.workspaceId
    if (!workspaceId) throw new ReviewError('workspace_required')
    if (!s.assistant?.principalUserId) throw new ReviewError('assistant_binding_required')
    const identity = await this.app.inspect(s, owner, repository)
    return this.records.manager.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`code-review-repository:${identity.installationId}:${identity.repositoryId}`])
      const prior = await manager.findOneBy(ReviewRepository, { installationId: identity.installationId, repositoryId: identity.repositoryId })
      if (prior) {
        if (prior.tenantId !== s.tenantId || prior.organizationId !== s.organizationId ||
          (prior.assistantId !== s.assistantId && !this.canManageOrganization(s))) throw new ReviewError('repository_owned_elsewhere')
        return prior
      }
      const p = await manager.save(ReviewRepository, manager.create(ReviewRepository, { ...repositoryScope(s), workspaceId, ...identity,
        ownership: 'assistant', executionUserId: s.assistant?.principalUserId, configuredById: s.userId, updatedById: s.userId, responsibleUserId: s.userId, settings: { ...defaultPolicy, visibility: 'organization' } }))
      await this.audit(manager, s, p, 'created')
      return p
    })
  }
  async preview(s: Scope, id: string) {
    await this.manage(s)
    const p = await this.get(s, id)
    const pending = await this.records.manager.getRepository(ReviewRun).countBy({ repositoryPolicyId: id, status: In(['running', 'publishing', 'awaiting_confirmation', 'awaiting_revision', 'blocked', 'publication_unknown']) })

    return { id, revision: p.revision, ownership: p.ownership, target: { assistantId: s.assistantId, workspaceId: s.workspaceId },
      targetLabels: { assistant: s.hostSnapshot?.title || s.hostSnapshot?.name || '', workspace: s.hostSnapshot?.workspace?.name ?? '' },
      preservesHistoricalPrivacy: true, pausesAutomation: true, blocked: pending > 0, existingAssistantId: p.assistantId,
      existingWorkspaceId: p.workspaceId, settings: p.settings }
  }
  async bind(s: Scope, id: string, revision: number) {
    await this.manage(s)
    await this.get(s, id)
    const workspaceId = s.workspaceId
    if (!workspaceId) throw new ReviewError('workspace_required')
    const p = await this.records.manager.transaction(async manager => {
      const existing = await manager.findOne(ReviewRepository, { where: { id, tenantId: s.tenantId, organizationId: s.organizationId }, lock: { mode: 'pessimistic_write' } })
      if (!existing || existing.revision !== revision) throw new ReviewError('revision_conflict')
      if (await manager.countBy(ReviewRun, { repositoryPolicyId: id, status: In(['running', 'publishing', 'awaiting_confirmation', 'awaiting_revision', 'blocked', 'publication_unknown']) })) throw new ReviewError('publication_reconciliation_required')
      const identity = await this.app.inspect(s, existing.owner, existing.repository, existing.settings.onWorkflowFailure || existing.settings.onWorkflowTimeout, existing.settings.onWorkflowTimeout)
      if (identity.installationId !== existing.installationId || identity.repositoryId !== existing.repositoryId) throw new ReviewError('installation_changed')
      if (existing.settings.executionMode === 'pipeline' && !existing.settings.pipeline) throw new ReviewError('pipeline_binding_required')
      if (existing.settings.pipeline) await this.catalog.validate(s, existing.settings.pipeline)
      const userId = s.assistant?.principalUserId
      if (!userId) throw new ReviewError('assistant_binding_required')
      const p = { ...existing, ...identity, ownership: 'assistant' as const, assistantId: s.assistantId, workspaceId,
        executionUserId: userId, configuredById: existing.configuredById ?? existing.userId,
        updatedById: s.userId, responsibleUserId: s.userId, revision: revision + 1, executionRevision: existing.executionRevision + 1,
        settings: { ...existing.settings, enabled: false, visibility: existing.settings.executionMode === 'assistant' ? 'organization' as const : existing.settings.visibility }, errorCode: null }
      await this.execution(p)
      await manager.save(ReviewRepository, p)
      await this.audit(manager, s, p, 'rebound')
      return p
    })
    return p
  }
  async save(s: Scope, id: string, revision: number, input: PolicySettings) {
    await this.manage(s)
    const settings = policySettingsSchema.parse(input), existing = await this.get(s, id)
    if (existing.revision !== revision) throw new ReviewError('revision_conflict')
    if (settings.executionMode === 'assistant') {
      if (settings.pipeline || settings.visibility !== (existing.ownership === 'assistant' ? 'organization' : 'private') || settings.delivery !== 'draft') throw new ReviewError('assistant_policy_invalid')
    } else {
      if (settings.enabled && !settings.pipeline) throw new ReviewError('pipeline_binding_required')
    }
    if (settings.enabled && (settings.executionMode === 'assistant' || settings.onWorkflowFailure || settings.onWorkflowTimeout))
      await this.events.access(await this.execution({ ...existing, settings }))
    if (settings.executionMode === 'pipeline' && settings.pipeline) {
      if (settings.visibility !== 'project' || settings.delivery !== 'draft') throw new ReviewError('pipeline_policy_invalid')
      await this.catalog.validate(s, settings.pipeline)
    }
    let binding = { githubIntegrationId: existing.githubIntegrationId, githubAppId: existing.githubAppId }
    if (settings.enabled) {
      await this.execution({ ...existing, settings })
      const identity = await this.app.inspect(s, existing.owner, existing.repository, settings.onWorkflowFailure || settings.onWorkflowTimeout, settings.onWorkflowTimeout)
      if (identity.installationId !== existing.installationId || identity.repositoryId !== existing.repositoryId) throw new ReviewError('installation_changed')
      binding = { githubIntegrationId: identity.githubIntegrationId, githubAppId: identity.githubAppId }
    }
    return this.records.manager.transaction(async manager => {
      const p = { ...existing, ...binding, settings, revision: revision + 1, executionRevision: existing.executionRevision + 1, updatedById: s.userId, confirmedAt: new Date(), errorCode: null }
      const result = await manager.update(ReviewRepository, { tenantId: s.tenantId, organizationId: s.organizationId, id, revision },
        { ...binding, settings, revision: revision + 1, executionRevision: existing.executionRevision + 1, updatedById: s.userId, confirmedAt: p.confirmedAt, errorCode: null })
      if (result.affected !== 1) throw new ReviewError('revision_conflict')
      await this.audit(manager, s, p, 'saved')
      return p
    })
  }
  async github(s: Scope, id: string) {
    const p = await this.get(s, id)
    return this.app.installation(p.installationId, p.repositoryId, s, p, p.settings.onWorkflowFailure || p.settings.onWorkflowTimeout, p.settings.onWorkflowTimeout)
  }
  async assertAssistantExecution(s: Scope, id: string, revision: number, trial: boolean) {
    const p = await this.get(s, id)
    if (p.revision !== revision || (!p.settings.enabled && !trial) || p.settings.executionMode !== 'assistant') throw new ReviewError('policy_changed')
    const execution = await this.execution(p)
    if (trial) await this.events.access(execution)
    else await this.events.assertListening(execution)
  }
  async history(s: Scope, id: string) {
    await this.manage(s)
    await this.get(s, id)
    return this.records.manager.getRepository(ReviewPolicyAudit).find({ where: { tenantId: s.tenantId, organizationId: s.organizationId, repositoryPolicyId: id },
      order: { revision: 'DESC' }, take: 50 })
  }
  async maintain(s: Scope, id: string, revision: number) {
    await this.manage(s)
    await this.get(s, id)
    return this.records.manager.transaction(async manager => {
      const p = await manager.findOne(ReviewRepository, { where: { id, tenantId: s.tenantId, organizationId: s.organizationId }, lock: { mode: 'pessimistic_write' } })
      if (!p || p.revision !== revision) throw new ReviewError('revision_conflict')
      p.responsibleUserId = s.userId; p.updatedById = s.userId; p.revision++
      await manager.save(ReviewRepository, p)
      await this.audit(manager, s, p, 'maintained')
      return p
    })
  }
  async labels(s: Scope, policies: ReviewRepository[]) {
    if (!(await this.access(s)).canRead) return { users: [], assistants: [], workspaces: [] }
    const audits = policies.length ? await this.records.manager.getRepository(ReviewPolicyAudit).find({
      where: { tenantId: s.tenantId, organizationId: s.organizationId, repositoryPolicyId: In(policies.map(p => p.id)) },
      order: { revision: 'DESC' }, take: 100 }) : []
    const users = new Map<string, string>(), assistants = new Map<string, string>(), workspaces = new Map<string, string>()
    for (const row of audits) {
      const snapshot = row.snapshot
      if (typeof snapshot.actorLabel === 'string' && snapshot.actorLabel && !users.has(row.actorId)) users.set(row.actorId, snapshot.actorLabel)
      if (typeof snapshot.assistantId === 'string' && typeof snapshot.assistantLabel === 'string' && snapshot.assistantLabel && !assistants.has(snapshot.assistantId)) assistants.set(snapshot.assistantId, snapshot.assistantLabel)
      if (typeof snapshot.workspaceId === 'string' && typeof snapshot.workspaceLabel === 'string' && snapshot.workspaceLabel && !workspaces.has(snapshot.workspaceId)) workspaces.set(snapshot.workspaceId, snapshot.workspaceLabel)
    }
    const actorLabel = this.actorLabel(s)
    if (actorLabel) users.set(s.userId, actorLabel)
    if (s.hostSnapshot) assistants.set(s.assistantId, s.hostSnapshot.title || s.hostSnapshot.name)
    if (s.workspaceId && s.hostSnapshot?.workspace) workspaces.set(s.workspaceId, s.hostSnapshot.workspace.name)
    return { users: [...users].map(([id, label]) => ({ id, label })), assistants: [...assistants].map(([id, label]) => ({ id, label })), workspaces: [...workspaces].map(([id, label]) => ({ id, label })) }
  }
}
