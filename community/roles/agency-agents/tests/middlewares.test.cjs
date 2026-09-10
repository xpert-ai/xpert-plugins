const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { parse } = require('yaml')
const { AgencyCatalogProvider } = require('../dist/catalog-provider')
const provider = new AgencyCatalogProvider()

test('each template connects the ClawXpert middleware set, including exactly one skills middleware', () => {
  for (const entry of provider.listTemplates()) for (const locale of entry.availableLocales) {
    const detail = provider.resolveTemplate(undefined, entry.key, locale)
    const draft = JSON.parse(detail.dslContent)
    const agent = draft.nodes.find((node) => node.type === 'agent')
    const middlewares = draft.nodes.filter((node) => node.type === 'workflow' && node.entity.type === 'middleware')
    assert.equal(middlewares.length, 12, entry.key)
    assert.equal(middlewares.filter((node) => node.entity.provider === 'skillsMiddleware').length, 1)
    assert.equal(draft.connections.length, middlewares.length)
    assert.deepEqual(agent.entity.options.middlewares.order, middlewares.map((node) => node.key))
    assert.deepEqual(draft.team.agent, agent.entity)
    assert.equal(new Set(draft.nodes.map((node) => node.key)).size, draft.nodes.length)
    for (const node of middlewares) {
      assert.equal(node.entity.key, node.key)
      assert.equal(node.entity.required, true)
      assert.equal(draft.connections.filter((edge) => edge.type === 'workflow' && edge.from === agent.key && edge.to === node.key).length, 1)
    }
    assert.deepEqual(detail.dependencies.plugins, entry.dependencies.plugins)
    if (locale === entry.defaultLocale) assert.deepEqual(detail.dependencies, entry.dependencies)
    assert.equal(detail.dependencies.plugins.length, 6)
    assert.deepEqual(draft.team.features.sandbox, { enabled: true, provider: 'nsjail' })
    assert.equal(draft.team.agentConfig.recursionLimit, 1000)
    assert.equal(agent.entity.options.vision.enabled, true)
  }
})

test('templates have independent middleware options and bundled role skill resources', () => {
  const entry = provider.listTemplates()[0]
  const first = JSON.parse(provider.resolveTemplate(undefined, entry.key).dslContent)
  first.team.agent.options.middlewares.order.length = 0
  first.nodes.find((node) => node.type === 'workflow').entity.required = false
  entry.dependencies.plugins.length = 0
  const second = JSON.parse(provider.resolveTemplate(undefined, entry.key).dslContent)
  assert.equal(second.team.agent.options.middlewares.order.length, 12)
  assert.equal(second.nodes.find((node) => node.type === 'workflow').entity.required, true)
  assert.equal(provider.listTemplates()[0].dependencies.plugins.length, 6)
  const manifest = JSON.parse(readFileSync(join(__dirname, '../.xpertai-plugin/plugin.json')))
  assert.equal(manifest.skills, './dist/skills')
  assert.equal(existsSync(join(__dirname, '../dist/skills')), true)
  assert.equal(manifest.targetAppMeta.xpert.marketplace.contents.filter((item) => item.type === 'assistant-template').length, 326)
  assert.deepEqual(require('../dist/plugin.cjs').meta.targetAppMeta, manifest.targetAppMeta)
})

test('middleware configuration and plugin dependencies match the actual host ClawXpert template', { skip: !process.env.XPERT_HOST_ROOT }, () => {
  const templateRoot = join(process.env.XPERT_HOST_ROOT, 'packages/server-ai/src/xpert-template')
  const claw = parse(readFileSync(join(templateRoot, 'templates/xpert-my-claw-xpert.yaml'), 'utf8'))
  const clawAgent = claw.nodes.find((node) => node.type === 'agent')
  const connected = new Set(claw.connections.filter((edge) => edge.from === clawAgent.key).map((edge) => edge.to))
  const middlewareConfig = (node) => {
    const { id, key, ...config } = node.entity
    return config
  }
  const clawMiddlewares = claw.nodes.filter((node) => connected.has(node.key) && node.entity.type === 'middleware')
  const detail = provider.resolveTemplate(undefined, provider.listTemplates()[0].key)
  const draft = JSON.parse(detail.dslContent)
  assert.deepEqual(draft.nodes.filter((node) => node.type === 'workflow').map(middlewareConfig), clawMiddlewares.map(middlewareConfig))
  assert.deepEqual(draft.team.features, claw.team.features)
  assert.deepEqual(draft.team.agentConfig, claw.team.agentConfig)
  assert.deepEqual(draft.team.agent.options.vision, clawAgent.entity.options.vision)
  const findTemplate = (value) => {
    if (!value || typeof value !== 'object') return null
    if (value.id === 'xpert-my-claw-xpert') return value
    for (const item of Object.values(value)) { const found = findTemplate(item); if (found) return found }
    return null
  }
  const metadata = findTemplate(JSON.parse(readFileSync(join(templateRoot, 'templates.json'))))
  assert.deepEqual(detail.dependencies.plugins, metadata.dependencies.plugins)
})
