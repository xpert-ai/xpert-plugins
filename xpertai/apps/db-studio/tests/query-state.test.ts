import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginQuery, receiveQuery, endQuery, retargetDraft } from '../src/ui/query-state.js'
import { blank, newDraft, type Run } from '../src/ui/model.js'

const result = (source: string, id: string): Run => ({
  input: { dataSourceId: source, sql: 'SELECT 1', limit: 100, offset: 0 },
  receipt: { executionId: id, dataSourceId: source, result: { ...blank, rows: [[source]] } },
})
test('a delayed result belongs to its original tab and leaves the other tab untouched', () => {
  const a = newDraft({ dataSourceId: 'a' }), b = newDraft({ dataSourceId: 'b' })
  let drafts = beginQuery([a, b], a.key, 'request-a')
  drafts = receiveQuery(drafts, a.key, 'request-a', 'query', result('a', 'request-a'))
  assert.equal(drafts[0].run?.receipt.dataSourceId, 'a')
  assert.equal(drafts[1].run, undefined)
  assert.equal(drafts[1].runningId, undefined)
})
test('switching a tab connection invalidates pending results even when switching back', () => {
  const a = newDraft({ dataSourceId: 'a' })
  let drafts = beginQuery([a], a.key, 'old')
  drafts = drafts.map((draft) => retargetDraft(retargetDraft(draft, { dataSourceId: 'b' }), { dataSourceId: 'a' }))
  drafts = receiveQuery(drafts, a.key, 'old', 'query', result('a', 'old'))
  assert.equal(drafts[0].run, undefined)
})
test('superseded requests and closed tabs ignore late successes and failures', () => {
  const a = newDraft({ dataSourceId: 'a' })
  let drafts = beginQuery(beginQuery([a], a.key, 'old'), a.key, 'new')
  drafts = receiveQuery(drafts, a.key, 'new', 'query', result('a', 'new'))
  drafts = receiveQuery(drafts, a.key, 'old', 'query', result('a', 'old'))
  drafts = endQuery(drafts, a.key, 'old', 'old failure')
  assert.equal(drafts[0].run?.receipt.executionId, 'new')
  assert.equal(drafts[0].runningId, 'new')
  assert.equal(drafts[0].queryError, undefined)
  assert.deepEqual(receiveQuery([], a.key, 'old', 'query', result('a', 'old')), [])
})
test('query and explain results remain independent and clear on target changes', () => {
  const a = newDraft({ dataSourceId: 'a' })
  let drafts = receiveQuery(beginQuery([a], a.key, 'q'), a.key, 'q', 'query', result('a', 'q'))
  drafts = receiveQuery(beginQuery(drafts, a.key, 'e'), a.key, 'e', 'explain', result('a', 'e'))
  assert.equal(drafts[0].run?.receipt.executionId, 'q')
  assert.equal(drafts[0].explainRun?.receipt.executionId, 'e')
  const moved = retargetDraft(drafts[0], { dataSourceId: 'a', database: 'other' })
  assert.equal(moved.run, undefined)
  assert.equal(moved.explainRun, undefined)
  assert.equal(moved.runningId, undefined)
})
test('later script statements cannot reclaim a retargeted or superseded tab', () => {
  const a = newDraft({ dataSourceId: 'a' })
  const old = beginQuery([a], a.key, 'statement-1')
  const moved = old.map((draft) => retargetDraft(draft, { dataSourceId: 'b' }))
  const continued = beginQuery(moved, a.key, 'statement-2', 'statement-1')
  assert.equal(continued[0].runningId, undefined)
  assert.equal(receiveQuery(continued, a.key, 'statement-2', 'query', result('a', 'statement-2'))[0].run, undefined)
  const newer = beginQuery(old, a.key, 'new-query')
  assert.equal(beginQuery(newer, a.key, 'statement-2', 'statement-1')[0].runningId, 'new-query')
})
