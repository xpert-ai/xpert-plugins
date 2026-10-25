import { GitHub } from '../src/github.js'
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { parsePullUrl, diffLines, validateFindings, type Snapshot, type Scope } from '../src/domain.js'
import { Reviews, submitSchema } from '../src/backend.js'
import { Review } from '../src/entity.js'
import type { Repositories } from '../src/repositories.js'
import type { Repository } from 'typeorm'
import { DefaultRuntimeCapabilityRegistry, type PluginContext } from '@xpert-ai/plugin-sdk'
const id = randomUUID(), executionId = randomUUID(), sha = 'a'.repeat(40)
const scope: Scope = { tenantId: 't', organizationId: 'o', userId: 'u', assistantId: 'a' }
const snapshot: Snapshot = { title: 'Fixture', body: '', url: 'https://github.com/a/b/pull/1', state: 'open', author: 'tester', baseSha: 'b'.repeat(40), headSha: sha, fetchedAt: new Date().toISOString(), comments: [], checks: [], warnings: [], files: [{ filename: 'app.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -2,2 +2,2 @@\n-old\n+new\n context' }] }
const finding = { title: 'Regression', body: 'Reproducible consequence', priority: 'P2' as const, path: 'app.ts', side: 'RIGHT' as const, line: 2 }
function fixture(status: Review['status'] = 'reviewed') {
  let row = Object.assign(new Review(), { ...scope, id, executionId, snapshot, revision: 1, status, findings: [finding], ref: parsePullUrl(snapshot.url), viewed: [], summary: 'A finding', access: 'public' as const })
  const repository = { findOneBy: async (where: Record<string, unknown>) => Object.entries(where).every(([k,v]) => Reflect.get(row,k) === v) ? structuredClone(row) : null,
    update: async (where: Record<string, unknown>, patch: Partial<Review>) => { if (!Object.entries(where).every(([k,v]) => Reflect.get(row,k) === v)) return { affected: 0 }; row = Object.assign(row, patch); return { affected: 1 } } } as unknown as Repository<Review>
  const service = new Reviews(repository, {} as PluginContext, {} as Repositories, new DefaultRuntimeCapabilityRegistry())
  return { service, read: () => row }
}
test('PR URL is pinned to HTTPS GitHub and forbids credential forwarding', () => {
  assert.equal(parsePullUrl(snapshot.url).number, 1)
  for (const url of ['http://github.com/a/b/pull/1', 'https://github.com.evil/a/b/pull/1', 'https://user:pass@github.com/a/b/pull/1', 'https://github.com:444/a/b/pull/1', 'https://github.com/a/b/issues/1']) assert.throws(() => parsePullUrl(url))
})
test('findings require the correct diff side and existing line', () => {
  assert.deepEqual(diffLines(snapshot.files[0].patch!)[1], { left: 2, right: null, text: '-old', kind: 'removed' })
  validateFindings(snapshot, [finding]); assert.throws(() => validateFindings(snapshot, [{ ...finding, line: 999 }]), /finding_outside_diff/)
  assert.throws(() => validateFindings(snapshot, [{ ...finding, path: 'secret.ts' }]), /finding_outside_diff/)
})
test('read context is scoped and immutable; completion is bound to the dispatched execution', async () => {
  const f = fixture('running'), config = { configurable: { executionId, context: { codeReview: { reviewId: id, headSha: sha } } } }
  await assert.rejects(f.service.get({ ...scope, userId: 'other' }, id), /review_not_found/)
  await assert.rejects(f.service.evidence(scope, { configurable: { context: { codeReview: { reviewId: id, headSha: 'c'.repeat(40) } } } }), /stale_revision/)
  await assert.rejects(f.service.complete(scope, { configurable: { ...config.configurable, executionId: randomUUID() } }, { summary: 'bad', findings: [] }), /task_binding_mismatch/)
  await f.service.complete(scope, config, { summary: 'done', findings: [finding] })
  assert.equal(f.read().status, 'reviewed')
  assert.equal((await f.service.evidence(scope, config)).summary, 'done')
  await assert.rejects(f.service.complete(scope, config, { summary: 'repeat', findings: [] }), /task_binding_mismatch/)
})
test('submission requires explicit confirmation and does not post stale commits', async () => {
  const f = fixture(), input = { id, revision: 1, headSha: sha, confirmed: true as const, event: 'COMMENT' as const, body: 'Review', findings: [0] }
  assert.throws(() => submitSchema.parse({ ...input, confirmed: false }))
  let writes = 0
  f.service.github = async () => ({ head: async () => 'c'.repeat(40), submit: async () => { writes++; return { html_url: '' } } }) as Awaited<ReturnType<Reviews['github']>>
  await assert.rejects(f.service.submit(scope, input), /stale_revision/)
  assert.equal(writes, 0); assert.equal(f.read().status, 'reviewed')
})
test('uncertain external submission is frozen against duplicate retries', async () => {
  const f = fixture(), input = { id, revision: 1, headSha: sha, confirmed: true as const, event: 'COMMENT' as const, body: 'Review', findings: [0] }
  let writes = 0
  f.service.github = async () => ({ head: async () => sha, submit: async () => { writes++; throw new Error('connection lost after write') } }) as Awaited<ReturnType<Reviews['github']>>
  await assert.rejects(f.service.submit(scope, input)); assert.equal(f.read().status, 'submission_unknown')
  await assert.rejects(f.service.submit(scope, { ...input, revision: f.read().revision }), /review_not_submittable/)
  await assert.rejects(f.service.mark(scope, id, f.read().revision, { pinned: true }), /review_busy/)
  assert.equal(writes, 1)
})


test('GitHub App publication resolves its bot identity without a personal /user endpoint', async () => {
  const paths: string[] = []
  const github = new GitHub('fixture-installation', async url => {
    paths.push(String(url)); return Response.json({ id: 42 })
  }, 'review-app[bot]')
  assert.equal(await github.identity(), '42')
  assert.deepEqual(paths, ['https://api.github.com/users/review-app%5Bbot%5D'])
})
