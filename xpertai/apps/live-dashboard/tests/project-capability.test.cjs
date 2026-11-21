const { test } = require('node:test')
const assert = require('node:assert/strict')
const { applyAssistantMiddleware } = require('@xpert-ai/plugin-sdk')
const { DashboardCapability } = require('../dist/lib/content-capability')
const { dashboardTemplates } = require('../dist/lib/templates')

function draft() {
  return { team: { agent: { key: 'agent' } }, nodes: [
    { type: 'agent', key: 'agent', entity: { key: 'agent', prompt: 'User instructions' }, position: { x: 0, y: 0 } }
  ], connections: [] }
}

test('dashboard capability contributes one project selector and no project task tools', async () => {
  const graph = draft()
  const provider = new DashboardCapability()
  await provider.apply({ draft: graph })
  const once = structuredClone(graph)
  await provider.apply({ draft: graph })
  assert.deepEqual(graph, once)
  assert.deepEqual(graph.nodes.filter(n => n.type === 'workflow').map(n => n.entity.provider).sort(), ['LiveDashboard', 'ProjectMiddleware'])
})

test('dashboard reuses project selection already composed by another capability', async () => {
  const graph = draft()
  applyAssistantMiddleware(graph, { provider: 'ProjectMiddleware', key: 'Capability_Project', title: 'Projects', instructions: '', preserveToolConcurrency: true })
  await new DashboardCapability().apply({ draft: graph })
  assert.equal(graph.nodes.filter(n => n.entity.provider === 'ProjectMiddleware').length, 1)
  assert.equal(graph.connections.filter(e => e.to === 'Capability_Project').length, 1)
})

test('author template includes the same registered selector, while scheduled monitoring does not', () => {
  for (const template of dashboardTemplates) {
    const graph = JSON.parse(template.dslContent)
    const selectors = graph.nodes.filter(n => n.entity.provider === 'ProjectMiddleware')
    assert.equal(selectors.length, template.key === 'live-dashboard-assistant' ? 1 : 0)
    for (const selector of selectors) {
      assert.ok(graph.connections.some(e => e.from === graph.team.agent.key && e.to === selector.key))
    }
  }
})
