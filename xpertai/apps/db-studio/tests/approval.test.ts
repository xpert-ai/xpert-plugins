import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approvalDetails } from '../src/lib/approval.js'
import type { PlanPayload } from '../src/lib/types.js'

const plan: PlanPayload = {
  action: 'sql', target: { dataSourceId: 'source', database: 'analytics' },
  sql: 'UPDATE orders SET amount = ? WHERE id = ?', parameters: ['12.3456', 42],
  reason: 'Correct amount', policyRevision: 1, digest: 'digest', expiresAt: '2999-01-01T00:00:00Z',
}
test('approval details retain exact SQL and ordered parameter values', () => {
  const details = approvalDetails(plan)
  assert.equal(details.sql, plan.sql)
  assert.deepEqual(details.parameters, ['12.3456', 42])
  assert.deepEqual(details.target, plan.target)
  assert.equal(details.digest, plan.digest)
})
test('import approvals expose the table, columns, row count and bounded preview', () => {
  const details = approvalDetails({ ...plan, sql: undefined, parameters: undefined, action: 'import', transfer: {
    dataSourceId: 'source', database: 'analytics', table: 'orders', columns: ['id', 'amount'],
    rows: Array.from({ length: 12 }, (_, i) => [i, String(i)]), operationId: 'operation',
  } })
  assert.equal(details.import?.table, 'orders')
  assert.deepEqual(details.import?.columns, ['id', 'amount'])
  assert.equal(details.import?.rowCount, 12)
  assert.equal(details.import?.previewRows.length, 5)
  assert.equal(details.import?.previewTruncated, true)
})
test('approval SQL is never silently truncated before the mutation target or predicate', () => {
  const sql = `UPDATE orders SET note = '${'x'.repeat(5000)}' WHERE id = 42`
  assert.equal(approvalDetails({ ...plan, sql }).sql, sql)
})
