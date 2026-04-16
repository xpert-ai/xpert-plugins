jest.mock('@xpert-ai/plugin-sdk', () => ({
  SSOProviderStrategyKey: () => (target: unknown) => target,
  XpertServerPlugin:
    (metadata: Record<string, unknown>) =>
    <T extends new (...args: any[]) => any>(target: T) => {
      void metadata
      return target
    }
}))

import plugin from './index.js'
import { LarkIdentityPluginModule } from './lib/lark-identity.module.js'
import { LARK_IDENTITY_PLUGIN_CONFIG, LARK_IDENTITY_PLUGIN_CONTEXT } from './lib/tokens.js'

describe('Lark Identity Plugin', () => {
  it('declares the expected metadata, config, and permissions', () => {
    expect(plugin.meta.name).toBe('@xpert-ai/plugin-lark-identity')
    expect(plugin.meta.displayName).toBe('Lark Identity')
    expect(plugin.meta.category).toBe('integration')
    expect(plugin.meta.level).toBe('system')

    expect(plugin.config?.schema?.safeParse({
      appId: 'cli_xxx',
      appSecret: 'secret',
      publicBaseUrl: 'https://xpert.example.com'
    }).success).toBe(true)

    expect(plugin.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'sso_binding',
          operations: ['create'],
          providers: ['lark']
        }),
        expect.objectContaining({
          type: 'bound_identity_login',
          operations: ['create'],
          providers: ['lark']
        })
      ])
    )
  })

  it('registers the module and exposes plugin context/config providers', () => {
    const ctx = {
      logger: { log: jest.fn() },
      config: { appId: 'app-id', appSecret: 'secret' }
    }

    const result = plugin.register(ctx as any)

    expect(ctx.logger.log).toHaveBeenCalledWith('register lark identity plugin')
    expect(result.module).toBe(LarkIdentityPluginModule)
    expect(result.global).toBe(true)
    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: LARK_IDENTITY_PLUGIN_CONTEXT, useValue: ctx }),
        expect.objectContaining({
          provide: LARK_IDENTITY_PLUGIN_CONFIG,
          useValue: ctx.config
        })
      ])
    )
  })
})
