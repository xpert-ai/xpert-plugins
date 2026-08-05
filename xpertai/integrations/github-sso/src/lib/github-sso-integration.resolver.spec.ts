jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE'
}))

import type { IntegrationPermissionService, PluginContext } from '@xpert-ai/plugin-sdk'
import { ConfigService } from '@nestjs/config'
import { GitHubSsoError } from './github-sso.error.js'
import { GitHubSsoIntegrationResolver } from './github-sso-integration.resolver.js'
import { GitHubSsoSecretService } from './github-sso-secret.service.js'
import type { GitHubSsoIntegration } from './types.js'

const secretService = new GitHubSsoSecretService(new ConfigService({ SECRETS_ENCRYPTION_KEY: 'test-encryption-key' }))

describe('GitHubSsoIntegrationResolver', () => {
  it('queries and returns exactly one tenant-level github-sso integration', async () => {
    const { resolver, findAll } = createResolver([
      integration({
        id: 'tenant-integration',
        tenantId: 'tenant-1',
        organizationId: null
      }),
      integration({
        id: 'organization-integration',
        tenantId: 'tenant-1',
        organizationId: 'organization-1'
      }),
      integration({
        id: 'foreign-integration',
        tenantId: 'tenant-2',
        organizationId: null
      })
    ])

    await expect(resolver.resolveForTenant('tenant-1')).resolves.toEqual({
      id: 'tenant-integration',
      tenantId: 'tenant-1',
      clientId: 'client-id',
      clientSecret: 'client-secret'
    })
    expect(findAll).toHaveBeenCalledWith({
      where: {
        provider: 'github-sso',
        tenantId: 'tenant-1',
        organizationId: null
      },
      order: {
        createdAt: 'ASC'
      }
    })
  })

  it('rejects duplicate tenant-level integrations instead of picking one', async () => {
    const { resolver } = createResolver([integration({ id: 'integration-1' }), integration({ id: 'integration-2' })])

    await expect(resolver.resolveForTenant('tenant-1')).rejects.toMatchObject<Partial<GitHubSsoError>>({
      code: 'integration_ambiguous'
    })
    await expect(resolver.findAvailable('tenant-1')).resolves.toBeNull()
  })

  it('rejects a selected integration from another tenant or organization', async () => {
    const { resolver } = createResolver([
      integration({
        id: 'integration-1',
        tenantId: 'tenant-2',
        organizationId: null
      }),
      integration({
        id: 'integration-2',
        tenantId: 'tenant-1',
        organizationId: 'organization-1'
      })
    ])

    await expect(resolver.resolveById('tenant-1', 'integration-1')).rejects.toMatchObject<Partial<GitHubSsoError>>({
      code: 'integration_required'
    })
  })

  it('rejects an integration with incomplete credentials', async () => {
    const { resolver } = createResolver([integration({ options: { clientId: 'client-id', clientSecret: '' } })])

    await expect(resolver.resolveForTenant('tenant-1')).rejects.toMatchObject<Partial<GitHubSsoError>>({
      code: 'integration_invalid'
    })
  })
})

function createResolver(items: GitHubSsoIntegration[]) {
  const findAll = jest.fn(async () => ({ items, total: items.length }))
  const integrationPermissionService: Pick<IntegrationPermissionService, 'findAll'> = { findAll }
  const pluginContext = {
    resolve: jest.fn(() => integrationPermissionService)
  } as Pick<PluginContext, 'resolve'>

  return {
    resolver: new GitHubSsoIntegrationResolver(pluginContext as PluginContext, secretService),
    findAll
  }
}

function integration(overrides: Partial<GitHubSsoIntegration> = {}): GitHubSsoIntegration {
  return {
    id: 'integration-1',
    name: 'GitHub OAuth Login',
    slug: 'github-sso',
    provider: 'github-sso',
    tenantId: 'tenant-1',
    organizationId: null,
    options: {
      clientId: 'client-id',
      clientSecret: secretService.encrypt('client-secret')
    },
    ...overrides
  }
}
