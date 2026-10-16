import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { DecoratedAgentMiddlewareStrategy, describeXpertToolProvider } from '@xpert-ai/plugin-sdk'
import plugin from '../dist/bundle.js'
import { SaicDorisTools } from '../dist/lib/provider.js'
import { saicAssistantDraft, saicTemplates } from '../dist/lib/templates.js'

test('packaged assistant template preserves catalog identity, dependencies and opening questions', () => {
  const template = plugin.templates[0]
  const draft = JSON.parse(template.dslContent)
  assert.deepEqual(plugin.templates, saicTemplates)
  assert.deepEqual(draft, saicAssistantDraft)
  assert.equal(template.title, 'SAIC 供应链配置助手')
  assert.equal(template.key, draft.team.name)
  assert.equal(draft.team.options.templateKey, template.key)
  assert.equal(template.type, draft.team.type)
  assert.equal(draft.team.version, '1')
  assert.deepEqual(template.description, draft.team.description)
  assert.deepEqual(template.startPrompts, draft.team.features.opener.questions)
  assert.ok(draft.team.features.opener.enabled)
  assert.deepEqual(template.dependencies.plugins, ['@xpert-ai/plugin-saic-doris', '@xpert-ai/plugin-mysql'])
  assert.deepEqual(template.targetAppMeta.xpert.requiredPlugins, template.dependencies.plugins)
  assert.ok(plugin.meta.targetAppMeta.xpert.marketplace.contents.some(
    item => item.type === 'assistant-template' && item.name === template.key))
})

test('template graph connects chat and the required middleware to exactly one primary agent', async () => {
  const { team, nodes, connections } = saicAssistantDraft
  const keys = new Set(nodes.map(node => node.key))
  assert.equal(keys.size, nodes.length)
  const agents = nodes.filter(node => node.type === 'agent')
  assert.equal(agents.length, 1)
  assert.equal(agents[0].key, team.agent.key)
  const trigger = nodes.find(node => node.entity.type === 'trigger')
  const middleware = nodes.find(node => node.entity.provider === 'saic_doris')
  assert.equal(trigger.entity.from, 'chat')
  assert.equal(middleware.entity.required, true)
  const middlewareKeys = nodes.filter(node => node.entity.type === 'middleware').map(node => node.key)
  assert.deepEqual(agents[0].entity.options.middlewares.order, middlewareKeys)
  for (const key of middlewareKeys) {
    assert.ok(connections.some(edge => edge.type === 'workflow' && edge.from === agents[0].key && edge.to === key))
  }
  for (const edge of connections) assert.ok(keys.has(edge.from) && keys.has(edge.to))
  assert.ok(connections.some(edge => edge.type === 'edge' && edge.from === trigger.key && edge.to === agents[0].key))
  assert.ok(connections.some(edge => edge.type === 'workflow' && edge.from === agents[0].key && edge.to === middleware.key))
  const reached = new Set([trigger.key])
  for (let pass = 0; pass < nodes.length; pass++) {
    for (const edge of connections) if (reached.has(edge.from)) reached.add(edge.to)
  }
  assert.deepEqual(reached, keys, 'Every template node must be reachable')

  const provider = new SaicDorisTools({ run() { throw new Error('Template discovery must not access a database') } })
  const descriptor = describeXpertToolProvider(provider)
  const strategy = new DecoratedAgentMiddlewareStrategy(provider, descriptor, middleware.entity.provider)
  const built = await strategy.createMiddleware(middleware.entity.options, {
    tenantId: 'test', organizationId: 'test', userId: 'test', tools: new Map(),
    node: middleware.entity, runtime: { capabilities: { get: () => undefined } }
  })
  assert.equal(built.tools.length, 24)
  assert.deepEqual(built.tools.map(tool => tool.name), descriptor.tools.map(tool => tool.options.name))
})

test('template leaves model and connection bindings to the installing user', () => {
  const { team, nodes } = saicAssistantDraft
  assert.equal(team.copilotModel, undefined)
  assert.deepEqual(team.tags, [])
  assert.deepEqual(team.toolsets, [])
  const middleware = nodes.find(node => node.entity.provider === 'saic_doris')
  assert.deepEqual(middleware.entity.options, {})
  const forbidden = new Set(['tenantId', 'organizationId', 'workspaceId', 'dataSourceId', 'password', 'host', 'username', 'copilotId'])
  function check(value) {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbidden.has(key), `Portable template contains instance binding ${key}`)
      check(child)
    }
  }
  check(saicAssistantDraft)
  assert.doesNotMatch(JSON.stringify(saicAssistantDraft), /saic_plugin_test|127\.0\.0\.1|localhost:|\/Users\//)
})

test('assistant retains execution safeguards without todo or web tools and preserves the external MCP surface', () => {
  const providers = saicAssistantDraft.nodes.filter(node => node.entity.type === 'middleware').map(node => node.entity.provider)
  assert.deepEqual(providers, [
    'saic_doris',
    'ContextCompressionMiddleware', 'LoopGuardMiddleware', 'ModelRetryMiddleware', 'DanglingToolCallMiddleware'
  ])
  const descriptor = describeXpertToolProvider(new SaicDorisTools({ run() { throw new Error('No database during discovery') } }))
  assert.equal(descriptor.tools.filter(tool => tool.options.mcp).length, 24)
  assert.ok(plugin.meta.targetAppMeta.xpert.types.includes('toolset'))
  assert.ok(plugin.meta.targetAppMeta.xpert.types.includes('middleware'))
  assert.ok(plugin.meta.targetAppMeta.xpert.types.includes('mcp'))
})

test('assistant needs no sandbox backend or sandbox-dependent middleware', () => {
  const draft = JSON.parse(plugin.templates[0].dslContent)
  assert.notEqual(draft.team.features.sandbox?.enabled, true)
  const sandboxProviders = new Set(['SandboxFile', 'ViewImageMiddleware', 'skillsMiddleware'])
  assert.ok(draft.nodes.every(node => !sandboxProviders.has(node.entity.provider)))
  const agent = draft.nodes.find(node => node.type === 'agent')
  assert.match(agent.entity.prompt, /数据库操作始终使用 SAIC 的 24 个工具/)
  assert.match(agent.entity.prompt, /此模板不提供文件读写、图片查看或技能执行工具/)
})
