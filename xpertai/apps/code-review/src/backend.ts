import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, In, Repository } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import type { RunnableConfig } from '@langchain/core/runnables'
import { z } from 'zod/v3'
import {
  ProjectAccessRuntimeCapability, AssistantTaskRuntimeCapability, ConnectorRuntimeCapability, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry, type PluginContext, type AgentMiddlewareRuntimeServiceApi
} from '@xpert-ai/plugin-sdk'
import { ReviewPipelineBinding } from './pipeline/entity.js'
import { Review } from './entity.js'
import { localGitImportSchema, localGitSourcesSchema, type LocalGitImport } from './local-git.js'
import { digest, reviewAgentContextSchema } from './pipeline/contract.js'
import { GitHub } from './github.js'
import { Repositories } from './repositories.js'
import { ReviewRun, type ReviewRepository } from './automation-entities.js'
import { ignoredPath } from './automation-domain.js'
import { ReviewError, parsePullUrl, resultSchema, validateFindings, idSchema, reviewLabel, type Scope } from './domain.js'
import { assertPipelineReviewAccess, assertPipelineReviewVersion } from './pipeline/access.js'
import { reviewRuntimeScope } from './runtime-scope.js'

export const CONTEXT = 'CODE_REVIEW_CONTEXT'
const runSchema = z.object({ configurable: z.object({ executionId: idSchema, rootExecutionId: idSchema.optional(),
  context: z.object({ codeReview: z.object({ reviewId: idSchema, headSha: z.string() }) }) }) })
export const submitSchema = z.object({ id: idSchema, revision: z.number().int().positive(),
  headSha: z.string(), confirmed: z.literal(true), event: z.enum(['COMMENT', 'APPROVE', 'REQUEST_CHANGES']),
  body: z.string().trim().min(1).max(12000), findings: z.array(z.number().int().nonnegative()).max(100)
}).strict()
const active = new Set<Review['status']>(['running', 'submitting', 'submission_unknown'])
const selectionSchema = z.object({ configurable: z.object({ context: z.object({ codeReview: z.object({ reviewId: idSchema, headSha: z.string() }) }) }) })
const owner = (s: Scope) => ({ tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId, assistantId: s.assistantId })

@Injectable()
export class Reviews {
  constructor(@InjectRepository(Review) private readonly records: Repository<Review>,
    @Inject(CONTEXT) private readonly context: PluginContext, private readonly repositories: Repositories,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}
  private runtime(s: Scope) {
    return this.context.resolve<AgentMiddlewareRuntimeServiceApi>(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
      .createScopedApi(reviewRuntimeScope(s))
  }
  private tasks(s: Scope) {
    const api = this.runtime(s).capabilities?.get(AssistantTaskRuntimeCapability)
    if (!api) throw new ReviewError('assistant_runtime_unavailable')
    return api
  }
  async github(s: Scope, access: Review['access']) {
    if (access === 'public') return new GitHub()
    const api = this.runtime(s).capabilities?.get(ConnectorRuntimeCapability)
    if (!api) throw new ReviewError('github_auth_required')
    try {
      if (!api.getConnectorCredential) throw new ReviewError('github_auth_required')
      const credential = await api.getConnectorCredential({ provider: 'github' })
      return new GitHub(z.string().min(1).parse(credential.credentials.accessToken))
    }
    catch { throw new ReviewError('github_auth_required') }
  }
  async recordGithub(s: Scope, r: Review) {
    if (r.pipelineRootReviewId) {
      const binding = await this.records.manager.findOneByOrFail(ReviewPipelineBinding, { id: r.pipelineRootReviewId, tenantId: s.tenantId, organizationId: s.organizationId, projectId: r.pipelineProjectId! })
      const root = await this.records.findOneByOrFail({ id: binding.currentReviewId ?? binding.id, tenantId: s.tenantId, organizationId: s.organizationId, userId: binding.userId })
      return root.automationPolicyId ? this.repositories.github({ ...s, userId: root.userId, assistantId: root.assistantId }, root.automationPolicyId) : this.github({ ...s, userId: root.userId, assistantId: root.assistantId, workspaceId: binding.workspaceId }, root.access)
    }
    return r.automationPolicyId ? this.repositories.github({ ...s, userId: r.userId }, r.automationPolicyId) : this.github(s, r.access)
  }
  async prepareAutomatic(p: ReviewRepository, run: ReviewRun) {
    const existing = await this.records.findOneBy({ ...owner(p), automationRunId: run.id })
    if (existing) return existing
    const ref = parsePullUrl(`https://github.com/${p.owner}/${p.repository}/pull/${run.number}`)
    const snapshot = await (await this.repositories.github(p, p.id)).snapshot(ref)
    if (snapshot.headSha !== run.headSha) throw new ReviewError('stale_revision')
    const all = snapshot.files.length
    snapshot.files = snapshot.files.filter(f => !ignoredPath(f.filename, run.settings.ignoredPaths))
    if (snapshot.files.length !== all) snapshot.warnings.push('ignored_files_excluded')
    if (!snapshot.files.length) throw new ReviewError('all_files_excluded')
    return this.records.save(this.records.create({ ...owner(p), ref, snapshot, access: 'connected', status: 'ready',
      organizationShared: p.ownership === 'assistant' && run.settings.visibility === 'organization', automationPolicyId: p.id, automationRunId: run.id, findings: [], viewed: [], summary: '', instructions: run.settings.instructions }))
  }
  async guidance(s: Scope, id: string, revision: number, instructions: string) {
    const r = await this.get(s, id)
    if (r.pipelineProjectId) {
      if (r.instructions !== instructions) throw new ReviewError('pipeline_managed_review')
      return r
    }
    this.expected(r, revision)
    if (r.status !== 'ready' || r.automationRunId) throw new ReviewError('review_not_attachable')
    return r.instructions === instructions ? r : this.update(s, r, { instructions })
  }
  async list(s: Scope, page = 1) {
    const [items, total] = await (await this.visibleQuery(s)).orderBy('review.pinned', 'DESC').addOrderBy('review."updatedAt"', 'DESC')
      .take(20).skip((page - 1) * 20).select(['review.id', 'review.ref', 'review.status', 'review.pinned', 'review.revision', 'review.updatedAt', 'review.summary']).getManyAndCount()
    return { items, total, page, pageSize: 20 }
  }
  /** The workbench uses the same ownership / project visibility boundary as list(). */
  async visibleQuery(s: Scope) {
    const projectIds = (await this.capabilities.require(ProjectAccessRuntimeCapability).listReadable({ actor: {
      tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId
    } })).map(p => p.projectId)
    const access = await this.repositories.access(s)
    return this.records.createQueryBuilder('review')
      .where('review."tenantId" = :tenantId AND review."organizationId" = :organizationId ', s)
      .andWhere(new Brackets(q => {
        q.where('review."userId" = :userId AND review."assistantId" = :assistantId', s)
        if (access.canRead) q.orWhere('review."organizationShared" = true AND review."assistantId" = :assistantId', s)
        if (projectIds.length) q.orWhere('review."projectShared" = true AND review."pipelineProjectId" IN (:...projectIds)', { projectIds })
      }))
  }
  async get(s: Scope, id: string) {
    const record = await this.records.findOneBy({ tenantId: s.tenantId, organizationId: s.organizationId, id })
    const organizationAccess = record?.organizationShared && record.assistantId === s.assistantId && (await this.repositories.access(s)).canRead
    if (record && !organizationAccess && record.userId !== s.userId && (!record.projectShared || !record.pipelineProjectId)) throw new ReviewError('review_not_found')
    if (!record) throw new ReviewError('review_not_found')
    if (!organizationAccess) await assertPipelineReviewAccess(this.records.manager, this.capabilities, s, record)
    return record
  }
  private async update(s: Scope, r: Review, patch: Partial<Review>) {
    const write = async (repository: Repository<Review>) => repository.update({ ...owner(s), id: r.id, revision: r.revision }, { ...patch, revision: r.revision + 1 })
    const result = r.pipelineOperationId ? await this.records.manager.transaction(async manager => {
      await assertPipelineReviewVersion(manager, s, r)
      return write(manager.getRepository(Review))
    }) : await write(this.records)
    if (result.affected !== 1) throw new ReviewError('revision_conflict')
    return this.get(s, r.id)
  }
  private expected(r: Review, revision: number) {
    if (r.revision !== revision) throw new ReviewError('revision_conflict')
  }
  async open(s: Scope, url: string, access: Review['access']) {
    const ref = parsePullUrl(url)
    const snapshot = await (await this.github(s, access)).snapshot(ref)
    return this.records.save(this.records.create({ ...owner(s), ref, access, snapshot, status: 'ready', findings: [], viewed: [], summary: '', instructions: '' }))
  }
  async request(s: Scope, url: string, instructions: string, config?: RunnableConfig) {
    const context = z.object({ context: z.object({ codeReview: z.object({}).passthrough().optional(),
      codeReviewWorkflow: z.object({}).passthrough().optional() }).optional() }).parse(config?.configurable ?? {})
    if (context.context?.codeReview || context.context?.codeReviewWorkflow) throw new ReviewError('nested_review_forbidden')
    if (!s.runtime?.executionId) throw new ReviewError('execution_required')
    const ref = parsePullUrl(url)
    const requestKey = createHash('sha256').update(JSON.stringify([owner(s), s.runtime.executionId, ref])).digest('hex')
    let r = await this.records.findOneBy({ ...owner(s), requestKey })
    if (!r) {
      const snapshot = await (await this.github(s, 'connected')).snapshot(ref)
      await this.records.createQueryBuilder().insert().values({ ...owner(s), requestKey, ref, snapshot, access: 'connected', status: 'ready',
        findings: [], viewed: [], summary: '', instructions }).orIgnore().execute()
      r = await this.records.findOneByOrFail({ ...owner(s), requestKey })
    }
    if (r.status === 'ready') {
      try { r = await this.start(s, r.id, r.revision, instructions) }
      catch (error) { if (!(error instanceof ReviewError) || error.code !== 'revision_conflict') throw error; r = await this.get(s, r.id) }
    }
    return { reviewId: r.id, status: r.status, headSha: r.snapshot.headSha, conversationId: r.conversationId,
      message: 'Review task started. Inspect its result in the Code review workbench.' }
  }
  async importLocal(s: Scope, raw: LocalGitImport) {
    const value = localGitImportSchema.parse(raw)
    const bundleDigest = digest({ ...value, requestId: null })
    const existing = await this.records.findOneBy({ id: value.requestId })
    if (existing) {
      const owned = await this.get(s, existing.id)
      if (owned.ref.provider !== 'local_git' || owned.ref.bundleDigest !== bundleDigest) throw new ReviewError('local_import_conflict')
      return owned
    }
    await this.records.createQueryBuilder().insert().values({ ...owner(s), id: value.requestId,
      ref: { provider: 'local_git', repository: value.repository, bundleDigest }, localSources: value.sources,
      snapshot: { title: value.title, body: null, url: '', state: 'snapshot', author: '', baseSha: value.baseSha, headSha: value.headSha,
        files: value.files, comments: [], checks: [], warnings: ['local_git_snapshot_no_remote_checks'], fetchedAt: new Date().toISOString() },
      access: 'public', status: 'ready', findings: [], viewed: [], summary: '', instructions: value.instructions }).orIgnore().execute()
    const saved = await this.get(s, value.requestId)
    if (saved.ref.provider !== 'local_git' || saved.ref.bundleDigest !== bundleDigest) throw new ReviewError('local_import_conflict')
    return saved
  }
  async refresh(s: Scope, id: string, revision: number) {
    const r = await this.get(s, id); this.expected(r, revision)
    if (r.ref.provider === 'local_git') throw new ReviewError('local_snapshot_immutable')
    if (r.pipelineProjectId) throw new ReviewError('pipeline_managed_review')
    if (r.automationRunId) throw new ReviewError('automation_managed_review')
    if (active.has(r.status)) throw new ReviewError('review_busy')
    const snapshot = await (await this.recordGithub(s, r)).snapshot(r.ref)
    const changed = snapshot.headSha !== r.snapshot.headSha || snapshot.baseSha !== r.snapshot.baseSha
    return this.update(s, r, { snapshot, ...(changed ? { status: 'ready', findings: [], summary: '', viewed: [], executionId: null, submissionUrl: null, errorCode: null } : {}) })
  }
  async mark(s: Scope, id: string, revision: number, patch: { pinned?: boolean; viewed?: string[] }) {
    const r = await this.get(s, id); this.expected(r, revision)
    if (r.status === 'submitting' || r.status === 'submission_unknown') throw new ReviewError('review_busy')
    if (patch.viewed?.some(path => !r.snapshot.files.some(f => f.filename === path))) throw new ReviewError('invalid_file')
    return this.update(s, r, patch)
  }
  async start(s: Scope, id: string, revision: number, instructions: string, automaticRunId?: string) {
    let r = await this.get(s, id); this.expected(r, revision)
    if (r.pipelineProjectId) throw new ReviewError('pipeline_managed_review')
    if (r.automationRunId && r.automationRunId !== automaticRunId) throw new ReviewError('automation_managed_review')
    if (active.has(r.status)) throw new ReviewError('review_busy')
    const api = this.tasks(s)
    if (r.ref.provider === 'github' && await (await this.recordGithub(s, r)).head(r.ref) !== r.snapshot.headSha) throw new ReviewError('stale_revision')
    r = await this.update(s, r, { status: 'running', executionId: randomUUID(), conversationId: randomUUID(), taskId: null, threadId: null, instructions, summary: '', findings: [], errorCode: 'dispatch_pending_confirmation' })
    return this.dispatch(s, r)
  }
  private async dispatch(s: Scope, r: Review) {
    if (r.automationPolicyId && r.automationRunId) {
      const run = await this.records.manager.findOneByOrFail(ReviewRun, { id: r.automationRunId, tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId })
      await this.repositories.assertAssistantExecution(s, r.automationPolicyId, run.policyRevision, run.trigger === 'trial')
    }
    try {
      const receipt = await this.tasks(s).startTask({ xpertId: s.assistantId, executionId: r.executionId!, conversationId: r.conversationId!, clientMessageId: r.executionId!,
        prompt: `请审查 ${reviewLabel(r.ref)}（${r.snapshot.headSha.slice(0, 12)}），使用 code_review_context 读取任务依据，检查变更引入的实际缺陷并使用 code_review_complete 保存结果。${r.instructions ? '\n关注点：' + r.instructions : ''}`,
        context: { codeReview: { reviewId: r.id, headSha: r.snapshot.headSha } } })
      await this.update(s, await this.get(s, r.id), { taskId: receipt.taskId ?? null, threadId: receipt.threadId ?? null,
        executionId: receipt.executionId ?? r.executionId, conversationId: receipt.conversationId ?? r.conversationId, errorCode: null })
    } catch {
      // A transport failure can happen after the host accepts the task. Preserve its ids for reconciliation.
      const current = await this.get(s, r.id)
      if (current.status === 'running') await this.update(s, current, { errorCode: 'dispatch_pending_confirmation' })
    }
    return this.get(s, r.id)
  }
  async reconcile(s: Scope, id: string) {
    let r = await this.get(s, id)
    if (r.pipelineProjectId) return r
    if (r.status !== 'running' || !r.executionId) return r
    const status = await this.tasks(s).getTaskStatus?.({ xpertId: s.assistantId, executionId: r.executionId, conversationId: r.conversationId ?? undefined, taskId: r.taskId ?? undefined, threadId: r.threadId ?? undefined })
    // Read again: the completion tool may have changed the state during the host lookup.
    r = await this.get(s, id)
    if (r.status === 'running' && r.errorCode === 'dispatch_pending_confirmation' && (!status || status.status === 'unknown')) return this.dispatch(s, r)
    if (r.status === 'running' && status && ['failed', 'interrupted', 'succeeded'].includes(status.status)) {
      try { r = await this.update(s, r, { status: 'failed', errorCode: status.status === 'succeeded' ? 'review_result_missing' : 'assistant_task_failed' }) }
      catch (e) { if (!(e instanceof ReviewError) || e.code !== 'revision_conflict') throw e; r = await this.get(s, id) }
    }
    return r
  }
  async cancel(s: Scope, id: string, revision: number) {
    const r = await this.get(s, id); this.expected(r, revision)
    if (r.pipelineProjectId) throw new ReviewError('pipeline_managed_review')
    if (r.status !== 'running') throw new ReviewError('review_not_running')
    const api = this.tasks(s)
    if (!api.cancelTask) throw new ReviewError('cancellation_unavailable')
    await api.cancelTask({ xpertId: s.assistantId, executionId: r.executionId ?? undefined, conversationId: r.conversationId ?? undefined, taskId: r.taskId ?? undefined, threadId: r.threadId ?? undefined })
    return this.update(s, r, { status: 'cancelled', errorCode: null })
  }
  async taskRecord(s: Scope, config: unknown) {
    const run = runSchema.parse(config).configurable
    const r = await this.get(s, run.context.codeReview.reviewId)
    if (r.status !== 'running' || r.executionId !== (run.rootExecutionId ?? run.executionId) || r.snapshot.headSha !== run.context.codeReview.headSha)
      throw new ReviewError('task_binding_mismatch')
    return r
  }
  async evidence(s: Scope, config: unknown) {
    const r = await this.readRecord(s, config)
    const context = r.pipelineContext ? reviewAgentContextSchema.parse(r.pipelineContext) : null
    return { role: context?.pass ?? null, candidateCount: context?.candidates.reduce((count, item) => count + item.findings.length, 0) ?? 0,
      id: r.id, headSha: r.snapshot.headSha, baseSha: r.snapshot.baseSha, title: r.snapshot.title, body: r.snapshot.body,
      warnings: r.snapshot.warnings, instructions: r.instructions, checks: r.snapshot.checks, summary: r.summary, findings: r.findings,
      files: r.snapshot.files.map(({ patch, ...f }) => ({ ...f, hasDiff: !!patch })), comments: r.snapshot.comments }
  }
  async candidates(s: Scope, config: unknown, offset: number, limit: number) {
    const r = await this.readRecord(s, config)
    if (!r.pipelineContext) throw new ReviewError('review_candidates_unavailable')
    const context = reviewAgentContextSchema.parse(r.pipelineContext)
    if (context.pass !== 'verify') throw new ReviewError('review_candidates_unavailable')
    const candidates = context.candidates.flatMap(item => item.findings.map(finding => ({ pass: item.pass, reviewId: item.reviewId, finding })))
    return { headSha: r.snapshot.headSha, offset, total: candidates.length,
      reports: context.candidates.map(({ pass, summary }) => ({ pass, summary })),
      candidates: candidates.slice(offset, offset + limit), next: offset + limit < candidates.length ? offset + limit : null }
  }
  async file(s: Scope, config: unknown, path: string, offset: number, limit: number) {
    const r = await this.readRecord(s, config)
    const file = r.snapshot.files.find(f => f.filename === path)
    if (!file) throw new ReviewError('invalid_file')
    const lines = (file.patch ?? '').split('\n')
    return { path, headSha: r.snapshot.headSha, offset, total: lines.length, diff: lines.slice(offset, offset + limit).join('\n'), hasDiff: !!file.patch }
  }
  async complete(s: Scope, config: unknown, input: z.infer<typeof resultSchema>) {
    const result = resultSchema.parse(input), r = await this.taskRecord(s, config)
    validateFindings(r.snapshot, result.findings)
    await this.update(s, r, { ...result, status: 'reviewed', errorCode: null })
    return { saved: true, reviewId: r.id, headSha: r.snapshot.headSha, findings: result.findings.length }
  }
  async source(s: Scope, config: unknown, path: string, side: 'base' | 'head', offset: number, limit: number) {
    const r = await this.readRecord(s, config), sha = side === 'base' ? r.snapshot.baseSha : r.snapshot.headSha
    let content: string
    if (r.ref.provider === 'local_git') {
      const rootId = r.pipelineRootReviewId || r.id
      const root = await this.records.createQueryBuilder('review').addSelect('review.localSources')
        .where({ id: rootId, tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId }).getOneOrFail()
      const source = localGitSourcesSchema.parse(root.localSources).find(file => file.path === path)
      if (!source || source[side] === null) throw new ReviewError('local_source_unavailable')
      content = source[side]!
    } else content = await (await this.recordGithub(s, r)).source(r.ref, sha, path)
    const lines = content.split('\n')
    return { path, sha, offset, total: lines.length, content: lines.slice(offset, offset + limit).map((line, i) => `${offset + i + 1}: ${line}`).join('\n') }
  }
  async readRecord(s: Scope, config: unknown) {
    const selected = selectionSchema.safeParse(config)
    if (!selected.success) throw new ReviewError('no_active_context')
    const { reviewId, headSha } = selected.data.configurable.context.codeReview
    const r = await this.get(s, reviewId)
    if (r.snapshot.headSha !== headSha) throw new ReviewError('stale_revision')
    return r
  }
  async submit(s: Scope, input: z.infer<typeof submitSchema>) {
    const v = submitSchema.parse(input), r = await this.get(s, v.id); this.expected(r, v.revision)
    if (r.ref.provider !== 'github') throw new ReviewError('local_review_has_no_remote_delivery')
    if (r.pipelineProjectId) throw new ReviewError('pipeline_managed_review')
    if (r.status !== 'reviewed' || r.snapshot.headSha !== v.headSha) throw new ReviewError('review_not_submittable')
    if (r.automationRunId) throw new ReviewError('automation_managed_review')
    const selected = [...new Set(v.findings)].map(i => { const f = r.findings[i]; if (!f) throw new ReviewError('invalid_finding'); return f })
    validateFindings(r.snapshot, selected)
    const github = await this.github(s, 'connected')
    if (await github.head(r.ref) !== v.headSha) throw new ReviewError('stale_revision')
    const sending = await this.update(s, r, { status: 'submitting', errorCode: null })
    try {
      const receipt = await github.submit(r.ref, v.headSha, v.body, v.event, selected)
      return await this.update(s, sending, { status: 'submitted', submissionUrl: receipt.html_url })
    } catch (error) {
      // Do not retry a possibly accepted external write. Users must reconcile on GitHub first.
      const definite = error instanceof ReviewError && ['stale_revision', 'github_auth_required', 'github_access_or_rate_limit', 'pull_request_not_found'].includes(error.code)
      await this.update(s, sending, { status: definite ? 'reviewed' : 'submission_unknown', errorCode: definite ? error.code : 'submission_unknown_check_github' })
      throw error
    }
  }
  async publishAutomatic(p: ReviewRepository, run: ReviewRun, confirmed = false) {
    if (!p.settings.enabled || p.revision !== run.policyRevision || (!confirmed && run.settings.delivery !== 'automatic') || !p.confirmedAt || !run.reviewId)
      throw new ReviewError('policy_changed')
    const r = await this.get(p, run.reviewId)
    if (r.automationRunId !== run.id || r.automationPolicyId !== p.id || r.snapshot.headSha !== run.headSha || r.status !== 'reviewed')
      throw new ReviewError('review_not_submittable')
    if (r.ref.provider !== 'github') throw new ReviewError('local_review_has_no_remote_delivery')
    const github = await this.recordGithub(p, r), current = await github.state(r.ref)
    if (current.head.sha !== run.headSha || current.state !== 'open' || current.draft) throw new ReviewError('stale_revision')
    const findings = r.findings.filter(f => f.priority === 'P0' || f.priority === 'P1')
    validateFindings(r.snapshot, findings)
    const sending = await this.update(p, r, { status: 'submitting', errorCode: null })
    try {
      const body = `Xpert 自动审查 · ${run.headSha.slice(0, 12)} · 策略 v${run.policyRevision}\n\n${r.summary}\n\n仅发布 P0/P1 行内问题；完整结果保存在 Xpert。\n<!-- xpert-code-review:${run.id} -->`
      const receipt = await github.submit(r.ref, run.headSha, body, 'COMMENT', findings)
      return this.update(p, sending, { status: 'submitted', submissionUrl: receipt.html_url })
    } catch (error) {
      await this.update(p, sending, { status: 'submission_unknown', errorCode: 'submission_unknown_check_github' })
      throw error
    }
  }

}
