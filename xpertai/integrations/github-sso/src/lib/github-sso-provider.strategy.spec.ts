jest.mock('@xpert-ai/plugin-sdk', () => ({
  SSOProviderStrategyKey: () => (target: unknown) => target
}))

import { GitHubSsoIntegrationResolver } from './github-sso-integration.resolver.js'
import { GitHubSsoProviderStrategy } from './github-sso-provider.strategy.js'

describe('GitHubSsoProviderStrategy', () => {
  it('exposes GitHub only when one valid tenant integration exists', async () => {
    const resolver = {
      findAvailable: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'tenant-1',
        clientId: 'client-id',
        clientSecret: 'client-secret'
      })
    } as Pick<GitHubSsoIntegrationResolver, 'findAvailable'>
    const strategy = new GitHubSsoProviderStrategy(resolver as GitHubSsoIntegrationResolver)

    await expect(
      strategy.describe({
        tenantId: 'tenant-1',
        organizationId: 'ignored-organization',
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).resolves.toEqual({
      provider: 'github-sso',
      displayName: 'GitHub',
      icon: '/assets/images/destinations/GitHub-Mark-64px.png',
      order: 110,
      startUrl: '/api/github-identity/login/start'
    })
  })

  it('hides GitHub when the tenant integration is unavailable', async () => {
    const resolver = {
      findAvailable: jest.fn().mockResolvedValue(null)
    } as Pick<GitHubSsoIntegrationResolver, 'findAvailable'>
    const strategy = new GitHubSsoProviderStrategy(resolver as GitHubSsoIntegrationResolver)

    await expect(
      strategy.describe({
        tenantId: 'tenant-1',
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).resolves.toBeNull()
  })
})
