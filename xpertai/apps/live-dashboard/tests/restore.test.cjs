const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { setup } = require('./service-fixture.cjs')
const example = require('../examples/postgres-sales.json')

async function history() {
  const s = setup()
  const draft = await s.service.save(s.context, example, null)
  const v1 = await s.service.publish(s.context, draft.artifactId, draft.draftRevision, null)
  const next = await s.service.update(s.context, draft.artifactId, draft.draftRevision, { title: 'Second version' }, v1.versionId)
  const v2 = await s.service.publish(s.context, draft.artifactId, next.draftRevision, v1.versionId)
  return { s, v1, v2, next }
}

test('restoring validates a historical definition into the same draft without publishing or changing shares', async () => {
  const { s, v1, v2, next } = await history()
  await s.sharing.share(s.context, { artifactId: v2.artifactId, versionMode: 'latest' })
  const share = structuredClone(s.links.get(v2.artifactId))
  const result = await s.service.restore(s.context, v2.artifactId, v1.versionId, next.draftRevision, v2.versionId)
  assert.equal(result.artifactId, v2.artifactId)
  assert.equal(result.draftRevision, next.draftRevision + 1)
  assert.equal((await s.service.open(s.context, v2.artifactId)).manifest.title, example.title)
  assert.equal(s.artifacts.get(v2.artifactId).currentVersionId, v2.versionId)
  assert.equal(s.versions.length, 2)
  assert.deepEqual(s.links.get(v2.artifactId), share)
})

test('restore rejects stale heads, foreign versions and revoked data sources without changing the draft', async () => {
  const { s, v1, v2, next } = await history()
  const before = structuredClone(s.drafts.get(v2.artifactId))
  await assert.rejects(s.service.restore(s.context, v2.artifactId, v1.versionId, 0, v2.versionId), /CONFLICT/)
  await assert.rejects(s.service.restore(s.context, v2.artifactId, v1.versionId, next.draftRevision, v1.versionId), /CONFLICT/)
  await assert.rejects(s.service.restore(s.context, v2.artifactId, randomUUID(), next.draftRevision, v2.versionId))
  s.calls.denied = true
  await assert.rejects(s.service.restore(s.context, v2.artifactId, v1.versionId, next.draftRevision, v2.versionId))
  assert.deepEqual(s.drafts.get(v2.artifactId), before)
})
