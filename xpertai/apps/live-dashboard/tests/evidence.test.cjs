require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID, createHash } = require('node:crypto')
const { ForbiddenException } = require('@nestjs/common')
const { analysisEvidenceDigestInput } = require('@xpert-ai/plugin-sdk/analytics')
const { AnalysisEvidenceService, evidenceDataDigest } = require('../dist/lib/evidence/evidence.service')
const dataset = () => ({ schema: 'xpert.analytics.dataset', datasetId: 'sales',
  fields: [{ id: 'amount', sourceField: 'amount', label: 'Revenue', logicalType: 'float64', nullable: false, role: 'measure', unit: 'CNY' }],
  rows: [{ amount: 3500 }], grain: [], completeness: { returnedRows: 1, totalRows: 1, totalAccuracy: 'exact', scope: 'full_query_result', truncated: false },
  freshness: { executedAt: '2026-11-12T00:00:00.000Z', sourceFetchedAt: '2026-11-12T00:00:00.000Z' }, provenance: { executionId: 'run', bindingId: 'sales', providerId: 'file.table' } })
function fixture() {
  const context = { tenantId: 'tenant', organizationId: 'org', userId: randomUUID(), hostType: 'project', hostId: randomUUID(), slots: [] }
  const input = { requestId: randomUUID(), artifactId: randomUUID(), versionId: randomUUID(), title: 'Revenue', controls: {} }
  const state = { datasets: [dataset()], revoked: false, writes: 0 }, rows = [], artifacts = [], drafts = new Map()
  const records = { findOneBy: async where => rows.find(row => Object.entries(where).every(([key, value]) => row[key] === value)),
    findOneByOrFail: async where => { const row = await records.findOneBy(where); assert.ok(row); return row },
    createQueryBuilder: () => { let row; const builder = { insert: () => builder, values: value => { row = value; return builder }, orIgnore: () => builder,
      execute: async () => { if (!rows.some(existing => existing.requestId === row.requestId)) rows.push(row) } }; return builder },
    update: async (where, patch) => Object.assign(await records.findOneByOrFail(where), patch) }
  const dashboards = { authorizeProject: async () => { if (state.revoked) throw new ForbiddenException('REVOKED') },
    open: async () => ({ isDraft: false, versionId: input.versionId, manifest: { controls: [], bindings: [] } }),
    query: async () => { if (state.revoked) throw new ForbiddenException('REVOKED'); return { datasets: structuredClone(state.datasets), failures: [] } } }
  const capabilities = {
    'platform.artifacts': { findArtifactBySource: async source => artifacts.find(item => item.resourceId === source.resourceId),
      createArtifact: async input => { const artifact = { id: randomUUID(), ...input.source }; artifacts.push(artifact); return artifact } },
    'platform.artifact-drafts': { get: async id => drafts.get(id), save: async draft => { drafts.set(draft.artifactId, draft); return draft } },
    'platform.artifact-content': { write: async () => { state.writes++; return { filePath: 'evidence' } } }
  }
  const service = new AnalysisEvidenceService(records, dashboards, { require: key => capabilities[key.id] })
  return { context, input, state, rows, service }
}
test('capture retries keep original bytes and reject request reuse with different parameters', async () => {
  const f = fixture(), first = await f.service.capture(f.context, f.input), bytes = JSON.stringify(f.rows[0].snapshot)
  const second = await f.service.capture(f.context, f.input)
  assert.deepEqual(second, first); assert.equal(JSON.stringify(f.rows[0].snapshot), bytes); assert.equal(f.state.writes, 1)
  await assert.rejects(f.service.capture(f.context, { ...f.input, title: 'Changed' }), /REQUEST_CONFLICT/)
  await assert.rejects(f.service.authorize(f.context, first.id, true), /IMMUTABLE/)
})
test('fresh authorization blocks revoked, cross-project, changed rows and corrupted persisted snapshots', async () => {
  const f = fixture(), first = await f.service.capture(f.context, f.input)
  await assert.rejects(f.service.read({ ...f.context, hostId: randomUUID() }, first.id), /UNAVAILABLE/)
  f.state.revoked = true; await assert.rejects(f.service.read(f.context, first.id), /REVOKED/); f.state.revoked = false
  f.state.datasets[0].rows[0].amount = 9999; await assert.rejects(f.service.read(f.context, first.id), /SOURCE_CHANGED/)
  f.state.datasets[0].rows[0].amount = 3500; f.rows[0].snapshot.title = 'Tampered'
  await assert.rejects(f.service.read(f.context, first.id), /INTEGRITY_FAILED/)
})
test('source updates require a new snapshot and leave the original immutable', async () => {
  const f = fixture(), first = await f.service.capture(f.context, f.input), old = structuredClone(f.rows[0].snapshot)
  f.state.datasets[0].rows[0].amount = 4000
  await assert.rejects(f.service.capture(f.context, f.input), /SOURCE_CHANGED/)
  const second = await f.service.capture(f.context, { ...f.input, requestId: randomUUID() })
  assert.notEqual(second.id, first.id); assert.deepEqual(f.rows[0].snapshot, old)
  assert.equal(f.rows[1].snapshot.datasets[0].rows[0].amount, 4000)
  assert.equal(createHash('sha256').update(analysisEvidenceDigestInput(old)).digest('hex'), old.sha256)
})
test('comparison ignores execution clocks but preserves business cutoff and source version', () => {
  const before = dataset(), after = structuredClone(before)
  after.provenance.executionId = 'next'; after.freshness.executedAt = '2026-11-13T00:00:00.000Z'
  assert.equal(evidenceDataDigest([before]), evidenceDataDigest([after]))
  after.freshness.dataAsOf = '2026-11-13'; assert.notEqual(evidenceDataDigest([before]), evidenceDataDigest([after]))
})
test('refresh captures currently authorized rows without disclosing old rows or modifying previous bytes', async () => {
  const f = fixture(), first = await f.service.capture(f.context, f.input), old = structuredClone(f.rows[0].snapshot)
  f.state.datasets[0].rows[0].amount = 1234
  const requestId = randomUUID(), next = await f.service.refresh(f.context, first.id, requestId, 'Updated')
  assert.notEqual(next.id, first.id); assert.equal(next.previousId, first.id); assert.equal('snapshot' in next, false)
  assert.deepEqual(f.rows[0].snapshot, old); assert.equal(f.rows[1].snapshot.datasets[0].rows[0].amount, 1234)
  assert.deepEqual(await f.service.refresh(f.context, first.id, requestId, 'Updated'), next)
  await assert.rejects(f.service.refresh({...f.context,userId:randomUUID()},first.id,requestId,'Updated'),/REQUEST_CONFLICT/)
  f.state.revoked = true; await assert.rejects(f.service.refresh(f.context, first.id, randomUUID(), 'Denied'), /REVOKED/)
  assert.equal(f.rows.length, 2)
})
test('bounded positional comparisons preserve exact scalar differences and identify structure changes', () => {
  const { compareEvidence } = require('../dist/lib/evidence/evidence-diff')
  const before = { id: 'old', datasets: [dataset()] }, after = structuredClone(before); after.id = 'new'
  after.datasets[0].rows[0].amount = '9007199254740993.0001'
  let diff = compareEvidence(before, after)
  assert.equal(diff.changedCells, 1); assert.equal(diff.changes[0].after, '9007199254740993.0001')
  after.datasets[0].rows = Array.from({length:100},()=>({amount: 'a'.repeat(400)}))
  after.datasets[0].fields[0].unit = 'USD'; diff = compareEvidence(before,after)
  assert.equal(diff.changes.length,50);assert.equal(diff.changedCells,100);assert.equal(diff.changedDatasets,1);assert.equal(diff.changes[0].after.length,300);assert.equal(diff.truncated,true)
})
