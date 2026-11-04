import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import type { EntityManager, Repository } from 'typeorm'
import { AssistantTaskRuntimeCapability, DefaultRuntimeCapabilityRegistry, type AgentMiddlewareRuntimeScope, type PluginContext } from '@xpert-ai/plugin-sdk'
import { WorkflowDiagnostics } from '../src/workflow-diagnostics.js'
import { WorkflowDiagnosis } from '../src/workflow-entity.js'
import { ReviewRepository } from '../src/automation-entities.js'
import type { Repositories } from '../src/repositories.js'
import type { ReviewEvents } from '../src/event-subscription.js'
import { ReviewError, type Scope } from '../src/domain.js'
import { defaultPolicy } from '../src/automation-contract.js'
import { workflowRef } from '../src/workflow-contract.js'

function fixture() {
  const scope: Scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), assistantId: randomUUID(), workspaceId: randomUUID() }
  const policy = Object.assign(new ReviewRepository(), scope, { id: randomUUID(), owner: 'fixture', repository: 'repo', revision: 1, executionRevision: 1,
    settings: { ...defaultPolicy, enabled: true, onWorkflowFailure: true } })
  const run = { id: 25, run_attempt: 1, head_sha: 'a'.repeat(40), check_suite_id: 30, head_branch: 'main', name: 'CI', conclusion: 'failure', status: 'completed', html_url: 'https://github.com/fixture/repo/actions/runs/25' }
  const job = { id: 40, run_id: 25, head_sha: run.head_sha, check_run_url: 'https://api.github.com/repos/fixture/repo/check-runs/40', name: 'acceptance', conclusion: 'failure', html_url: run.html_url + '/job/40', steps: [] }
  const row = Object.assign(new WorkflowDiagnosis(), scope, { id: randomUUID(), repositoryPolicyId: policy.id, policyRevision: 1, settings: policy.settings,
    ref: workflowRef(run), status: 'queued' as const, createdAt: new Date(), updatedAt: new Date() })
  let denied = false, dispatches = 0, logReads = 0, inspections = 0, quotaReads = 0
  const state = { annotation: 'The job has exceeded the maximum execution time of 1m0s', unavailable: false, used: 0, totalJobs: 1 }
  const records = {
    find: async () => [structuredClone(row)], findOneByOrFail: async () => structuredClone(row),
    findOneBy: async (where: Partial<WorkflowDiagnosis>) => Object.entries(where).every(([key,value]) => Reflect.get(row,key) === value) ? structuredClone(row) : null,
    update: async (_where: unknown, patch: Partial<WorkflowDiagnosis>) => { Object.assign(row,patch); return { affected: 1 } },
    manager: { transaction: async (work: (manager: EntityManager) => unknown) => work({
      findOneOrFail: async () => policy, count: async () => { quotaReads++; return state.used },
      update: async (_entity: unknown, _where: unknown, patch: Partial<WorkflowDiagnosis>) => { Object.assign(row,patch); return { affected: 1 } }
    } as unknown as EntityManager) }
  } as unknown as Repository<WorkflowDiagnosis>
  const repositories = {
    get: async () => policy,
    execution: async () => { inspections++; if (denied) throw new ReviewError('execution_authorization_revoked'); return policy },
    github: async () => ({ request: async (path: string) => {
      if (path.includes('/check-runs/')) {
        if (state.unavailable) throw new ReviewError('github_access_or_rate_limit')
        return path.includes('/annotations?') ? [{ path: '.github', start_line: 1, end_line: 1, annotation_level: 'failure', message: state.annotation }]
          : { id: 40, head_sha: run.head_sha, check_suite: { id: 30 }, app: { id: 15368 }, status: 'completed', conclusion: 'cancelled', output: { annotations_count: 1 } }
      }
      return path.includes('/jobs?') ? { total_count: state.totalJobs, jobs: [job] } : run
    },
      jobLog: async () => { logReads++; return { content: 'expected failure', truncated: false } } }),
    app: { inspect: async () => { throw new Error('Background execution must not depend on configuring-user OAuth') } }
  } as unknown as Repositories
  const events = { assertListening: async () => {}, activity: async () => {}, instructions: async () => '' } as unknown as ReviewEvents
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  capabilities.register(AssistantTaskRuntimeCapability, {
    startTask: async input => { dispatches++; assert.equal(input.executionId,row.executionId); return { executionId: input.executionId!, conversationId: input.conversationId!, taskId: randomUUID() } },
    getTaskStatus: async () => ({ status: 'unknown' })
  })
  const context = { resolve: () => ({ createScopedApi: (_s: AgentMiddlewareRuntimeScope) => ({ capabilities }) }) } as unknown as PluginContext
  return { service: new WorkflowDiagnostics(records,repositories,events,context), policy, row, scope, run, job, state,
    deny: () => { denied=true }, metrics: () => ({ dispatches, logReads, inspections, quotaReads }),
    execution: () => ({ ...scope, runtime: { executionId: row.executionId!, conversationId: row.conversationId! } }),
    config: () => ({ configurable: { executionId: row.executionId, context: { codeReviewWorkflow: { diagnosisId: row.id } } } }) }
}

for (const executionMode of ['assistant', 'pipeline'] as const) test(`${executionMode} PR mode: workflow dispatch and finalization retain Assistant authority`, async () => {
  const f = fixture()
  f.policy.settings.executionMode = executionMode
  if (executionMode === 'pipeline') {
    f.policy.settings.pipeline = { projectId: randomUUID(), bindingId: randomUUID() }
    f.policy.settings.visibility = 'project'
  }
  await f.service.process(f.policy)
  assert.equal(f.row.status,'running')
  assert.equal(f.metrics().dispatches,1)
  assert.equal(f.metrics().logReads,0)
  const evidence = await f.service.evidence(f.execution(),f.config())
  assert.equal(evidence.evidence?.jobs[0].id,40)
  assert.equal((await f.service.log(f.execution(),f.config(),40,0,10)).lines,'expected failure')
  await f.service.complete(f.execution(),f.config(),{ summary: 'Expected fixture failure', findings: [] })
  assert.equal(f.row.status,'completed')
  assert(f.metrics().inspections >= 3)
})

function cancelledFixture() {
  const f = fixture()
  f.run.conclusion = 'cancelled'; f.job.conclusion = 'cancelled'; f.row.ref.conclusion = 'cancelled'
  f.policy.settings.onWorkflowTimeout = true
  f.row.createdAt = new Date(Date.now() - 120000)
  return f
}

test('cancelled job timeout claims quota only after proof and retains proof for the Assistant finalizer', async () => {
  const f = cancelledFixture()
  await f.service.process(f.policy)
  assert.equal(f.row.status, 'running'); assert.equal(f.metrics().dispatches, 1)
  assert.equal(f.row.evidence?.timeouts?.[0].source, 'check_run_annotation')
  assert.equal(f.row.ref.conclusion, 'cancelled')
  await f.service.complete(f.execution(), f.config(), { summary: 'Confirmed job timeout', findings: [{ jobId: 40, cause: 'Job limit exceeded', evidence: f.state.annotation, suggestion: 'Check the stalled step' }] })
  assert.equal(f.row.status, 'completed')
})

test('ordinary manual/concurrency/fail-fast cancellations skip without starting a model or reserving quota', async () => {
  for (const message of ['The operation was canceled.', 'Canceling since a higher priority waiting request exists', 'Cancelled by fail-fast']) {
    const f = cancelledFixture(); f.state.annotation = message
    await f.service.process(f.policy)
    assert.equal(f.row.status, 'skipped'); assert.equal(f.row.reason, 'workflow_cancelled')
    assert.equal(f.metrics().dispatches, 0); assert.equal(f.metrics().quotaReads, 0)
    assert.equal(f.row.startedAt, undefined)
  }
})

test('unavailable and settling evidence retries without consuming quota; recovered timeout dispatches once', async () => {
  const f = cancelledFixture(); f.state.unavailable = true
  await f.service.process(f.policy)
  assert.equal(f.row.status, 'queued'); assert.equal(f.metrics().dispatches, 0); assert.equal(f.metrics().quotaReads, 0)
  f.state.unavailable = false; f.state.annotation = 'The operation was canceled.'; f.row.createdAt = new Date()
  await f.service.process(f.policy)
  assert.equal(f.row.reason, 'workflow_timeout_evidence_pending'); assert.equal(f.metrics().quotaReads, 0)
  f.state.annotation = 'The job has exceeded the maximum execution time of 1m0s'
  await f.service.process(f.policy); await f.service.process(f.policy)
  assert.equal(f.metrics().dispatches, 1); assert.equal(f.row.status, 'running')
})

test('incomplete evidence cannot skip cancellations and quota/attempt guards still apply', async () => {
  const f = cancelledFixture(); f.state.totalJobs = 101; f.state.annotation = 'The operation was canceled.'
  await f.service.process(f.policy)
  assert.equal(f.row.status, 'queued'); assert.equal(f.row.reason, 'workflow_timeout_evidence_unavailable'); assert.equal(f.metrics().quotaReads, 0)
  const limited = cancelledFixture(); limited.state.used = limited.policy.settings.dailyLimit
  await limited.service.process(limited.policy)
  assert.equal(limited.row.status, 'skipped'); assert.equal(limited.row.reason, 'daily_limit_reached'); assert.equal(limited.metrics().dispatches, 0)
  const stale = cancelledFixture(); stale.run.run_attempt++
  await stale.service.process(stale.policy)
  assert.equal(stale.row.status, 'superseded'); assert.equal(stale.metrics().dispatches, 0); assert.equal(stale.metrics().quotaReads, 0)
})

test('revoked organization authorization denies evidence, logs and finalization; a different execution cannot use the task', async () => {
  const f = fixture()
  await f.service.process(f.policy)
  await assert.rejects(f.service.evidence(f.execution(),{ configurable: { ...f.config().configurable, executionId: randomUUID() } }),/task_binding_mismatch/)
  f.deny()
  await assert.rejects(f.service.evidence(f.execution(),f.config()),/execution_authorization_revoked/)
  await assert.rejects(f.service.log(f.execution(),f.config(),40,0,10),/execution_authorization_revoked/)
  await assert.rejects(f.service.complete(f.execution(),f.config(),{ summary: 'Must not save', findings: [] }),/execution_authorization_revoked/)
  assert.equal(f.metrics().logReads,0)
  assert.equal(f.row.status,'running')
  assert.equal(f.row.result,undefined)
})
