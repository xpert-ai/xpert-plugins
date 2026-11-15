const { test } = require('node:test')
const assert = require('node:assert/strict')
const { certificationSchema } = require('../dist/lib/certification.schema.js')
const { dashboardSchema } = require('../dist/lib/dashboard.schema.js')
const example = require('../examples/postgres-sales.json')

test('approval is a typed source response, never authored dashboard metadata', () => {
  const proof = { kind: 'business_metric', status: 'verified', subjectId: 'metric', definitionHash: 'a'.repeat(64),
    dependency: { id: 'model', version: 3 }, certifiedBy: 'approver', certifiedAt: '2026-11-12T00:00:00Z', verifiedAt: '2026-11-12T01:00:00Z' }
  assert.deepEqual(certificationSchema.parse(proof), proof)
  assert.equal(certificationSchema.safeParse({ ...proof, definitionHash: 'display-label' }).success, false)
  assert.equal(certificationSchema.safeParse({ ...proof, kind: 'query_succeeded' }).success, false)
  assert.equal(dashboardSchema.safeParse({ ...example, certification: proof }).success, false)
  assert.equal(certificationSchema.safeParse({ kind: 'business_metric', status: 'legacy_unverified', subjectId: 'metric', verifiedAt: proof.verifiedAt }).success, true)
})
