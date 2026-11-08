const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { parse } = require('parse5')
const { graph } = require('./library-v2-fixture.cjs')
const { compileTemplate, TEMPLATE_CONTEXT_ID } = require('../dist/lib/library/template-compiler.js')
const { encodePackage, decodePackage, reference } = require('../dist/lib/library/archive.js')
const { LibraryExecutionResolution } = require('../dist/lib/library/execution-resolution.js')
const { buildExecutionPackage } = require('./library-execution-package.cjs')
const source = require('../examples/postgres-sales.json').bindings[0].source

function compilation() {
  const { template } = graph(), mapping = { month: 'period', revenue: 'amount' }
  const input = { slot: 'sales', mapping, source: { type: 'dataset', artifactId: randomUUID(), revision: 1 } }
  const binding = { id: 'sales', source, providerId: 'file.table', operation: 'query', contractVersion: 1, payload: { key: 'opaque-provider-key' }, parameters: [],
    output: { datasetId: 'sales', grain: ['period'], fields: [
      { id: 'period', sourceField: 'period', label: 'Period', logicalType: 'string', role: 'dimension', nullable: false },
      { id: 'amount', sourceField: 'amount', label: 'Amount', logicalType: 'float64', role: 'measure', nullable: false }
    ] } }
  const bound = { input, binding, synthetic: false, origin: input.source }
  const options = { id: randomUUID(), title: 'My sales', theme: 'slate', parameters: {},
    origin: { schema: 'xpert.library.instance', version: 1, template: reference(template), inputs: [{ slot: 'sales', mapping, source: input.source }], parameters: {} } }
  return { template, bound, options }
}
test('generic standard templates map roles without hotel semantics or provider payload rewrites', () => {
  const f = compilation(), result = compileTemplate(f.template, [f.bound], f.options)
  assert.equal(result.charts[0].x, 'period'); assert.equal(result.charts[0].y, 'amount')
  assert.deepEqual(result.bindings[0].payload, f.bound.binding.payload)
  assert.deepEqual(result.templateOrigin.inputs[0].source, f.bound.input.source)
  assert.equal(result.visualTheme, 'slate')
  assert.equal(result.presentation, undefined)
  delete f.bound.input.mapping.revenue
  assert.throws(() => compileTemplate(f.template, [f.bound], f.options), /FIELD_MAPPING_REQUIRED/)
})
test('HTML context is inert JSON, escapes script termination, and retains authored document content', () => {
  const f = compilation()
  f.template.content.presentation = { type: 'html', documentAssetId: 'page' }
  f.options.title = '</script><script>attack()</script>'
  f.options.html = '<!doctype html><html><head><title>Original</title></head><body><p>Authored content</p><script>window.authored = true</script></body></html>'
  const result = compileTemplate(f.template, [f.bound], f.options)
  const nodes = [], visit = node => { nodes.push(node); node.childNodes?.forEach(visit) }
  visit(parse(result.presentation.html))
  const scripts = nodes.filter(node => node.tagName === 'script')
  assert.equal(scripts.length, 2, 'input text must not create executable elements')
  assert.equal(scripts[0].attrs.find(attr => attr.name === 'id').value, TEMPLATE_CONTEXT_ID)
  assert.equal(scripts[0].attrs.find(attr => attr.name === 'type').value, 'application/json')
  const context = JSON.parse(scripts[0].childNodes[0].value)
  assert.equal(context.title, f.options.title); assert.deepEqual(context.inputs.sales.fields, f.bound.input.mapping)
  assert.equal(context.inputs.sales.synthetic, false)
  assert.match(result.presentation.html, /Authored content/)
  f.options.html = `<div id="${TEMPLATE_CONTEXT_ID}">reserved</div>`
  assert.throws(() => compileTemplate(f.template, [f.bound], f.options), /RESERVED_CONTEXT/)
})
test('template parameters reject unknown keys, invalid calendar dates and unsupported standard behavior', () => {
  const f = compilation()
  f.template.content.parameters = [{ key: 'date', label: 'Date', type: 'date', defaultValue: '2024-02-29' }]
  assert.throws(() => compileTemplate(f.template, [f.bound], f.options), /STANDARD_PARAMETERS_UNSUPPORTED/)
  f.template.content.presentation = { type: 'html', documentAssetId: 'page' }; f.options.html = '<!doctype html><p>Template</p>'
  assert.equal(compileTemplate(f.template, [f.bound], f.options).templateOrigin.parameters.date, '2024-02-29')
  for (const parameters of [{ date: '2025-02-29' }, { date: 5 }, { other: 1 }]) {
    assert.throws(() => compileTemplate(f.template, [f.bound], { ...f.options, parameters }), /PARAMETER_/)
  }
})
test('unknown plugin versions cannot be advertised as compatible', () => {
  const f = compilation(), resolver = new LibraryExecutionResolution({}, { has: () => true })
  f.template.content.requirements.plugins = [{ name: '@xpert-ai/example', versionRange: '^1.0.0' }]
  assert.throws(() => resolver.checkRequirements([f.template]), /PLUGIN_REQUIREMENT_UNVERIFIED/)
})
test('execution fixture is a self-contained test graph without production template content', () => {
  const input = buildExecutionPackage(), bytes = encodePackage(input), roundtrip = decodePackage(bytes)
  assert.deepEqual(encodePackage(input), bytes)
  assert.equal(roundtrip.resources.length, 4); assert.equal(roundtrip.blobs.size, 2)
  const task = roundtrip.resources.find(item => item.kind === 'example-task')
  const dataset = roundtrip.resources.find(item => item.kind === 'public-dataset')
  assert.deepEqual(Object.keys(task.content.inputBindings[0].mapping).sort(), dataset.content.columns.map(column => column.key).sort())
  assert.ok(dataset.content.columns.every(column => column.role))
  assert.equal(JSON.parse(roundtrip.blobs.get(dataset.assets[0].sha256)).length, 3)
})
