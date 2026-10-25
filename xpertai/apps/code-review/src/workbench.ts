import { Injectable } from '@nestjs/common'
import { Automation } from './automation.js'
import { Review } from './entity.js'
import { Reviews } from './backend.js'
import type { Scope } from './domain.js'
import { workbenchEntrySchema, type WorkbenchQuery } from './workbench-contract.js'

/** One row per PR, with a separate paginated history of authorized root executions.
 * Neither snapshots nor Agent child reviews are fetched for the queue. All grouping happens
 * AFTER the original ownership/project predicates, including historical-private-run checks.
 */
@Injectable()
export class ReviewWorkbench {
  constructor(private readonly reviews: Reviews, private readonly automation: Automation) {}
  async page(s: Scope, input: WorkbenchQuery) {
    const repositories = await this.automation.repositories.list(s)
    const manual = (await this.reviews.visibleQuery(s))
      .andWhere('review."pipelineRootReviewId" IS NULL AND review."automationRunId" IS NULL')
      .select([
        'review.id AS id',
        'review.ref AS ref',
        "review.snapshot->>'title' AS title",
        "CASE WHEN review.ref->>'provider' = 'local_git' THEN 'local_git' ELSE 'manual' END AS source",
        "'manual'::text AS trigger",
        'review.status AS status',
        'review.snapshot->>\'headSha\' AS "headSha"',
        'review."createdAt" AS "createdAt"',
        'review."updatedAt" AS "updatedAt"',
        'review.pinned AS pinned',
        'review.id AS "reviewId"',
        'NULL::uuid AS "runId"',
        'review."errorCode" AS reason',
        'review."pipelineProjectId" AS "projectId"',
        'NULL::uuid AS "instanceId"',
        'NULL::uuid AS "roundId"',
        'review."submissionUrl" AS "publicationUrl"'
      ])
    const automatic = this.automation
      .visibleQuery(s, repositories)
      .innerJoin(
        this.automation.repositories.records.metadata.target,
        'repository',
        'repository.id = run."repositoryPolicyId"'
      )
      .leftJoin(
        Review,
        'rootreview',
        'rootreview.id = run."reviewId" AND rootreview."tenantId" = run."tenantId" AND rootreview."organizationId" = run."organizationId" AND rootreview."assistantId" = run."assistantId"'
      )
      .select([
        'run.id AS id',
        `jsonb_build_object('provider','github','owner',repository.owner,'repository',repository.repository,'number',run.number) AS ref`,
        'run.title AS title',
        "'automatic'::text AS source",
        'run.trigger AS trigger',
        'run.status AS status',
        'run."headSha" AS "headSha"',
        'run."createdAt" AS "createdAt"',
        'run."updatedAt" AS "updatedAt"',
        'COALESCE(rootreview.pinned, false) AS pinned',
        'run."reviewId" AS "reviewId"',
        'run.id AS "runId"',
        'run.reason AS reason',
        "(run.settings->'pipeline'->>'projectId')::uuid AS \"projectId\"",
        'run."pipelineInstanceId" AS "instanceId"',
        'run."pipelineRoundId" AS "roundId"',
        'run."publicationUrl" AS "publicationUrl"'
      ])
    const union = `(${manual.getQuery()}) UNION ALL (${automatic.getQuery()})`
    const keyed = `SELECT entries.*, CASE WHEN ref->>'provider' = 'github'
      THEN 'github:' || lower(ref->>'owner') || '/' || lower(ref->>'repository') || '#' || (ref->>'number')
      ELSE 'local_git:' || id::text END AS key FROM (${union}) entries`
    const ranked = `SELECT keyed.*, row_number() OVER (PARTITION BY key ORDER BY "createdAt" DESC, id DESC) AS rank,
      count(*) OVER (PARTITION BY key) AS count, bool_or(pinned) OVER (PARTITION BY key) AS "groupPinned" FROM (${keyed}) keyed`
    const query = this.automation.runs.manager
      .createQueryBuilder()
      .select('entry.*')
      .from(`(${ranked})`, 'entry')
      .setParameters({ ...manual.getParameters(), ...automatic.getParameters() })
    if (input.recordId)
      query.where('(entry.id = :recordId OR entry."reviewId" = :recordId)', { recordId: input.recordId })
    else if (input.history) query.where('entry.key = :history', { history: input.history })
    else query.where('entry.rank = 1')
    if (input.pinned) query.andWhere('entry."groupPinned" = true')
    if (input.repository)
      query.andWhere("lower((entry.ref->>'owner') || '/' || (entry.ref->>'repository')) = :repository", {
        repository: input.repository.toLowerCase()
      })
    if (input.status) query.andWhere('entry.status = :status', { status: input.status })
    if (input.search) {
      const search = `%${input.search.replace(/[\\%_]/g, '\\$&')}%`
      query.andWhere(`(entry.title ILIKE :search OR entry."headSha" ILIKE :search OR entry.key ILIKE :search)`, {
        search
      })
    }
    const counter = await query.clone().select('count(*)', 'total').getRawOne<{ total: string }>()
    const rows: unknown[] = await query
      .orderBy(input.history ? 'entry."createdAt"' : 'entry."groupPinned"', 'DESC')
      .addOrderBy('entry."createdAt"', 'DESC')
      .addOrderBy('entry.id', 'DESC')
      .limit(20)
      .offset((input.page - 1) * 20)
      .getRawMany()
    const items = rows.map((value) => {
      // TypeORM raw timestamptz values are Date objects; the bridge contract is JSON.
      return workbenchEntrySchema.parse(JSON.parse(JSON.stringify(value)))
    })
    const available: { value: string; label: string }[] = await this.automation.runs.manager
      .createQueryBuilder()
      .select("DISTINCT lower((ref->>'owner') || '/' || (ref->>'repository'))", 'value')
      .addSelect("lower((ref->>'owner') || '/' || (ref->>'repository'))", 'label')
      .from(`(${union})`, 'sources')
      .where("ref->>'provider' = 'github'")
      .setParameters({ ...manual.getParameters(), ...automatic.getParameters() })
      .orderBy('value', 'ASC')
      .limit(100)
      .getRawMany()
    return {
      items,
      total: Number(counter?.total ?? 0),
      page: input.page,
      pageSize: 20 as const,
      repositories: available
    }
  }
}
