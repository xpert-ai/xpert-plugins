const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { dataViewFixture } = require('./data-view-fixture.cjs')
const { templateCreateSchema } = require('../dist/lib/template.schema')
const { templateManifest } = require('../dist/lib/template.service')

async function setup() {
  const f = dataViewFixture()
  const dataset = await f.library.save(f.context, { definition: f.definition, expectedRevision: 0 })
  const input = { datasetId: dataset.artifactId, datasetRevision: dataset.revision, id: randomUUID(),
    title: 'Generated dashboard', template: 'comparison', theme: 'contrast', x: 'region', y: 'amount' }
  const create = (value = input, context = f.context) => f.provider.executeViewAction(context, 'data', 'template-create', { input: value })
  return { ...f, dataset, input, create }
}

test('View action creates a validated draft with copied bindings and does not publish', async () => {
  const f = await setup()
  assert.ok(f.provider.getViewManifests(f.context, 'agent.workbench')[0].actions.some(action => action.key === 'template-create'))
  const queries = f.calls.queries.length
  const result = await f.create()
  assert.equal(result.success, true)
  assert.equal(result.data.status, 'draft')
  assert.equal(result.data.draftRevision, 1)
  const opened = await f.service.open(f.context, result.data.artifactId)
  assert.equal(opened.manifest.visualTheme, 'contrast')
  assert.equal(opened.manifest.charts[0].type, 'bar')
  assert.deepEqual(opened.manifest.bindings, [f.definition.binding])
  assert.ok(f.calls.queries.length > queries)
  assert.equal(f.versions.length, 0)
  assert.equal((await f.library.open(f.context, f.dataset.artifactId)).revision, 1)
})

test('generation checks source dataset revision before running queries or creating artifacts', async () => {
  const f = await setup()
  await f.library.save(f.context, { definition: { ...f.definition, name: 'Updated dataset' }, expectedRevision: 1 })
  const queries = f.calls.queries.length
  await assert.rejects(f.create(), /DATASET_CONFLICT/)
  assert.equal(f.calls.queries.length, queries)
  assert.equal(f.artifacts.size, 1)
})

test('strict input and mapping checks reject source overrides, missing fields and extra grain', async () => {
  const f = await setup()
  for (const override of [{ actor: { userId: 'other' } }, { source: f.definition.binding.source }, { payload: {} }, { html: '<html></html>' }]) {
    assert.equal(templateCreateSchema.safeParse({ ...f.input, ...override }).success, false)
    await assert.rejects(f.create({ ...f.input, ...override }), /Unrecognized/)
  }
  await assert.rejects(f.create({ ...f.input, y: 'region' }), /FIELDS_REQUIRED/)
  await assert.rejects(f.create({ ...f.input, x: 'missing' }), /FIELDS_REQUIRED/)
  await assert.rejects(f.create({ ...f.input, x: undefined }), /FIELDS_REQUIRED/)
  const extraGrain = { ...f.definition, binding: { ...f.definition.binding, output: { ...f.definition.binding.output, grain: ['region', 'amount'] } } }
  assert.throws(() => templateManifest(extraGrain, f.input), /grain/)
  assert.equal(f.artifacts.size, 1)
})

test('source revocation prevents generation before durable dashboard writes', async () => {
  const f = await setup()
  const files = f.files.size
  f.calls.denied = true
  await assert.rejects(f.create())
  assert.equal(f.artifacts.size, 1)
  assert.equal(f.drafts.size, 1)
  assert.equal(f.files.size, files)
})

test('generation preserves actor scope and rejects read-only callers', async () => {
  const f = await setup()
  for (const key of ['tenantId', 'organizationId', 'userId', 'hostId']) {
    await assert.rejects(f.create(f.input, { ...f.context, [key]: 'other' }), /DENIED/)
  }
  f.service.access = async () => ({ canEdit: false })
  await assert.rejects(f.create(), /DEFINITION_ACCESS_DENIED/)
  assert.equal(f.artifacts.size, 1)
})

test('an existing dashboard is protected by its draft revision', async () => {
  const f = await setup(), first = await f.create()
  await assert.rejects(f.create({ ...f.input, title: 'Unexpected replacement' }), /CONFLICT/)
  const opened = await f.service.open(f.context, first.data.artifactId)
  assert.equal(opened.manifest.title, f.input.title)
  assert.equal(opened.draftRevision, 1)
  assert.equal(f.artifacts.size, 2)
})

test('dataset default overrides reach both binding parameters and controls without mutation', async () => {
  const f = await setup()
  const definition = { ...f.definition, controls: { region: 'east' } }, before = structuredClone(definition)
  const manifest = templateManifest(definition, f.input)
  assert.equal(manifest.controls[0].defaultValue, 'east')
  assert.equal(manifest.bindings[0].parameters[0].defaultValue, 'east')
  assert.deepEqual(definition, before)
  const nullable = { ...definition, binding: { ...definition.binding, parameters: definition.binding.parameters.map(parameter => ({ ...parameter, required: false, allowedValues: undefined })) }, controls: { region: null } }
  assert.equal(templateManifest(nullable, f.input).controls[0].defaultValue, null)
})

test('standard presets assemble charts or a details table and reuse the canonical theme contract', async () => {
  const f = await setup()
  for (const [preset, type] of [['comparison', 'bar'], ['trend', 'line'], ['bar', 'bar'], ['line', 'line'], ['area', 'area'], ['pie', 'pie']]) {
    const manifest = templateManifest(f.definition, { ...f.input, template: preset })
    assert.equal(manifest.charts[0].type, type)
    assert.equal(manifest.tables.length, 1)
  }
  const details = templateManifest(f.definition, { ...f.input, template: 'details', x: undefined, y: undefined })
  assert.equal(details.charts.length, 0)
  assert.deepEqual(details.tables[0].fields, ['region', 'amount'])
  assert.equal(templateCreateSchema.safeParse({ ...f.input, theme: 'unknown' }).success, false)
})

test('recycling the dataset keeps the generated dashboard independently queryable', async () => {
  const f = await setup(), created = await f.create()
  await f.library.remove(f.context, f.dataset.artifactId, 1)
  await assert.rejects(f.library.open(f.context, f.dataset.artifactId), /DENIED/)
  const queried = await f.service.query(f.context, created.data.artifactId, undefined, { region: 'all' })
  assert.equal(queried.datasets[0].rows.length, 2)
  assert.equal((await f.service.open(f.context, created.data.artifactId)).manifest.bindings[0].providerId, f.definition.binding.providerId)
})
