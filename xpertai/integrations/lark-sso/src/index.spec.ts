jest.mock('@xpert-ai/plugin-sdk', () => ({
  SSOProviderStrategyKey: () => (target: unknown) => target,
  XpertServerPlugin:
    (metadata: Record<string, unknown>) =>
    <T extends new (...args: any[]) => any>(target: T) => {
      void metadata
      return target
    }
}))

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from './index.js'
import { LarkSsoPluginModule } from './lib/lark-sso.module.js'
import { LARK_SSO_ARTIFACT_NAMESPACE } from './lib/types.js'
import { LARK_SSO_PLUGIN_CONFIG, LARK_SSO_PLUGIN_CONTEXT } from './lib/tokens.js'

const specDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(specDir, '../package.json'), 'utf8')) as {
  xpert?: { plugin?: { level?: string; artifactNamespace?: string } }
}

describe('Lark SSO Plugin', () => {
  it('declares the expected metadata, config, and permissions', () => {
    expect(plugin.meta.name).toBe('@xpert-ai/plugin-lark-sso')
    expect(plugin.meta.displayName).toBe('Lark SSO')
    expect(plugin.meta.category).toBe('integration')
    expect(plugin.meta.level).toBe('system')
    expect(packageJson.xpert?.plugin?.level).toBe(plugin.meta.level)
    expect(plugin.meta.artifactNamespace).toBe(LARK_SSO_ARTIFACT_NAMESPACE)
    expect(packageJson.xpert?.plugin?.artifactNamespace).toBe(LARK_SSO_ARTIFACT_NAMESPACE)

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

    expect(ctx.logger.log).toHaveBeenCalledWith('register lark sso plugin')
    expect(result.module).toBe(LarkSsoPluginModule)
    expect(result.global).toBe(true)
    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: LARK_SSO_PLUGIN_CONTEXT, useValue: ctx }),
        expect.objectContaining({
          provide: LARK_SSO_PLUGIN_CONFIG,
          useValue: ctx.config
        })
      ])
    )
  })
})
