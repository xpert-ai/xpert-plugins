const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DashboardMiddleware } = require('../dist/lib/middleware.js')

// Exercise the actual metadata consumed by the host, not an unregistered catalog.
const strategy = new DashboardMiddleware({})
const commands = strategy.meta.slashCommands
const prompt = name => commands.find(command => command.name === name).action.template

test('installed middleware exposes twelve editable, namespaced prompt workflows', () => {
  assert.equal(commands.length, 12)
  assert.equal(new Set(commands.map(command => command.name)).size, commands.length)
  for (const command of commands) {
    assert.match(command.name, /^dashboard-[a-z-]+$/)
    assert.equal(command.kind, 'prompt_workflow')
    assert.equal(command.workflow.type, 'prompt_workflow')
    assert.equal(command.workflow.name, command.name)
    assert.equal(command.category, 'live-dashboard')
    assert.ok(command.label.en_US && command.label.zh_Hans)
    assert.ok(command.description.en_US && command.description.zh_Hans)
    assert.ok(command.argsHint)
    assert.equal(command.action.type, 'insert_invocation')
    assert.equal(command.action.runtimeCapabilities, undefined, 'host binds the actual middleware node')
    assert.equal(command.source, undefined, 'plugin must not forge source identity')
    assert.equal(command.action.template.split('{{args}}').length, 2)
    assert.ok(command.action.template.endsWith('{{args}}'))
  }
  for (const group of ['standard', 'html', 'checks'])
    assert.equal(commands.filter(command => command.workflow.tags.includes(group)).length, 4)
})

test('prompt tool references exist in the shipped middleware tool catalog', () => {
  const middleware = strategy.createMiddleware({}, { xpertId: 'assistant', tenantId: 'tenant', organizationId: 'org', userId: 'user' })
  const tools = new Set(middleware.tools.map(tool => tool.name))
  for (const command of commands) {
    const references = command.action.template.match(/\b(?:dashboard_[a-z_]+|analytics_definition_[a-z_]+)\b/g) ?? []
    for (const reference of references) assert.ok(tools.has(reference), `${command.name}: unavailable ${reference}`)
  }
})

test('new workflows preserve independent identity and the selected presentation route', () => {
  for (const mode of ['standard', 'html']) for (const scenario of ['auto', 'new']) {
    const template = prompt(`dashboard-${mode}-${scenario}`)
    assert.match(template, /NEW independent dashboard/)
    assert.match(template, /Do not modify, rename or replace an existing Artifact/)
    assert.match(template, /Never reuse historical previewIds/)
    assert.match(template, /dashboard\.artifactId/)
    assert.match(template, /Formal publication remains a separate human/)
    assert.match(template, /historical data must not be described as current/)
    if (mode === 'standard') {
      assert.match(template, /STANDARD dashboard/)
      assert.match(template, /Do not author HTML/)
      assert.doesNotMatch(template, /subscribe before await live\.ready/)
    } else {
      assert.match(template, /unused workspace-relative named \.html path/)
      assert.match(template, /subscribe before await live\.ready/)
      assert.match(template, /live\.refresh\(bindingId\)/)
      assert.match(template, /loading, no-data, error and partial-data/)
    }
  }
})

test('recovery preserves failed candidates, checks unknown saves and stops at infrastructure blockers', () => {
  for (const mode of ['standard', 'html']) {
    const template = prompt(`dashboard-${mode}-recover`)
    assert.match(template, /earlier save outcome is unknown/)
    assert.match(template, /Only when recovering an existing Artifact/)
    assert.match(template, /RUNTIME_UNBOUND/)
    assert.match(template, /do not edit infrastructure or downgrade presentation/)
    assert.match(template, /new successful save receipt/)
  }
  assert.match(prompt('dashboard-html-style'), /do not rebuild unchanged queries or require fresh previews for unchanged Bindings/)
})

test('inspection workflows do not inherit authoring or automatic publication instructions', () => {
  for (const command of commands.filter(command => command.workflow.tags.includes('checks'))) {
    const template = command.action.template
    assert.doesNotMatch(template, /\b(?:dashboard_create|dashboard_create_html|dashboard_update|analytics_definition_register)\b/)
    assert.match(template, /(?:inspection only|read-only source test|Audit only|Acceptance only)/)
  }
  assert.match(prompt('dashboard-verify'), /viewer behavior untested/)
  for (const command of commands) {
    assert.doesNotMatch(command.action.template, /(?:10\.151\.251\.15|106\.14\.81\.250|quality-cockpit\.html|华域|2025-09|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)
  }
})
