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
import { AMAP_ICON } from './lib/branding.js'
import { AMAP_PLUGIN_LEVEL } from './lib/constants.js'

describe('AMap connector plugin', () => {
  it('keeps runtime and package metadata aligned', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-amap-connector',
      version: '0.1.0',
      level: 'organization',
      category: 'middleware',
      icon: AMAP_ICON
    })
    expect(AMAP_PLUGIN_LEVEL).toBe('organization')
  })

  it('declares a read-only AMap integration surface', () => {
    expect(plugin.permissions).toEqual([
      { type: 'integration', service: 'amap', operations: ['read'] }
    ])
  })

  it('uses the packaged PNG for every runtime icon surface', () => {
    expect(AMAP_ICON).toMatchObject({
      type: 'image',
      value: expect.stringMatching(/^data:image\/png;base64,/),
      size: 32,
      alt: 'AMap'
    })
  })
})
