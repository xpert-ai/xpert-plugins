import 'reflect-metadata'
import { type TestContext } from 'node:test'
import { randomUUID } from 'node:crypto'
import { DataSource, Table } from 'typeorm'
import { AssistantMiddlewareAccessRuntimeCapability, DefaultRuntimeCapabilityRegistry, SYSTEM_GLOBAL_SCOPE, type ManagedQueueService } from '@xpert-ai/plugin-sdk'
import type { AutomationStep } from '../src/automation-jobs.js'
import { reviewPhase } from '../src/automation-jobs.js'
import { Automation } from '../src/automation.js'
import { ReviewRepository, ReviewRun, ReviewDelivery, ReviewPolicyAudit } from '../src/automation-entities.js'
import { WorkflowDiagnosis } from '../src/workflow-entity.js'
import { defaultPolicy } from '../src/automation-contract.js'
import type { Repositories } from '../src/repositories.js'
import type { Reviews } from '../src/backend.js'
import type { ReviewPipelineAutomation } from '../src/pipeline/automation.js'
import type { ReviewEvents } from '../src/event-subscription.js'
import { WorkflowDiagnostics } from '../src/workflow-diagnostics.js'
import { ReviewWebhookInbox } from '../src/webhook-inbox.js'
import type { GitHubApplication } from '../src/github-integration.js'
import type { PluginContext } from '@xpert-ai/plugin-sdk'
import { PLUGIN } from '../src/domain.js'
import { QUEUE } from '../src/automation-domain.js'
import { LeaseRedis } from './automation-lease.fixture.js'

export const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname)) throw new Error('Dedicated test database required')

export async function fixture(t: TestContext) {
  const schema = `review_pool_${randomUUID().replaceAll('-', '')}`
  const entities = [ReviewRepository, ReviewRun, ReviewDelivery, ReviewPolicyAudit, WorkflowDiagnosis]
  const db = new DataSource({ type: 'postgres', url, schema, entities, extra: { max: 2, connectionTimeoutMillis: 1000,
    application_name: schema, options: `-c search_path=${schema},public -c statement_timeout=3000 -c idle_in_transaction_session_timeout=5000` } })
  await db.initialize(); await db.query(`CREATE SCHEMA "${schema}"`)
  t.after(async () => { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() })
  const runner = db.createQueryRunner()
  try { for (const entity of entities) await runner.createTable(Table.create(db.getMetadata(entity), db.driver)) }
  finally { await runner.release() }
  const records = db.getRepository(ReviewRepository), runs = db.getRepository(ReviewRun)
  const p = await records.save({ tenantId: randomUUID(), organizationId: randomUUID(), workspaceId: randomUUID(),
    assistantId: randomUUID(), userId: randomUUID(), executionUserId: randomUUID(), ownership: 'assistant',
    installationId: '1', repositoryId: '2', owner: 'fixture', repository: 'repo', revision: 1, executionRevision: 1,
    settings: { ...defaultPolicy, enabled: true, executionMode: 'pipeline', dailyLimit: 1, pipeline: { projectId: randomUUID(), bindingId: randomUUID() } } })
  const context = { pluginName: PLUGIN, queueName: QUEUE, jobName: 'supervise', scopeKey: SYSTEM_GLOBAL_SCOPE,
    tenantId: p.tenantId, organizationId: p.organizationId, userId: p.executionUserId }
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  capabilities.register(AssistantMiddlewareAccessRuntimeCapability, { assertAccess: async () => {}, runAsAssistant: async (_input, work) => work() })
  const redis = new LeaseRedis()
  const state = { reads: 0, advances: 0, prepares: 0, scheduled: 0, queueUnavailable: false, beforeGitHub: async () => {} }
  const application: GitHubApplication = { appId: '3', slug: 'fixture', privateKey: 'unused', webhookSecret: 'fixture-webhook-secret-at-least-32-characters' }
  const repositories = { records, app: { config: async () => application }, execution: async (p: ReviewRepository) => ({ ...p, userId: p.executionUserId!, revision: p.executionRevision }),
    github: async () => ({ state: async () => {
      state.reads++; await state.beforeGitHub(); await db.query('SELECT 1')
      return { state: 'open', draft: false, head: { sha: 'a'.repeat(40) }, base: { ref: 'main' }, user: { type: 'User' } }
    } }) } as unknown as Repositories
  const pipelines = { validate: async () => { await db.query('SELECT 1') }, advance: async () => { state.advances++; await db.query('SELECT 1') } } as unknown as ReviewPipelineAutomation
  const events = { assertListening: async () => {}, activity: async () => {} } as ReviewEvents
  const workflows = new WorkflowDiagnostics(db.getRepository(WorkflowDiagnosis), repositories, events, {} as PluginContext)
  const inbox = () => new ReviewWebhookInbox(db.getRepository(ReviewDelivery), repositories, events, workflows)
  const reviews = { prepareAutomatic: async () => { state.prepares++; return { id: randomUUID() } } } as unknown as Reviews
  const jobs: Array<{ jobId: string; jobName: string; payload: AutomationStep | { repositoryId: string; after?: string }; delayMs: number }> = []
  const scheduled = new Set<string>()
  const queue = { getRedis: async () => redis, enqueue: async (input: typeof jobs[number]) => {
    if (state.queueUnavailable) throw new Error('Queue unavailable')
    if (!scheduled.has(input.jobId)) jobs.push(input)
    scheduled.add(input.jobId); state.scheduled = scheduled.size; return { jobId: input.jobId }
  } } as unknown as ManagedQueueService
  const automation = () => new Automation(runs, inbox(), repositories, reviews, capabilities, pipelines, events, workflows, queue)
  const addRun = (started = true, number = 1) => runs.save({ tenantId: p.tenantId, organizationId: p.organizationId, assistantId: p.assistantId,
    repositoryPolicyId: p.id, operationKey: randomUUID(), number, headSha: 'a'.repeat(40), title: 'fixture', trigger: 'opened',
    status: 'running', policyRevision: 1, settings: p.settings, notBefore: new Date(),
    ...(started ? { startedAt: new Date(), reviewId: randomUUID(), pipelineInstanceId: randomUUID(), pipelineRoundId: randomUUID() } : {}) })
  const stepFor = async (id: string): Promise<Extract<AutomationStep, { kind: 'review' }>> => {
    const run = await runs.findOneByOrFail({ id })
    return { repositoryId: p.id, id, kind: 'review', phase: reviewPhase(run), version: run.updatedAt.toISOString() }
  }
  const step = async (id: string) => automation().processStep(await stepFor(id), { ...context, jobName: 'step' })
  // Test-only draining. Production processors consume exactly one delivery ID.
  const drainInbox = async (policy: ReviewRepository, check = async () => {}) => {
    for (const delivery of await db.getRepository(ReviewDelivery).findBy({ repositoryPolicyId: policy.id, status: 'received' }))
      await inbox().process(policy, delivery.id, check)
  }
  return { step, stepFor, jobs, workflows, drainInbox, db, schema, p, runs, records, context, automation, addRun, state, redis, inbox, application, repositories }
}
