import test from 'node:test'
import assert from 'node:assert/strict'
import { snapshotTarget, canCompareSnapshots } from '../src/ui/snapshot-selection.js'
import type { SavedRecord } from '../src/ui/model.js'

const record = (id: string, target: object): SavedRecord => ({
  id, kind: 'snapshot', title: id, status: 'saved', updatedAt: '', revision: 1,
  payload: {}, summary: { target },
})
test('snapshot comparison requires different snapshots of the same source and namespace', () => {
  const a = record('a', { dataSourceId: 'one', database: 'db', schema: 'public' })
  const b = record('b', { dataSourceId: 'one', database: 'db', schema: 'public', sessionId: '11111111-1111-4111-8111-111111111111' })
  assert.equal(canCompareSnapshots(a, b), true)
  assert.equal(canCompareSnapshots(a, a), false)
  assert.equal(canCompareSnapshots(a, record('c', { dataSourceId: 'two', database: 'db', schema: 'public' })), false)
  assert.equal(canCompareSnapshots(a, record('c', { dataSourceId: 'one', database: 'db', schema: 'other' })), false)
  assert.equal(canCompareSnapshots(a, record('c', { dataSourceId: 'one', database: 'other', schema: 'public' })), false)
  assert.equal(canCompareSnapshots(a, record('c', { dataSourceId: 'one', database: 'db', schema: 'public', engineCatalog: 'other' })), false)
})
test('missing or malformed snapshot targets cannot be inferred from titles or objects', () => {
  assert.equal(snapshotTarget(record('a', {})), null)
  assert.equal(snapshotTarget({ ...record('a', { dataSourceId: 'one' }), kind: 'chart' }), null)
  assert.equal(canCompareSnapshots(undefined, record('a', { dataSourceId: 'one' })), false)
})
