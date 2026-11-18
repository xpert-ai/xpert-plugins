import type { Repository } from 'typeorm'
import type { ReviewRepository, ReviewRun } from './automation-entities.js'
import type { Scope } from './domain.js'

export function visibleReviewRuns(
  runs: Repository<ReviewRun>,
  s: Pick<Scope, 'tenantId' | 'organizationId' | 'userId' | 'assistantId'> & { projectId?: string | null },
  repositories: ReviewRepository[]
) {
  return (
    runs
      .createQueryBuilder('run')
      .where('run."tenantId" = :tenantId AND run."organizationId" = :organizationId', s)
      .andWhere('run."repositoryPolicyId" IN (:...repositoryIds)', {
        repositoryIds: repositories.map((p) => p.id).concat('00000000-0000-0000-0000-000000000000')
      })
      // A newly shared repository must not expose its historical private runs.
      .andWhere(
        `(run."evidenceUserId" = :evidenceUserId OR (run."evidenceUserId" IS NULL AND run."organizationShared" = false AND run."repositoryPolicyId" IN (:...ownedIds)) OR (run."organizationShared" = true AND run."assistantId" = :sharedAssistantId AND :organizationEvidence = true) OR
        (run.settings->>'visibility' = 'project' AND run.settings->'pipeline'->>'projectId' = :projectId))`,
        {
          evidenceUserId: s.userId,
          organizationEvidence: false,
          sharedAssistantId: s.assistantId,
          ownedIds: repositories
            .filter((p) => p.userId === s.userId && p.assistantId === s.assistantId)
            .map((p) => p.id)
            .concat('00000000-0000-0000-0000-000000000000'),
          projectId: s.projectId ?? null
        }
      )
  )
}
