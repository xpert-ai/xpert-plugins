jest.mock('@xpert-ai/plugin-sdk', () => ({
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN: 'BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN',
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  SSO_BINDING_PERMISSION_SERVICE_TOKEN: 'SSO_BINDING_PERMISSION_SERVICE_TOKEN',
  IntegrationStrategyKey: () => (target: unknown) => target,
  SSOProviderStrategyKey: () => (target: unknown) => target,
  XpertServerPlugin: () => (target: unknown) => target
}))

import plugin from './index.js'
import { DingTalkSsoPluginModule } from './lib/dingtalk-sso.module.js'
import { DINGTALK_SSO_PLUGIN_CONTEXT } from './lib/tokens.js'

describe('DingTalk SSO plugin', () => {
  it('declares system metadata, config, and narrow host permissions', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-dingtalk-sso',
      displayName: 'DingTalk SSO',
      level: 'system',
      category: 'integration',
      artifactNamespace: 'dingtalk_sso'
    })
    expect(plugin.config?.schema.parse({})).toEqual({})
    expect(plugin.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'integration',
          service: 'dingtalk-sso',
          operations: ['read']
        }),
        expect.objectContaining({
          type: 'sso_binding',
          operations: ['create'],
          providers: ['dingtalk-sso']
        }),
        expect.objectContaining({
          type: 'bound_identity_login',
          operations: ['create'],
          providers: ['dingtalk-sso']
        })
      ])
    )
  })

  it('registers the server module and live plugin context', () => {
    const context = {
      logger: { log: jest.fn() },
      config: { clientId: 'ding-client', clientSecret: 'ding-secret' }
    }
    const result = plugin.register(context as any)

    expect(result.module).toBe(DingTalkSsoPluginModule)
    expect(result.global).toBe(true)
    expect(result.providers).toContainEqual({
      provide: DINGTALK_SSO_PLUGIN_CONTEXT,
      useValue: context
    })
  })
})
