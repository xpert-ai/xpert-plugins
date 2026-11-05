import { z } from 'zod/v3'
import type { EntityManager } from 'typeorm'
import { ReviewPolicyAudit, type ReviewRepository } from './automation-entities.js'
import { ReviewError, type Scope } from './domain.js'
import type { RepositoryConflict } from './repository-conflict-contract.js'

export class RepositoryConflictError extends ReviewError {
  constructor(readonly conflict: RepositoryConflict) { super('repository_owned_elsewhere') }
}

/** Called only after platform and live GitHub configuration checks succeed. */
export async function repositoryConflict(manager: EntityManager, s: Scope, p: ReviewRepository,
  repository: RepositoryConflict['repository'], canReadAssistant: () => Promise<boolean>): Promise<RepositoryConflict> {
  // No identifiers, names, timestamps or audit lookups across tenants.
  if (p.tenantId !== s.tenantId) return { kind: 'other_tenant', repository }
  const audits = manager.getRepository(ReviewPolicyAudit)
  async function label(key: 'actorLabel' | 'organizationLabel' | 'assistantLabel', actorId?: string) {
    const query = audits.createQueryBuilder('audit')
      .select(`audit.snapshot->>'${key}'`, 'label')
      .where('audit."tenantId" = :tenantId AND audit."organizationId" = :organizationId AND audit."repositoryPolicyId" = :policyId',
        { tenantId: p.tenantId, organizationId: p.organizationId, policyId: p.id })
      .andWhere(`NULLIF(audit.snapshot->>'${key}', '') IS NOT NULL`)
    if (actorId) query.andWhere('audit."actorId" = :actorId', { actorId })
    if (key === 'assistantLabel') query.andWhere("audit.snapshot->>'assistantId' = :assistantId", { assistantId: p.assistantId })
    const row = await query.orderBy('audit.revision', 'DESC').limit(1).getRawOne<unknown>()
    return row ? z.object({ label: z.string() }).parse(row).label : null
  }
  const configuredById = p.configuredById ?? p.userId
  const [organizationLabel, configuredByLabel, maintainerLabel, assistantVisible] = await Promise.all([
    p.organizationId === s.organizationId && s.hostSnapshot?.organization?.name
      ? s.hostSnapshot.organization.name : label('organizationLabel'),
    label('actorLabel', configuredById),
    p.responsibleUserId ? label('actorLabel', p.responsibleUserId) : null,
    canReadAssistant()
  ])
  return {
    kind: p.organizationId === s.organizationId ? 'other_assistant' : 'other_organization', repository,
    organization: { id: p.organizationId, label: organizationLabel },
    configuredBy: { id: configuredById, label: configuredByLabel },
    maintainer: p.responsibleUserId ? { id: p.responsibleUserId, label: maintainerLabel } : null,
    assistant: assistantVisible ? { id: p.assistantId, label: await label('assistantLabel') } : null,
    enabled: p.settings.enabled, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString()
  }
}
