import plugin, { WPS_KNOWLEDGE_ICON } from './index.js'
import { WPS_KNOWLEDGE_PLUGIN_LEVEL } from './lib/constants.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  XpertServerPlugin: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (handler: object, config: object) => ({ ...config, invoke: handler })
}))

describe('WPS Knowledge connector plugin', () => {
  it('keeps runtime and package metadata aligned', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-wps-knowledge-connector',
      version: '0.1.0',
      level: WPS_KNOWLEDGE_PLUGIN_LEVEL,
      category: 'middleware',
      icon: WPS_KNOWLEDGE_ICON
    })
    expect(plugin.meta.artifactNamespace).toBeUndefined()
    expect(WPS_KNOWLEDGE_ICON).toMatchObject({
      type: 'image',
      value: expect.stringMatching(/^data:image\/png;base64,/),
      alt: 'WPS Knowledge'
    })
  })

  it('declares a bounded read-only integration permission', () => {
    expect(plugin.permissions).toEqual([
      { type: 'integration', service: 'wps-knowledge', operations: ['read'] }
    ])
  })
})
