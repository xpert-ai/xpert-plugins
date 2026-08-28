jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  XpertServerPlugin: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (handler: object, config: object) => ({ ...config, invoke: handler })
}))

import plugin from './index.js'
import { TENCENT_MAP_ICON } from './lib/branding.js'
import { TENCENT_MAP_ARTIFACT_NAMESPACE, TENCENT_MAP_PLUGIN_LEVEL } from './lib/constants.js'

describe('Tencent Maps connector plugin', () => {
  it('keeps runtime and package metadata aligned', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-tencent-map-connector',
      version: '0.1.0',
      level: 'organization',
      artifactNamespace: TENCENT_MAP_ARTIFACT_NAMESPACE,
      category: 'middleware',
      icon: TENCENT_MAP_ICON
    })
    expect(TENCENT_MAP_PLUGIN_LEVEL).toBe('organization')
  })

  it('declares a read-only Tencent Maps integration surface', () => {
    expect(plugin.permissions).toEqual([
      { type: 'integration', service: 'tencent-map', operations: ['read'] }
    ])
  })
})
