jest.mock('@xpert-ai/plugin-sdk', () => ({
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE',
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE',
  IntegrationStrategyKey: () => (target: unknown) => target,
  SSOProviderStrategyKey: () => (target: unknown) => target,
  XpertServerPlugin:
    () =>
    <T extends new (...args: never[]) => object>(target: T) =>
      target
}))

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from './index.js'
import { GITHUB_SSO_ARTIFACT_NAMESPACE, GITHUB_SSO_PLUGIN_RUNTIME_METADATA } from './lib/constants.js'
import { GitHubSsoPluginModule } from './lib/github-sso.module.js'
import { GITHUB_SSO_PLUGIN_CONTEXT } from './lib/tokens.js'

describe('GitHub SSO plugin', () => {
  it('keeps package and runtime artifact namespaces aligned', () => {
    const moduleDir = dirname(fileURLToPath(import.meta.url))
    const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
      xpert: { plugin: { artifactNamespace?: string } }
    }

    expect(GITHUB_SSO_ARTIFACT_NAMESPACE).toBe('github_sso')
    expect(GITHUB_SSO_PLUGIN_RUNTIME_METADATA).toEqual({
      level: 'system',
      artifactNamespace: GITHUB_SSO_ARTIFACT_NAMESPACE
    })
    expect(packageJson.xpert.plugin.artifactNamespace).toBe(GITHUB_SSO_PLUGIN_RUNTIME_METADATA.artifactNamespace)
  })

  it('declares empty plugin config and narrowly scoped host permissions', () => {
    expect(plugin.meta).toEqual(
      expect.objectContaining({
        name: '@xpert-ai/plugin-github-sso',
        displayName: 'GitHub SSO',
        level: 'system',
        category: 'integration'
      })
    )
    expect(plugin.config?.schema?.safeParse({}).success).toBe(true)
    expect(plugin.permissions).toEqual([
      {
        type: 'integration',
        service: 'github-sso',
        operations: ['read']
      },
      {
        type: 'bound_identity_login',
        operations: ['provision'],
        providers: ['github-sso']
      }
    ])
  })

  it('registers the global module and plugin context', () => {
    const context = {
      logger: {
        log: jest.fn()
      },
      config: {}
    }
    const result = plugin.register(context as Parameters<typeof plugin.register>[0])

    expect(result.module).toBe(GitHubSsoPluginModule)
    expect(result.global).toBe(true)
    expect(result.providers).toEqual([
      {
        provide: GITHUB_SSO_PLUGIN_CONTEXT,
        useValue: context
      }
    ])
  })
})
