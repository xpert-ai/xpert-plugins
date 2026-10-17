import 'reflect-metadata'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Module } from '@nestjs/common'
import { DiscoveryModule, NestFactory } from '@nestjs/core'
import {
  AgentMiddlewareRegistry, StrategyBus, ToolsetRegistry,
  XpertToolProviderCoordinator, XpertToolProviderRegistry, describeXpertToolProvider
} from '@xpert-ai/plugin-sdk'
import plugin from '../dist/bundle.js'
import { SaicDorisTools } from '../dist/lib/provider.js'

test('published SDK registers SAIC toolset and middleware with the same native MCP capabilities', async () => {
  const provider = new SaicDorisTools({ run() { throw new Error('Discovery must not access the database') } })
  class Fixture {}
  Module({
    imports: [DiscoveryModule],
    providers: [StrategyBus, ToolsetRegistry, AgentMiddlewareRegistry, XpertToolProviderRegistry,
      XpertToolProviderCoordinator, { provide: SaicDorisTools, useValue: provider }]
  })(Fixture)
  const app = await NestFactory.createApplicationContext(Fixture, { logger: false })
  try {
    const descriptor = describeXpertToolProvider(provider)
    assert.equal(descriptor.options.configSchema.title.zh_Hans, '配置连接')
    assert.equal(app.get(ToolsetRegistry).get('saic_doris').meta.configSchema.title.zh_Hans, '配置连接')
    const resources = JSON.parse(readFileSync(new URL('../.xpertai-plugin/plugin.json', import.meta.url), 'utf8'))
    assert.equal(resources.name, plugin.meta.name)
    assert.equal(resources.toolsets[descriptor.options.componentKey].provider, descriptor.options.provider)
    assert.ok(plugin.register().module)
    const toolset = await app.get(ToolsetRegistry).get('saic_doris').create({ name: 'SAIC', credentials: {} })
    const capabilities = toolset.getMcpCapabilityDefinitions()
    assert.equal(capabilities.tools.length, 24)
    assert.equal(capabilities.resources.length, 1)
    assert.equal(capabilities.resources[0].uri, 'schema://saic/config-tables')
    assert.deepEqual(app.get(AgentMiddlewareRegistry).get('saic_doris').getToolNames({}),
      capabilities.tools.map(tool => tool.name))
  } finally { await app.close() }
})
