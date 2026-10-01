import assert from 'node:assert/strict'
import { test } from 'node:test'
import { latestRequest, refreshSelectedPlan } from '../src/ui/request-state.js'
import type { Plan } from '../src/ui/model.js'

const plan = (id: string, revision = 1): Plan => ({
  id, revision, kind: 'plan', status: 'awaiting_approval', title: id, updatedAt: '',
  payload: { target: { dataSourceId: 'source' }, reason: 'test', action: 'sql', policyRevision: 1, digest: '', expiresAt: '' },
})
test('polling or approving A cannot replace B or reopen a closed detail', () => {
  const a = plan('a'), b = plan('b')
  assert.equal(refreshSelectedPlan(b, a), b)
  assert.equal(refreshSelectedPlan(null, a), null)
  assert.equal(refreshSelectedPlan(a, plan('a', 0)), a)
  const updated = plan('a', 2)
  assert.equal(refreshSelectedPlan(a, updated), updated)
})
test('search, pagination and navigation only accept the latest request in their channel', async () => {
  const requests = latestRequest()
  const first = requests.begin(), second = requests.begin()
  let visible = ''
  const receive = async (request: number, name: string) => {
    await Promise.resolve()
    if (requests.isCurrent(request)) visible = name
  }
  await receive(second, 'second search')
  await receive(first, 'first search')
  assert.equal(visible, 'second search')
  requests.begin()
  await receive(second, 'old page')
  assert.equal(visible, 'second search')
})
