import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type PluginContext } from '@xpert-ai/plugin-sdk'
import { defaultPolicy, type PublicationMode } from '../src/automation-contract.js'
import { Reviews } from '../src/backend.js'
import { Review } from '../src/entity.js'
import { GitHub } from '../src/github.js'
import { parsePullUrl, type Snapshot } from '../src/domain.js'
import { fixture, url } from './automation-db.fixture.js'

test('Assistant observation uses the saved publication policy, checks the head and recovers a lost GitHub response', { skip: !url }, async t => {
  const f = await fixture(t)
  const reviews = new Reviews(f.db.getRepository(Review), {} as PluginContext, f.repositories, f.capabilities)
  const automation = f.automation(reviews)
  const head = 'a'.repeat(40), summary = 'Found a pagination regression'
  const snapshot: Snapshot = { title: 'Pages', body: '', url: 'https://github.com/fixture/repo/pull/1', state: 'open', author: 'tester',
    baseSha: 'b'.repeat(40), headSha: head, fetchedAt: new Date().toISOString(), comments: [], checks: [], warnings: [],
    files: [{ filename: 'pages.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -2,1 +2,1 @@\n-old\n+new' }] }
  const finding = { priority: 'P2' as const, path: 'pages.ts', side: 'RIGHT' as const, line: 2, title: 'Drops last page', body: 'The final page is empty.' }
  let state = 'open', sha = head, visible = true, loseResponse = false, posts = 0, reviewBody = ''
  const receipt = { id: 7, html_url: snapshot.url + '#pullrequestreview-7', state: 'COMMENTED' }
  const github = new GitHub('fixture', async (request, init) => {
    const path = new URL(String(request)).pathname
    if (init?.method === 'POST') {
      assert.equal(path, '/repos/fixture/repo/pulls/1/reviews')
      const payload = JSON.parse(String(init.body))
      assert.equal(payload.event, 'COMMENT')
      assert.equal(payload.commit_id, head)
      assert.equal(payload.comments.length, 1)
      assert.match(payload.comments[0].body, /P2/)
      assert.match(payload.body, /Found a pagination regression/)
      reviewBody = payload.body
      posts++
      if (loseResponse) throw new Error('connection closed after acceptance')
      return Response.json(receipt)
    }
    if (path === '/user') return Response.json({ id: 12 })
    if (path.endsWith('/reviews')) return Response.json(visible ? [{ ...receipt, user: { id: 12 }, body: reviewBody, commit_id: head }] : [])
    return Response.json({ state, draft: false, head: { sha }, base: { ref: 'main' }, user: { type: 'User' } })
  })
  f.repositories.github = async () => github
  f.repositories.manage = async () => ({ canRead: true, canManage: true, organizationName: 'fixture' })
  f.repositories.get = async (_scope, id) => f.records.findOneByOrFail({ id })
  const scope = { ...f.p, userId: f.p.executionUserId! }
  const start = async (publication?: PublicationMode, trigger = 'opened') => {
    const settings = { ...defaultPolicy, enabled: true, ...(publication ? { publication } : {}) }
    await f.records.update(f.p.id, { settings, confirmedAt: new Date() })
    const run = await f.addRun()
    await f.runs.update(run.id, { settings, trigger, pipelineInstanceId: null, pipelineRoundId: null })
    await f.db.getRepository(Review).save({ id: run.reviewId!, tenantId: scope.tenantId, organizationId: scope.organizationId,
      userId: scope.userId, assistantId: scope.assistantId, automationPolicyId: f.p.id, automationRunId: run.id,
      access: 'connected', status: 'reviewed', ref: parsePullUrl(snapshot.url), snapshot, findings: [finding], summary, viewed: [], instructions: '' })
    return run.id
  }
  const observe = async (id: string) => {
    await automation.processStep(await f.stepFor(id), f.context)
    return f.runs.findOneByOrFail({ id })
  }
  for (const mode of [undefined, 'store'] as const) assert.equal((await observe(await start(mode))).status, 'completed')
  assert.equal((await observe(await start('comment', 'trial'))).status, 'completed')
  const gated = await start('confirm')
  assert.equal((await observe(gated)).status, 'awaiting_confirmation')
  assert.equal(posts, 0)
  await automation.confirm(scope, gated)
  assert.equal((await observe(gated)).status, 'published')
  assert.equal(posts, 1)

  const automatic = await start('comment')
  loseResponse = true
  visible = false
  assert.equal((await observe(automatic)).status, 'publishing')
  assert.equal((await observe(automatic)).status, 'publishing')
  visible = true
  const recovered = await observe(automatic)
  assert.deepEqual([recovered.status, recovered.publicationUrl], ['published', receipt.html_url])
  assert.equal(posts, 2)

  state = 'closed'
  assert.equal((await observe(await start('comment'))).status, 'skipped')
  state = 'open'
  sha = 'c'.repeat(40)
  assert.equal((await observe(await start('comment'))).status, 'superseded')
  sha = head
  const paused = await start('comment')
  await f.records.update(f.p.id, { executionRevision: 2 })
  assert.equal((await observe(paused)).status, 'cancelled')
  assert.equal(posts, 2)
})
