import plugin from './index.js'
import { NETEASE_MAIL_ICON } from './lib/branding.js'
import { NETEASE_MAIL_PLUGIN_LEVEL } from './lib/constants.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  XpertServerPlugin: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (handler: object, config: object) => ({ ...config, invoke: handler })
}))

describe('NetEase Mail connector plugin', () => {
  it('keeps runtime and package metadata aligned', () => {
    expect(plugin.meta.name).toBe('@xpert-ai/plugin-netease-mail-connector')
    expect(plugin.meta.version).toBe('0.1.0')
    expect(plugin.meta.level).toBe(NETEASE_MAIL_PLUGIN_LEVEL)
    expect(plugin.meta.category).toBe('middleware')
    expect(plugin.meta.icon).toEqual(NETEASE_MAIL_ICON)
    expect(plugin.meta.icon).toMatchObject({ type: 'image', value: expect.stringMatching(/^data:image\/png;base64,/) })
  })

  it('declares only mail integration read/write permissions', () => {
    expect(plugin.permissions).toEqual([
      { type: 'integration', service: 'netease-mail', operations: ['read', 'write'] }
    ])
  })
})
