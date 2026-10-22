// Opt-in integration acceptance. Uses a disposable PostgreSQL schema, never business tables.
// XPERT_TEST_PLATFORM_ROOT and XPERT_TEST_ENV_FILE point to the existing local host runtime.
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID, createHmac, generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { DataSource } from 'typeorm'
import { GitHub } from '../dist/github.js'
import { GitHubApp } from '../dist/github-app.js'
import { Review } from '../dist/entity.js'
import { ReviewRepository, ReviewRun, ReviewDelivery } from '../dist/automation-entities.js'
import { ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery } from '../dist/pipeline/entity.js'
import { ReviewPipelineCatalog } from '../dist/pipeline/catalog.js'
import { ReviewPipelineService } from '../dist/pipeline/service.js'
import { ReviewPipelineAutomation } from '../dist/pipeline/automation.js'
import { lightweightReviewPipelineConfiguration } from '../dist/pipeline/configuration.js'
import { Repositories } from '../dist/repositories.js'
import { Reviews } from '../dist/backend.js'
import { Automation } from '../dist/automation.js'
import { defaultPolicy, QUEUE } from '../dist/automation-domain.js'
import { PLUGIN } from '../dist/domain.js'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability, ProjectPipelineCatalogRuntimeCapability, ProjectPipelineCommandsRuntimeCapability, ProjectPipelinesRuntimeCapability, SYSTEM_GLOBAL_SCOPE, AssistantTaskRuntimeCapability, ConnectorRuntimeCapability } from '@xpert-ai/plugin-sdk'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname)) throw new Error('Dedicated test database required')
if (!url && (!process.env.XPERT_TEST_PLATFORM_ROOT || !process.env.XPERT_TEST_ENV_FILE)) throw new Error('Explicit test database or local host and env file required')
const requireHost = createRequire(process.env.XPERT_TEST_PLATFORM_ROOT ? process.env.XPERT_TEST_PLATFORM_ROOT + '/package.json' : import.meta.url)
const env = url ? {} : requireHost('dotenv').parse(await readFile(process.env.XPERT_TEST_ENV_FILE))
const pg = requireHost('pg')
const schema = 'review_test_' + randomUUID().replaceAll('-', '')
const options = url ? { connectionString: url } : { host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASS }
const admin = new pg.Client(options)
await admin.connect()
await admin.query(`CREATE SCHEMA "${schema}"`)
const db = new DataSource({ type: 'postgres', driver: pg, ...options, ...(url ? { url } : { username: options.user }), schema,
  extra: { options: `-c search_path=${schema},public` },
  entities: [Review, ReviewRepository, ReviewRun, ReviewDelivery, ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery], synchronize: true, logging: false })
const tenantId = randomUUID(), organizationId = randomUUID(), assistantId = randomUUID(), userId = randomUUID(), workspaceId = randomUUID()
const scope = { tenantId, organizationId, assistantId, userId, workspaceId }
const secret = 'test-only-webhook-secret-never-deployed'
const states = new Map(), posts = [], dispatches = [], jobs = [], failures = new Set()
const sha = n => n.toString(16).padStart(40, '0')
const pull = n => ({ title: `Fixture PR ${n}`, body: 'untrusted PR text', html_url: `https://github.com/fixture/repo/pull/${n}`, state: 'open', draft: false,
  user: { login: 'fixture', type: 'User' }, head: { sha: sha(n) }, base: { sha: sha(0), ref: 'develop' }, changed_files: 1, number: n })
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname
  if (path === '/user') return Response.json({ login: 'fixture' })
  if (path === '/repos/fixture/repo/installation') return Response.json({ id: 888, permissions: { contents: 'read', pull_requests: 'write' } })
  if (path === '/app/installations/888/access_tokens') return Response.json({ token: 'installation-fixture' })
  if (path === '/repos/fixture/repo') return Response.json({ id: 777, name: 'repo', owner: { login: 'fixture' }, permissions: { push: true } })
  const n = Number(path.match(/\/(?:pulls|issues)\/(\d+)/)?.[1])
  const pr = states.get(n)
  if (path.endsWith('/reviews') && init.method === 'POST') {
    const body = JSON.parse(init.body); posts.push(body)
    if (failures.has(n)) throw new Error('fixture response lost AFTER POST')
    return Response.json({ id: posts.length, html_url: `https://github.com/fixture/repo/pull/${n}#pullrequestreview-${posts.length}`, state: 'COMMENTED' })
  }
  if (path.endsWith('/files')) return Response.json([{ filename: 'app.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' }])
  if (path.endsWith('/comments')) return Response.json([])
  if (path.endsWith('/check-runs')) return Response.json({ check_runs: [], total_count: 0 })
  if (pr) return Response.json(pr)
  throw new Error('Unexpected fixture route: ' + path)
}
const tasks = { startTask: async v => { dispatches.push(v); return { executionId: v.executionId, conversationId: v.conversationId, taskId: randomUUID(), threadId: randomUUID() } },
  getTaskStatus: async () => ({ status: 'running' }), cancelTask: async () => ({ cancelled: true }) }
const { MANAGED_QUEUE_SERVICE_TOKEN, INTEGRATION_PERMISSION_SERVICE_TOKEN } = await import('@xpert-ai/plugin-sdk')
const integrationId = randomUUID()
const application = { id: integrationId, tenantId, organizationId: null, provider: 'github', name: 'Fixture App', options: {
  appId: '42', appSlug: 'fixture', clientId: 'fixture-client', clientSecret: 'fixture-client-secret', webhookSecret: secret,
  privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
} }
let integrationAvailable = true
const pluginContext = { tenantId: null, scopeKey: SYSTEM_GLOBAL_SCOPE, config: { githubIntegrationId: integrationId }, resolve: token => {
  if (token === MANAGED_QUEUE_SERVICE_TOKEN) return { enqueue: async v => { jobs.push(v); return { jobId: v.jobId } } }
  if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) return { readConfiguration: async id => {
    assert.equal(id, integrationId)
    return integrationAvailable ? application : null
  } }
  return { createScopedApi: () => ({ capabilities: { get: cap => cap === AssistantTaskRuntimeCapability ? tasks : cap === ConnectorRuntimeCapability ?
    { getConnectorCredential: async () => ({ authMethodId: 'github-app-oauth', credentials: { accessToken: 'fixture', integrationId, oauthClientId: 'fixture-client' } }),
      getConnector: () => { throw new Error('legacy API must not be used') } } : undefined } }) }
} }
let passed = 0
const ok = label => { passed++; console.log('PASS ' + label) }
try {
  await db.initialize()
  const migration = await readFile(new URL('../migrations/20261021-github-system-integration.sql', import.meta.url), 'utf8')
  // Exercise upgrades from old and already-synchronized schemas; neither may guess an App identity.
  await db.query('ALTER TABLE plugin_code_review_repository DROP COLUMN "githubIntegrationId", DROP COLUMN "githubAppId"')
  await db.query(migration); await db.query(migration)
  ok('repository App-binding migration is idempotent on existing installations')
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  const projectId = randomUUID(), bindingId = randomUUID(), pipelineStarts = [], nextRounds = [], graphs = new Map(), receipts = new Map()
  let permitted = true, bindingValid = true, loseStartReceipt = false
  const projectEditor = randomUUID()
  const access = c => {
    if (!permitted || ![userId, projectEditor].includes(c.actor.userId) || c.actor.tenantId !== tenantId || c.projectId !== projectId) throw new Error('project_access_revoked')
    return { projectId, role: 'owner', canManage: true, archived: false }
  }
  capabilities.register(ProjectAccessRuntimeCapability, { listReadable: async () => [], assertEdit: async c => access(c), assertManage: async c => access(c) })
  const configuration = lightweightReviewPipelineConfiguration(assistantId, { requireChecks: false, requiredChecks: [], blockingPriorities: ['P0', 'P1'] })
  capabilities.register(ProjectPipelineCatalogRuntimeCapability, { binding: async (c, id) => {
    access(c)
    if (!bindingValid || id !== bindingId) throw new Error('pipeline_binding_unavailable')
    return { id, configuration, revision: 1, createdAt: new Date().toISOString() }
  } })
  const catalog = new ReviewPipelineCatalog(capabilities)
  const repositories = new Repositories(db.getRepository(ReviewRepository), new GitHubApp(pluginContext), catalog, capabilities)
  const reviews = new Reviews(db.getRepository(Review), pluginContext, repositories, capabilities)
  const service = new ReviewPipelineService(db.getRepository(ReviewPipelineBinding), db.getRepository(ReviewPipelineEvidence), db.getRepository(Review), reviews, capabilities)
  const pipelines = new ReviewPipelineAutomation(service, reviews, catalog, capabilities)
  const automation = new Automation(db.getRepository(ReviewRun), db.getRepository(ReviewDelivery), repositories, reviews, pluginContext, pipelines)
  capabilities.register(ProjectPipelineCommandsRuntimeCapability, {
    start: async (c, input) => {
      access(c)
      if (receipts.has(input.triggerKey)) return receipts.get(input.triggerKey)
      const subject = await service.subject(c, input.objectKey)
      const receipt = { instanceId: randomUUID(), runId: randomUUID(), roundId: randomUUID(), revision: 1 }
      pipelineStarts.push(input); receipts.set(input.triggerKey, receipt)
      graphs.set(receipt.instanceId, { projectId, instance: { id: receipt.instanceId, sourceKey: input.objectKey, revision: 1 },
        runId: receipt.runId, roundId: receipt.roundId, runState: 'active', round: { state: 'active' }, attentions: [], actions: { cancel: true }, subject })
      if (loseStartReceipt) { loseStartReceipt = false; throw new Error('fixture_receipt_lost') }
      return receipt
    },
    nextRound: async (c, input) => {
      access(c)
      if (receipts.has(input.requestId)) return receipts.get(input.requestId)
      const graph = graphs.get(input.instanceId)
      const subject = await service.subject(c, graph.instance.sourceKey)
      assert.notEqual(subject.digest, graph.subject.digest)
      const receipt = { instanceId: input.instanceId, runId: graph.runId, roundId: randomUUID(), revision: graph.instance.revision + 1 }
      nextRounds.push(input); receipts.set(input.requestId, receipt)
      graphs.set(input.instanceId, { ...graph, roundId: receipt.roundId, subject, instance: { ...graph.instance, revision: receipt.revision }, attentions: [] })
      return receipt
    },
    cancel: async (c, input) => { access(c); graphs.get(input.instanceId).runState = 'cancelled' },
    decide: async () => { throw new Error('Inbox must not create a second approval') }
  })
  capabilities.register(ProjectPipelinesRuntimeCapability, { graph: async (c, id) => { access(c); return graphs.get(id) } })
  const routingMigration = await readFile(new URL('../migrations/20261022-repository-pipelines.sql', import.meta.url), 'utf8')
  await db.query(routingMigration); await db.query(routingMigration)
  ok('routing migration is idempotent and leaves existing private ownership intact')
  let policy = await repositories.add(scope, 'fixture', 'repo')
  assert.equal(policy.githubIntegrationId, integrationId); assert.equal(policy.githubAppId, '42')
  await assert.rejects(repositories.add({ ...scope, organizationId: randomUUID(), userId: randomUUID(), assistantId: randomUUID() }, 'fixture', 'repo'), /repository_already_configured/)
  ok('one owner per installation and repository across organizations')
  const ctx = { pluginName: PLUGIN, queueName: QUEUE, jobName: 'supervise', scopeKey: SYSTEM_GLOBAL_SCOPE, tenantId, organizationId, userId }
  const receive = async (n, action = 'opened', deliveryId = randomUUID()) => {
    if (!states.has(n)) states.set(n, pull(n))
    const raw = Buffer.from(JSON.stringify({ action, installation: { id: 888 }, repository: { id: 777, name: 'repo', owner: { login: 'fixture' } }, pull_request: states.get(n) }))
    return automation.receive(raw, 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'), deliveryId, 'pull_request')
  }
  const tick = () => automation.process(policy.id, ctx, 'fixture-job')
  const runFor = n => automation.runs.findOneByOrFail({ repositoryPolicyId: policy.id, number: n })
  const ping = Buffer.from('{"zen":"fixture"}')
  const sign = key => 'sha256=' + createHmac('sha256', key).update(ping).digest('hex')
  assert.deepEqual(await automation.receive(ping, sign(secret), randomUUID(), 'ping'), { accepted: true, ignored: true })
  await assert.rejects(automation.receive(ping, sign('wrong'), randomUUID(), 'ping'), /invalid_webhook_signature/)
  application.options.webhookSecret = 'rotated-fixture-secret'.repeat(2)
  await assert.rejects(automation.receive(ping, sign(secret), randomUUID(), 'ping'), /invalid_webhook_signature/)
  await automation.receive(ping, sign(application.options.webhookSecret), randomUUID(), 'ping')
  application.options.webhookSecret = secret
  integrationAvailable = false
  await assert.rejects(automation.receive(ping, sign(secret), randomUUID(), 'ping'), /github_integration_unavailable/)
  integrationAvailable = true
  application.options.appId = '43'
  await assert.rejects(receive(1), /github_repository_revalidation_required/)
  await assert.rejects(repositories.github(scope, policy.id), /github_repository_revalidation_required/)
  application.options.appId = '42'
  const pinned = { githubIntegrationId: policy.githubIntegrationId, githubAppId: policy.githubAppId }
  await repositories.records.update(policy.id, { githubIntegrationId: null, githubAppId: null })
  await assert.rejects(receive(1), /github_repository_revalidation_required/)
  await repositories.records.update(policy.id, pinned)
  ok('fresh system integration lookup, webhook secret rotation and App switch guards')
  await receive(1); await tick(); assert.equal((await runFor(1)).status, 'skipped'); assert.equal(dispatches.length, 0); ok('disabled automation does not dispatch')
  await assert.rejects(repositories.save(scope, policy.id, policy.revision, { ...defaultPolicy, enabled: true }), /pipeline_binding_required/)
  await repositories.records.update(policy.id, { settings: { ...defaultPolicy, enabled: true } })
  await receive(10); await tick(); assert.equal((await runFor(10)).status, 'needs_configuration'); assert.equal(dispatches.length, 0)
  ok('unbound legacy configuration never falls back to a direct Agent')
  policy = await repositories.save(scope, policy.id, policy.revision, { ...defaultPolicy, enabled: true,
    pipeline: { projectId, bindingId }, visibility: 'project' })
  await assert.rejects(repositories.save(scope, policy.id, policy.revision, { ...policy.settings, delivery: 'automatic' }), /pipeline_policy_invalid/)
  const delivery = randomUUID(); await Promise.all([receive(2, 'opened', delivery), receive(2, 'opened', delivery), receive(2)])
  assert.equal(await automation.runs.countBy({ number: 2 }), 1)
  await assert.rejects(receive(12, 'opened', delivery), /delivery_payload_mismatch/)
  loseStartReceipt = true
  await Promise.all([tick(), tick()]); await tick()
  assert.equal(pipelineStarts.length, 1); assert.equal(nextRounds.length, 0); assert.equal(dispatches.length, 0)
  let run = await runFor(2)
  assert(run.pipelineInstanceId); assert(run.pipelineRoundId); assert(run.startedAt)
  const sharedScope = { ...scope, userId: projectEditor, runtime: { projectId } }
  const sharedInbox = await automation.overview(sharedScope)
  assert(sharedInbox.runs.some(item => item.id === run.id))
  assert(!sharedInbox.runs.some(item => item.number === 1 || item.number === 10))
  assert((await automation.overview(scope)).runs.some(item => item.number === 10))
  assert.equal((await automation.overview({ ...sharedScope, assistantId: randomUUID() })).runs.length, 0)
  ok('Project inbox shares bound reviews without exposing old private runs or another Assistant')
  const firstReviewId = run.reviewId, firstRound = run.pipelineRoundId
  ok('duplicate deliveries, concurrent workers and a lost receipt produce one platform start, zero direct dispatches')
  const graph = graphs.get(run.pipelineInstanceId)
  graph.attentions = [{ state: 'open', kind: 'human', reasonCode: 'human_decision_required' }]
  await tick(); run = await runFor(2); assert.equal(run.status, 'awaiting_confirmation')
  await assert.rejects(automation.confirm(scope, run.id), /pipeline_approval_required/)
  assert.equal(posts.length, 0); ok('inbox points to the platform human gate without a second approval or publication path')
  states.get(2).head.sha = sha(222)
  await receive(2, 'synchronize')
  await automation.runs.update({ number: 2, status: 'queued' }, { notBefore: new Date(0) })
  await tick(); await tick()
  const latest = await automation.runs.findOneOrFail({ where: { number: 2, headSha: sha(222) } })
  assert.equal(latest.pipelineInstanceId, run.pipelineInstanceId); assert.notEqual(latest.pipelineRoundId, firstRound)
  assert.equal(nextRounds.length, 1); assert.equal(pipelineStarts.length, 1)
  assert.equal((await db.getRepository(Review).findOneByOrFail({ id: firstReviewId })).snapshot.headSha, sha(2))
  assert.equal((await db.getRepository(Review).findOneByOrFail({ id: latest.reviewId })).snapshot.headSha, sha(222))
  assert.equal((await automation.runs.findOneByOrFail({ id: run.id })).status, 'superseded')
  ok('a new SHA creates a round in the same PR instance and preserves both immutable snapshots')
  // A manually opened duplicate revision joins the same instance without dispatching again.
  const manual = await reviews.open(scope, 'https://github.com/fixture/repo/pull/2', 'public')
  const linked = await service.attach(scope, { id: manual.id, revision: manual.revision, projectId, bindingId, requestId: randomUUID() })
  assert.equal(linked.instanceId, latest.pipelineInstanceId); assert.equal(linked.roundId, latest.pipelineRoundId)
  assert.equal(pipelineStarts.length, 1); assert.equal(nextRounds.length, 1)
  ok('manual and webhook starts for the same PR revision share the authoritative instance')
  bindingValid = false
  await receive(14); await tick(); assert.equal((await runFor(14)).status, 'needs_configuration'); assert.equal(pipelineStarts.length, 1)
  bindingValid = true
  ok('unavailable saved configuration is explicit and never dispatches a fallback Agent')
  await assert.rejects(automation.process(policy.id, { ...ctx, tenantId: randomUUID() }), /queue_scope_mismatch/)
  await assert.rejects(repositories.get({ ...scope, userId: randomUUID() }, policy.id), /project_access_revoked/)
  permitted = false
  await receive(3); await tick(); assert.equal(pipelineStarts.length, 1)
  permitted = true
  await tick(); assert.equal(pipelineStarts.length, 2)
  ok('queue identity and live Project authorization guard dispatch')
  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: false })
  await tick(); assert.equal((await runFor(3)).status, 'cancelled')
  states.set(9, pull(9)); const trial = await automation.trial(scope, policy.id, 9); await tick(); await tick()
  assert.equal((await runFor(9)).pipelineInstanceId != null, true)
  await assert.rejects(automation.confirm(scope, trial.id), /pipeline_approval_required/)
  ok('pause cancels platform work; trials use the same pipeline and have no inbox publication path')
  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: true, dailyLimit: 1 })
  await receive(7); await tick(); assert.equal((await runFor(7)).reason, 'daily_limit_reached')
  ok('daily quota still uses durable reservations')
  await automation.recover(); assert(jobs.length > 0)
  assert(!JSON.stringify(jobs).includes('privateKey')); assert(!JSON.stringify(jobs).includes('accessToken'))
  assert.equal(dispatches.length, 0); assert.equal(posts.length, 0)
  ok('recovery queues only scoped identities and never sends secrets or PR contents')
  console.log(JSON.stringify({ passed, pipelineStarts: pipelineStarts.length, nextRounds: nextRounds.length, directDispatches: dispatches.length, posts: posts.length }))

} finally {
  globalThis.fetch = originalFetch
  if (db.isInitialized) await db.destroy()
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
  await admin.end()
}
