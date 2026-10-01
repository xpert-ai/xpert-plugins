import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approvalDisplay } from '../src/lib/approval.js'
import type { PlanPayload } from '../src/lib/types.js'
const plan: PlanPayload = { target: { dataSourceId: 'source', database: 'demo' }, action: 'sql', reason: 'change', sql: 'UPDATE users SET name = ? WHERE id = ?', parameters: ['Alice', 1], digest: 'digest', policyRevision: 1, expiresAt: '2030-01-01T00:00:00.000Z' }
test('plugin provides bilingual SQL display without modifying the frozen plan', () => {
 const before = structuredClone(plan)
 const display = approvalDisplay(plan)
 assert.equal(display.title.zh_Hans, '数据库操作确认')
 assert.ok(display.sections.some(s => s.type === 'code' && s.code === plan.sql))
 assert.ok(display.sections.some(s => s.type === 'code' && s.code === '["Alice",1]'))
 assert.deepEqual(plan, before)
 assert.ok(!display.sections.some(s => ['目标库', '目标表'].includes(s.label.zh_Hans)))
})
test('plugin supplies exact import count and limits only the preview', () => {
 const rows = Array.from({length: 8}, (_, i) => [i])
 const display = approvalDisplay({ ...plan, sql: undefined, parameters: undefined, action: 'import', transfer: { dataSourceId: 'source', table: 'users', columns: ['id'], rows, operationId: 'operation' } })
 assert.ok(display.sections.some(s => s.type === 'text' && s.text.zh_Hans === '将导入 8 行数据'))
 const table = display.sections.find(s => s.type === 'table')
 assert.equal(table?.rows.length, 5)
 assert.equal(rows.length, 8)
})
