// Real persistence and domain services; fixture GitHub/model transports never publish externally.
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID, createHmac, generateKeyPairSync } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { DataSource } from 'typeorm'
import { DefaultRuntimeCapabilityRegistry, AssistantMiddlewareAccessRuntimeCapability, AssistantTaskRuntimeCapability, ConnectorRuntimeCapability,
  MANAGED_QUEUE_SERVICE_TOKEN, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN, SYSTEM_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
import { Review } from '../dist/entity.js'
import { ReviewRepository, ReviewRun, ReviewDelivery } from '../dist/automation-entities.js'
import { ReviewEventSubscription, ReviewEvents } from '../dist/event-subscription.js'
import { WorkflowDiagnosis } from '../dist/workflow-entity.js'
import { WorkflowDiagnostics } from '../dist/workflow-diagnostics.js'
import { CodeReviewGitHubTrigger } from '../dist/github-trigger.js'
import { GitHubApp } from '../dist/github-app.js'
import { Repositories } from '../dist/repositories.js'
import { Reviews } from '../dist/backend.js'
import { Automation } from '../dist/automation.js'
import { ReviewPipelineCatalog } from '../dist/pipeline/catalog.js'
import { defaultPolicy, QUEUE } from '../dist/automation-domain.js'
import { PLUGIN } from '../dist/domain.js'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (!url || !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname)) throw new Error('Dedicated test database required')
const schema = `events_${randomUUID().replaceAll('-', '')}`
const db = new DataSource({ type: 'postgres', url, schema, extra: { options: `-c search_path=${schema},public` },
  entities: [Review, ReviewRepository, ReviewRun, ReviewDelivery, ReviewEventSubscription, WorkflowDiagnosis], synchronize: false })
const scope = { tenantId: randomUUID(), organizationId: randomUUID(), assistantId: randomUUID(), userId: randomUUID(), workspaceId: randomUUID() }
const secret = 'signed-fixture-only-never-deployed-secret', sha = 'a'.repeat(40)
const launches = new Map(), queue = [], cancelled = [], workflowRuns = new Map()
let permitted = true, loseReceipt = false
const capability = new DefaultRuntimeCapabilityRegistry()
capability.register(AssistantMiddlewareAccessRuntimeCapability, { async assertAccess(input) {
  assert.equal(input.actor.tenantId, scope.tenantId); assert.equal(input.assistantId, scope.assistantId)
  assert.equal(input.provider, 'code_review.tools'); assert.equal(input.requiredFeature, 'code_review.core')
  if (!permitted || input.actor.userId !== scope.userId) throw new Error('access_revoked')
} })
const tasks = {
  async startTask(input) {
    if (!launches.has(input.executionId)) launches.set(input.executionId, input)
    if (loseReceipt) { loseReceipt = false; throw new Error('receipt lost after acceptance') }
    return { executionId: input.executionId, conversationId: input.conversationId, taskId: randomUUID(), threadId: randomUUID() }
  },
  async getTaskStatus(input) { return { status: launches.has(input.executionId) ? 'running' : 'unknown' } },
  async cancelTask(input) { cancelled.push(input.executionId); return { cancelled: true } }
}
const runtime = new DefaultRuntimeCapabilityRegistry()
runtime.register(AssistantTaskRuntimeCapability, tasks)
runtime.register(ConnectorRuntimeCapability, { async getConnectorCredential() { return { credentials: { accessToken: 'fixture-user' } } } })
const context = { scopeKey: SYSTEM_GLOBAL_SCOPE, config: { githubApp: { appId: '42', slug: 'fixture', webhookSecret: secret,
  publicBaseUrl: 'https://fixture.invalid', privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() } },
  resolve(token) {
    if (token === MANAGED_QUEUE_SERVICE_TOKEN) return { async enqueue(job) { queue.push(job); return { jobId: job.jobId } } }
    if (token === XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN) return { createScopedApi(s) {
      assert.equal(s.tenantId, scope.tenantId); assert.equal(s.userId, scope.userId)
      return { capabilities: runtime }
    } }
    throw new Error('unexpected runtime token')
  }
}
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const uri = new URL(input), path = uri.pathname
  if (path.endsWith('/installation')) return Response.json({ id: 888, permissions: { contents: 'read', pull_requests: 'write', actions: 'read' } })
  if (path === '/repos/fixture/repo') return Response.json({ id: 777, name: 'repo', owner: { login: 'fixture' }, permissions: { push: true } })
  if (path === '/app/installations/888/access_tokens') return Response.json({ token: 'fixture-installation' })
  if (path.endsWith('/logs')) return new Response('step failed: expected true, received false')
  if (path.includes('/attempts/')) {
    const runId = Number(path.match(/runs\/(\d+)/)[1])
    return Response.json({ total_count: 1, jobs: [{ id: runId + 1000, run_id: runId, name: 'test', conclusion: 'failure', html_url: 'https://github.com/fixture/repo', steps: [{ name: 'tests', number: 1, status: 'completed', conclusion: 'failure' }] }] })
  }
  if (path.includes('/actions/runs/')) return Response.json(workflowRuns.get(Number(path.split('/').at(-1))))
  if (path.endsWith('/files')) return Response.json([{ filename: 'app.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' }])
  if (path.endsWith('/comments')) return Response.json([])
  if (path.endsWith('/check-runs')) return Response.json({ total_count: 0, check_runs: [] })
  if (/\/pulls\/\d+$/.test(path)) return Response.json(pr)
  throw new Error(`Unexpected fixture route ${path}`)
}
const pr = { number: 5, title: 'Fixture PR', body: 'untrusted content', html_url: 'https://github.com/fixture/repo/pull/5',
  state: 'open', draft: false, changed_files: 1, user: { login: 'fixture', type: 'User' }, head: { sha }, base: { sha: 'b'.repeat(40), ref: 'main' } }
let passed = 0
const ok = label => { passed++; console.log(`PASS ${label}`) }
try {
  await db.initialize(); await db.query(`CREATE SCHEMA "${schema}"`); await db.synchronize()
  const events = new ReviewEvents(db.getRepository(ReviewEventSubscription), capability)
  const repositories = new Repositories(db.getRepository(ReviewRepository), new GitHubApp(context), new ReviewPipelineCatalog(capability), capability, events)
  const reviews = new Reviews(db.getRepository(Review), context, repositories, capability)
  let workflows = new WorkflowDiagnostics(db.getRepository(WorkflowDiagnosis), repositories, events, context)
  const automation = new Automation(db.getRepository(ReviewRun), db.getRepository(ReviewDelivery), repositories, reviews, context,
    { async advance() { throw new Error('Assistant mode must not dispatch a pipeline') } }, events, workflows)
  const trigger = new CodeReviewGitHubTrigger(events, repositories)
  const params = { xpertId: scope.assistantId, scope, config: { enabled: true, instructions: 'Review CI failures' }, additionalInstructions: 'Explain findings in Chinese' }
  assert.equal((await trigger.validate(params)).length, 0)
  await trigger.publish(params)
  assert.equal(await events.instructions(scope), 'Review CI failures\n\nExplain findings in Chinese')
  let p = await repositories.add(scope, 'fixture', 'repo')
  p = await repositories.save(scope, p.id, p.revision, { ...defaultPolicy, enabled: true, onWorkflowFailure: true })
  assert.equal((await trigger.assistantStatus(params)).connection, 'connected')
  await assert.rejects(trigger.publish({ ...params, scope: { ...scope, userId: randomUUID() } }), /owner_mismatch/)
  ok('capability-bound trigger publication preserves the configuring actor')
  const jobContext = { ...scope, pluginName: PLUGIN, queueName: QUEUE, scopeKey: SYSTEM_GLOBAL_SCOPE }
  const send = async (event, body, delivery = randomUUID()) => {
    const raw = Buffer.from(JSON.stringify(body)), signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
    await automation.receive(raw, signature, delivery, event); return delivery
  }
  const pullPayload = { action: 'opened', installation: { id: 888 }, repository: { id: 777, name: 'repo', owner: { login: 'fixture' } }, pull_request: pr }
  const delivery = await send('pull_request', pullPayload)
  await send('pull_request', pullPayload, delivery)
  assert.equal(await automation.runs.count(), 1)
  await automation.process(p.id, jobContext); await automation.process(p.id, jobContext)
  assert.equal(launches.size, 1)
  let run = await automation.runs.findOneByOrFail({ repositoryPolicyId: p.id })
  const review = await reviews.get(scope, run.reviewId)
  await reviews.complete(scope, { configurable: { executionId: review.executionId, context: { codeReview: { reviewId: review.id, headSha: sha } } } }, { summary: 'No supported findings', findings: [] })
  await automation.process(p.id, jobContext)
  assert.equal((await automation.runs.findOneByOrFail({ id: run.id })).status, 'completed')
  ok('signed duplicate PR delivery dispatches once and requires the review finalizer')
  const workflowPayload = (id, attempt = 1, conclusion = 'failure') => {
    const workflow_run = { id, run_attempt: attempt, head_sha: sha, head_branch: 'main', name: 'CI', conclusion, status: 'completed', html_url: `https://github.com/fixture/repo/actions/runs/${id}` }
    workflowRuns.set(id, workflow_run)
    return { action: 'completed', installation: { id: 888 }, repository: { id: 777 }, workflow_run }
  }
  const failure = workflowPayload(10)
  const failureId = await send('workflow_run', failure)
  await send('workflow_run', failure, failureId)
  loseReceipt = true
  await automation.process(p.id, jobContext)
  let diagnosis = await workflows.records.findOneByOrFail({ operationKey: `10-1-${p.revision}` })
  assert.equal(diagnosis.status, 'running'); assert.equal(diagnosis.reason, 'dispatch_pending_confirmation')
  const count = launches.size
  workflows = new WorkflowDiagnostics(db.getRepository(WorkflowDiagnosis), repositories, events, context)
  await workflows.process(p)
  assert.equal(launches.size, count)
  diagnosis = await workflows.records.findOneByOrFail({ id: diagnosis.id })
  const config = { configurable: { executionId: diagnosis.executionId, context: { codeReviewWorkflow: { diagnosisId: diagnosis.id } } } }
  await assert.rejects(workflows.evidence({ ...scope, userId: randomUUID() }, config), /task_binding_mismatch/)
  await assert.rejects(workflows.evidence(scope, { configurable: { ...config.configurable, executionId: randomUUID() } }), /task_binding_mismatch/)
  const log = await workflows.log(scope, config, 1010, 0, 100); assert(log.lines.includes('expected true'))
  await assert.rejects(workflows.log(scope, config, 9999, 0, 100), /invalid_workflow_job/)
  await workflows.complete(scope, config, { summary: 'A test failed', findings: [{ jobId: 1010, cause: 'Assertion mismatch', evidence: log.lines, suggestion: 'Check the changed assertion' }] })
  await workflows.process(p)
  assert.equal((await workflows.records.findOneByOrFail({ id: diagnosis.id })).status, 'completed')
  assert.equal((await workflows.list({ ...scope, userId: randomUUID() }, 1)).total, 0)
  ok('workflow diagnosis without PR survives a lost receipt and restart with isolated evidence/finalization')
  await send('workflow_run', workflowPayload(10, 2)); await workflows.process(p)
  assert.equal(await workflows.records.count(), 2)
  await trigger.stop(params)
  await workflows.process(p)
  assert.equal((await workflows.records.findOneByOrFail({ operationKey: `10-2-${p.revision}` })).status, 'cancelled')
  await send('workflow_run', workflowPayload(11))
  assert.equal((await workflows.records.findOneByOrFail({ operationKey: `11-1-${p.revision}-skip-completed` })).status, 'skipped')
  ok('attempts remain distinct and pausing cancels work and skips new deliveries')
  await trigger.publish({ ...params, scope: { tenantId: scope.tenantId, organizationId: scope.organizationId, workspaceId: scope.workspaceId } })
  await send('workflow_run', workflowPayload(12)); await workflows.process(p)
  permitted = false; await workflows.process(p)
  assert.equal((await workflows.records.findOneByOrFail({ operationKey: `12-1-${p.revision}` })).status, 'cancelled')
  assert(cancelled.length >= 2); permitted = true
  ok('bootstrap reuses persisted identity and capability revocation stops execution')
  const chatScope = { ...scope, runtime: { executionId: randomUUID() } }
  const requested = await reviews.request(chatScope, pr.html_url, '', {})
  const repeated = await reviews.request(chatScope, pr.html_url, '', {})
  assert.equal(repeated.reviewId, requested.reviewId)
  await assert.rejects(reviews.request(chatScope, pr.html_url, '', config), /nested_review_forbidden/)
  ok('PR-link request is idempotent within an execution and dispatched tasks cannot recursively launch')
  const migration = await readFile(new URL('../migrations/20261102-assistant-events.sql', import.meta.url), 'utf8')
  await db.query(`UPDATE plugin_code_review_repository SET settings = settings - 'executionMode' WHERE id = $1`, [p.id])
  await db.query(migration); await db.query(migration)
  assert.equal((await repositories.get(scope, p.id)).settings.executionMode, 'pipeline')
  ok('additive migration is repeatable and legacy policies stay on pipelines')
  console.log(`Assistant event acceptance: ${passed} checks passed; external GitHub/model transports were fixtures.`)
} finally {
  globalThis.fetch = originalFetch
  if (db.isInitialized) { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() }
}
