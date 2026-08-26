import plugin from './index.js'
import { QQ_MAIL_OFFICIAL_ICON, QQ_MAIL_OFFICIAL_ICON_SOURCE } from './lib/branding.js'
import { QQ_MAIL_PLUGIN_LEVEL } from './lib/constants.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorStrategyKey: () => (target: object) => target,
  IntegrationStrategyKey: () => (target: object) => target,
  XpertServerPlugin: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (handler: object, config: object) => ({ ...config, invoke: handler })
}))

describe('QQ Mail connector plugin', () => {
  it('keeps runtime and package metadata aligned', () => {
    expect(plugin.meta.name).toBe('@xpert-ai/plugin-qq-mail-connector')
    expect(plugin.meta.version).toBe('0.1.0')
    expect(plugin.meta.level).toBe(QQ_MAIL_PLUGIN_LEVEL)
    expect(plugin.meta.category).toBe('middleware')
    expect(plugin.meta.icon).toEqual({ type: 'image', value: QQ_MAIL_OFFICIAL_ICON })
    expect(QQ_MAIL_OFFICIAL_ICON_SOURCE).toContain('res.wx.qq.com')
  })

  it('declares OAuth and System Integration permissions', () => {
    expect(plugin.permissions).toEqual([
      { type: 'integration', service: 'qq-mail', operations: ['read', 'write'] },
      { type: 'integration', service: 'qq-mail-imap-smtp', operations: ['read'] }
    ])
  })
})
