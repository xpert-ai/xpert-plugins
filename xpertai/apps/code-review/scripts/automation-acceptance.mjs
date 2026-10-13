// Opt-in integration acceptance. Uses a disposable PostgreSQL schema, never business tables.
// XPERT_TEST_PLATFORM_ROOT and XPERT_TEST_ENV_FILE point to the existing local host runtime.
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID, createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { DataSource } from 'typeorm'
import { GitHub } from '../dist/github.js'
import { GitHubApp } from '../dist/github-app.js'
import { Review } from '../dist/entity.js'
import { ReviewRepository, ReviewRun, ReviewDelivery } from '../dist/automation-entities.js'
import { Repositories } from '../dist/repositories.js'
import { Reviews } from '../dist/backend.js'
import { Automation } from '../dist/automation.js'
import { defaultPolicy, QUEUE } from '../dist/automation-domain.js'
import { PLUGIN } from '../dist/domain.js'
import { SYSTEM_GLOBAL_SCOPE, AssistantTaskRuntimeCapability, ConnectorRuntimeCapability } from '@xpert-ai/plugin-sdk'

if (!process.env.XPERT_TEST_PLATFORM_ROOT || !process.env.XPERT_TEST_ENV_FILE) throw new Error('Explicit local test host and env file required')
const requireHost = createRequire(process.env.XPERT_TEST_PLATFORM_ROOT + '/package.json')
const env = requireHost('dotenv').parse(await readFile(process.env.XPERT_TEST_ENV_FILE))
const pg = requireHost('pg')
const schema = 'review_test_' + randomUUID().replaceAll('-', '')
const options = { host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASS }
const admin = new pg.Client(options)
await admin.connect()
await admin.query(`CREATE SCHEMA "${schema}"`)
const db = new DataSource({ type: 'postgres', driver: pg, ...options, username: options.user, schema,
  entities: [Review, ReviewRepository, ReviewRun, ReviewDelivery], synchronize: true, logging: false })
const tenantId = randomUUID(), organizationId = randomUUID(), assistantId = randomUUID(), userId = randomUUID(), workspaceId = randomUUID()
const scope = { tenantId, organizationId, assistantId, userId, workspaceId }
const secret = 'test-only-webhook-secret-never-deployed'
const states = new Map(), posts = [], dispatches = [], jobs = [], failures = new Set()
const sha = n => n.toString(16).padStart(40, '0')
const pull = n => ({ title: `Fixture PR ${n}`, body: 'untrusted PR text', html_url: `https://github.com/fixture/repo/pull/${n}`, state: 'open', draft: false,
  user: { login: 'fixture', type: 'User' }, head: { sha: sha(n) }, base: { sha: sha(0), ref: 'develop' }, changed_files: 1, number: n })
const github = new GitHub('local-fixture-only', async (url, init) => {
  const path = new URL(url).pathname
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
})
const tasks = { startTask: async v => { dispatches.push(v); return { executionId: v.executionId, conversationId: v.conversationId, taskId: randomUUID(), threadId: randomUUID() } },
  getTaskStatus: async () => ({ status: 'running' }), cancelTask: async () => ({ cancelled: true }) }
const pluginContext = { config: { githubApp: { appId: '42', slug: 'fixture', privateKey: 'unused-fixture', webhookSecret: secret, publicBaseUrl: 'https://fixture.invalid' } },
  resolve: token => token === 'MANAGED_QUEUE_SERVICE' ? { enqueue: async v => { jobs.push(v); return { jobId: v.jobId } } } :
    { createScopedApi: () => ({ capabilities: { get: cap => cap === AssistantTaskRuntimeCapability ? tasks : cap === ConnectorRuntimeCapability ?
      { getConnectorCredential: async () => ({ credentials: { accessToken: 'fixture' } }), getConnector: () => { throw new Error('legacy API must not be used') } } : undefined } }) } }
// Resolve by the real queue token without relying on its string representation.
const { MANAGED_QUEUE_SERVICE_TOKEN } = await import('@xpert-ai/plugin-sdk')
const runtimeResolve = pluginContext.resolve
pluginContext.resolve = token => token === MANAGED_QUEUE_SERVICE_TOKEN ? { enqueue: async v => { jobs.push(v); return { jobId: v.jobId } } } : runtimeResolve(token)
class FixtureApp extends GitHubApp {
  async inspect() { return { installationId: '888', repositoryId: '777', owner: 'fixture', repository: 'repo' } }
  async installation() { return github }
}
let passed = 0
const ok = label => { passed++; console.log('PASS ' + label) }
try {
  await db.initialize()
  const repositories = new Repositories(db.getRepository(ReviewRepository), new FixtureApp(pluginContext))
  const reviews = new Reviews(db.getRepository(Review), pluginContext, repositories)
  const automation = new Automation(db.getRepository(ReviewRun), db.getRepository(ReviewDelivery), repositories, reviews, pluginContext)
  let policy = await repositories.add(scope, 'fixture', 'repo')
  const ctx = { pluginName: PLUGIN, queueName: QUEUE, jobName: 'supervise', scopeKey: SYSTEM_GLOBAL_SCOPE, tenantId, organizationId, userId }
  const receive = async (n, action = 'opened', deliveryId = randomUUID()) => {
    if (!states.has(n)) states.set(n, pull(n))
    const raw = Buffer.from(JSON.stringify({ action, installation: { id: 888 }, repository: { id: 777, name: 'repo', owner: { login: 'fixture' } }, pull_request: states.get(n) }))
    return automation.receive(raw, 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'), deliveryId, 'pull_request')
  }
  const tick = () => automation.process(policy.id, ctx, 'fixture-job')
  const runFor = n => automation.runs.findOneByOrFail({ repositoryPolicyId: policy.id, number: n })
  const finalize = async n => {
    const run = await runFor(n), r = await reviews.get(scope, run.reviewId)
    await reviews.complete(scope, { configurable: { executionId: r.executionId, context: { codeReview: { reviewId: r.id, headSha: r.snapshot.headSha } } } },
      { summary: 'Fixture review complete; no tests executed.', findings: [
        { title: 'Serious regression', body: 'Concrete fixture evidence', priority: 'P1', path: 'app.ts', side: 'RIGHT', line: 1 },
        { title: 'Normal regression', body: 'Concrete fixture evidence', priority: 'P2', path: 'app.ts', side: 'RIGHT', line: 1 }] })
  }
  await receive(1); await tick(); assert.equal((await runFor(1)).status, 'skipped'); assert.equal(dispatches.length, 0); ok('disabled automation does not dispatch')
  policy = await repositories.save(scope, policy.id, policy.revision, { ...defaultPolicy, enabled: true })
  const delivery = randomUUID(); await Promise.all([receive(2, 'opened', delivery), receive(2, 'opened', delivery), receive(2)])
  assert.equal(await automation.runs.countBy({ number: 2 }), 1)
  await assert.rejects(receive(12, 'opened', delivery), /delivery_payload_mismatch/)
  await Promise.all([tick(), tick()]); assert.equal(dispatches.length, 1); ok('concurrent webhook delivery and workers dispatch exactly once')
  const run = await runFor(2)
  assert(run.jobId); assert(run.startedAt); assert(run.reviewId)
  const storedReview = await reviews.get(scope, run.reviewId); assert(storedReview.taskId); assert(storedReview.threadId)
  const restarted = new Automation(db.getRepository(ReviewRun), db.getRepository(ReviewDelivery), repositories, reviews, pluginContext)
  await restarted.recover(); await restarted.process(policy.id, ctx); assert.equal(dispatches.length, 1)
  assert(!JSON.stringify(jobs).includes('privateKey')); assert(!JSON.stringify(jobs).includes('accessToken'))
  await assert.rejects(automation.process(policy.id, { ...ctx, tenantId: randomUUID() }), /queue_scope_mismatch/)
  await assert.rejects(repositories.get({ ...scope, userId: randomUUID() }, policy.id), /repository_not_found/)
  ok('queue ownership, private access, and persisted identities')
  await finalize(2); await tick(); assert.equal((await runFor(2)).status, 'awaiting_confirmation'); assert.equal(posts.length, 0)
  await automation.confirm(scope, run.id); assert.equal(posts.length, 1); assert.equal(posts[0].event, 'COMMENT'); assert.equal(posts[0].comments.length, 1)
  await assert.rejects(automation.confirm(scope, run.id), /run_not_submittable/); ok('draft requires confirmation; only P0/P1 COMMENT posts once')
  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, delivery: 'automatic' })
  await receive(3); await tick(); await finalize(3)
  states.get(3).head.sha = sha(333); await tick(); assert.equal((await runFor(3)).status, 'superseded'); assert.equal(posts.length, 1); ok('new commit suppresses stale publication')
  await receive(4); await tick(); await finalize(4); await tick(); assert.equal((await runFor(4)).status, 'published'); assert.equal(posts.length, 2); await tick(); assert.equal(posts.length, 2); ok('automatic review publishes once with current head')
  await receive(5); await tick(); await finalize(5); failures.add(5); await tick(); await tick()
  assert.equal((await runFor(5)).status, 'publication_unknown'); assert.equal(posts.length, 3); ok('uncertain external POST is frozen, never retried')
  await receive(6); await tick(); policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: false }); await tick()
  assert.equal((await runFor(6)).status, 'cancelled'); assert.equal((await reviews.get(scope, (await runFor(6)).reviewId)).status, 'cancelled'); ok('pausing cancels queued/running old-policy work')
  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: true, dailyLimit: 1 })
  await receive(7); await tick(); assert.equal((await runFor(7)).reason, 'daily_limit_reached'); ok('daily quota is persisted and enforced')
  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, dailyLimit: 20 })
  await receive(8, 'synchronize'); await tick(); assert.equal((await runFor(8)).status, 'queued'); assert.equal((await runFor(8)).reviewId, null); ok('push debounce defers execution')
  const prior = await runFor(3), retried = await automation.retry(scope, prior.id)
  assert.notEqual(retried.id, prior.id); assert.equal(retried.headSha, sha(333)); assert.equal((await automation.retry(scope, prior.id)).id, retried.id)
  await assert.rejects(automation.retry(scope, (await runFor(5)).id), /run_not_retryable/); ok('retry creates a new current-head attempt and cannot repeat an uncertain POST')
  assert.equal((await automation.overview({ ...scope, userId: randomUUID() })).total, 0); ok('inbox never exposes another configuring user’s review records')
  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: false })
  states.set(9, pull(9)); await automation.trial(scope, policy.id, 9); await tick(); await finalize(9); await tick()
  assert.equal((await runFor(9)).status, 'awaiting_confirmation'); await assert.rejects(automation.confirm(scope, (await runFor(9)).id), /run_not_submittable/); assert.equal(posts.length, 3); ok('trial runs while disabled and cannot publish')
  await automation.recover(); assert(jobs.length > 0); ok('bootstrap recovery re-arms persisted repositories')
  // Live code path for the v2 credential API; no network request is made.
  assert(await reviews.github(scope, 'connected')); ok('connected GitHub resolves v2 credentials without legacy appId requirement')
  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: true, delivery: 'draft', dailyLimit: 200 })
  const prepareDraft = async n => { await receive(n); await tick(); await finalize(n); await tick(); assert.equal((await runFor(n)).status, 'awaiting_confirmation') }
  await prepareDraft(40); failures.add(40)
  const failedConfirm = await runFor(40), beforePost = posts.length
  await assert.rejects(automation.confirm(scope, failedConfirm.id), /submission_unknown_check_github/)
  assert.equal((await runFor(40)).status, 'publication_unknown')
  await tick(); await assert.rejects(automation.confirm(scope, failedConfirm.id), /run_not_submittable/)
  await assert.rejects(automation.retry(scope, failedConfirm.id), /run_not_retryable/)
  assert.equal(posts.length, beforePost + 1)
  ok('draft confirmation commits an uncertain POST outcome and prevents duplicate publication')

  await prepareDraft(41); states.get(41).head.sha = sha(444)
  await tick(); assert.equal((await runFor(41)).status, 'superseded')
  const retry = await automation.retry(scope, (await runFor(41)).id)
  assert.equal(retry.headSha, sha(444))
  ok('waiting draft becomes superseded after a push and can be retried at the new head')

  await prepareDraft(42); states.get(42).head.sha = sha(445)
  await assert.rejects(automation.confirm(scope, (await runFor(42)).id), /new_commit/)
  assert.equal((await runFor(42)).status, 'superseded')
  ok('confirmation before the worker tick commits stale-head invalidation')

  await prepareDraft(43); states.get(43).state = 'closed'; await tick()
  assert.equal((await runFor(43)).reason, 'pull_request_closed')
  await prepareDraft(44)
  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: false })
  await tick(); assert.equal((await runFor(44)).status, 'cancelled')
  ok('closed PRs and policy changes invalidate waiting drafts')

  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: true })
  await prepareDraft(45)
  const interrupted = await runFor(45)
  await reviews.publishAutomatic(policy, interrupted, true)
  // Simulate a crash after GitHub and Review persistence, before the Run commits.
  await db.getRepository(Review).update({ id: interrupted.reviewId }, { status: 'submission_unknown', submissionUrl: null })
  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: false })
  const recoveryPosts = posts.length
  await restarted.process(policy.id, ctx)
  assert.equal((await runFor(45)).status, 'publication_unknown'); assert.equal(posts.length, recoveryPosts)
  ok('restart reconciles interrupted draft publication before applying a changed policy')

  policy = await repositories.save(scope, policy.id, policy.revision, { ...policy.settings, enabled: true })
  // More waiting drafts than one worker batch must not starve new work.
  for (let n = 60; n < 72; n++) {
    states.set(n, pull(n))
    const waiting = await automation.runs.save(automation.runs.create({ tenantId, organizationId, assistantId, repositoryPolicyId: policy.id,
      operationKey: 'waiting-' + n, number: n, headSha: sha(n), title: 'Waiting draft', trigger: 'opened', settings: policy.settings,
      policyRevision: policy.revision, status: 'awaiting_confirmation', notBefore: new Date(0), startedAt: new Date(), updatedAt: new Date(0) }))
    const record = await reviews.prepareAutomatic(policy, waiting)
    await db.getRepository(Review).update({ id: record.id }, { status: 'reviewed' })
    await automation.runs.update({ id: waiting.id }, { reviewId: record.id, updatedAt: new Date(0) })
  }
  const beforeDispatch = dispatches.length
  await receive(80); await tick(); await tick(); await tick()
  assert.equal((await runFor(80)).status, 'running')
  assert(dispatches.length > beforeDispatch)
  assert.equal(posts.length, recoveryPosts)
  ok('waiting drafts rotate fairly without dispatching or publishing again')
  console.log(JSON.stringify({ passed, isolatedSchema: true, externalGitHub: false, modelTransport: 'fixture', dispatches: dispatches.length, posts: posts.length }))
} finally {
  if (db.isInitialized) await db.destroy()
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
  await admin.end()
}
