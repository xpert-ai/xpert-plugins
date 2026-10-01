import assert from 'node:assert/strict'
import { test } from 'node:test'
import { policyInput } from '../src/lib/policy-input.js'
import { policySchema } from '../src/lib/types.js'

test('an existing policy can be edited repeatedly without resubmitting ORM fields', () => {
  const stored = {
    id: 'policy', tenantId: 'tenant', organizationId: 'org', workspaceId: 'workspace',
    dataSourceId: 'old-source', updatedBy: 'actor', updatedAt: '2026-09-17',
    revision: 1, readOnly: false, autoActions: [], objects: [],
  }
  assert.equal(policySchema.safeParse({ ...stored, readOnly: true }).success, false)
  const first = policySchema.parse(policyInput('source', { ...stored, readOnly: true }))
  assert.equal(first.dataSourceId, 'source')
  assert.equal(first.readOnly, true)
  const second = policySchema.parse(policyInput('source', { ...stored, ...first, revision: 2, readOnly: false }))
  assert.equal(second.revision, 2)
  assert.equal(second.readOnly, false)
  assert.deepEqual(Object.keys(second).sort(), ['autoActions', 'dataSourceId', 'objects', 'readOnly', 'revision'])
})
