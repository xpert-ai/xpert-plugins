jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  IntegrationStrategyKey: () => (target: object) => target,
  XpertServerPlugin: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (handler: object, config: object) => ({ ...config, invoke: handler })
}))

import plugin from './index.js'
import { BAIDU_NETDISK_ICON } from './lib/branding.js'
import {
  BAIDU_NETDISK_ARTIFACT_NAMESPACE,
  BAIDU_NETDISK_PLUGIN_LEVEL,
  BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER
} from './lib/constants.js'
import { BaiduNetdiskPluginConfigSchema } from './lib/plugin-config.js'

describe('Baidu Netdisk connector plugin', () => {
  it('keeps package metadata and registration aligned', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-baidu-netdisk-connector',
      version: '0.1.0',
      level: BAIDU_NETDISK_PLUGIN_LEVEL,
      artifactNamespace: BAIDU_NETDISK_ARTIFACT_NAMESPACE,
      category: 'middleware',
      icon: BAIDU_NETDISK_ICON
    })
    expect(BAIDU_NETDISK_ICON).toMatchObject({
      type: 'image',
      value: expect.stringMatching(/^data:image\/png;base64,/),
      alt: 'Baidu Netdisk'
    })
  })

  it('keeps OAuth app credentials out of tenant plugin configuration', () => {
    const defaults = BaiduNetdiskPluginConfigSchema.parse({})
    expect(defaults).not.toHaveProperty('oauth')
    expect(defaults.capabilities.semanticSearch).toBe(true)
    expect(defaults.capabilities.uploadWorkspaceFile).toBe(true)
    expect(defaults.capabilities.uploadText).toBe(true)
    expect(defaults.capabilities.delete).toBe(false)
  })

  it('declares connector and tenant System Integration permissions', () => {
    expect(plugin.permissions).toEqual([
      { type: 'integration', service: 'baidu-netdisk', operations: ['read', 'write', 'update', 'delete'] },
      { type: 'integration', service: BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER, operations: ['read'] }
    ])
  })
})
