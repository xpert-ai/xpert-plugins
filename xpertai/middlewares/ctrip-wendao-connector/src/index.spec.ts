import { createHash } from 'node:crypto'
import plugin from './index.js'
import { CTRIP_WENDAO_ICON } from './lib/branding.js'
import { CTRIP_WENDAO_PLUGIN_LEVEL } from './lib/constants.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  XpertServerPlugin: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (handler: object, config: object) => ({ ...config, invoke: handler })
}))

describe('Ctrip Wendao connector plugin', () => {
  it('keeps runtime and package metadata aligned', () => {
    expect(plugin.meta.name).toBe('@xpert-ai/plugin-ctrip-wendao-connector')
    expect(plugin.meta.version).toBe('0.1.0')
    expect(plugin.meta.level).toBe(CTRIP_WENDAO_PLUGIN_LEVEL)
    expect(plugin.meta.category).toBe('middleware')
    expect(plugin.meta.icon).toEqual(CTRIP_WENDAO_ICON)
    expect(plugin.meta.icon).toMatchObject({
      type: 'image',
      value: expect.stringMatching(/^data:image\/png;base64,/),
      size: 32
    })
    const encodedLogo = (plugin.meta.icon?.value ?? '').replace(/^data:image\/png;base64,/, '')
    expect(createHash('sha256').update(Buffer.from(encodedLogo, 'base64')).digest('hex')).toBe(
      '0c7bae5123c302d0c94d615d985ddaa03fd08dc8594da4d48d7f6d7507a1c61f'
    )
  })

  it('declares only read access to the Ctrip Wendao integration', () => {
    expect(plugin.permissions).toEqual([{ type: 'integration', service: 'ctrip-wendao', operations: ['read'] }])
  })
})
