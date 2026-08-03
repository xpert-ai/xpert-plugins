jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => (target: unknown) => target
}))

import { ConfigService } from '@nestjs/config'
import { GitHubSsoIntegrationStrategy } from './github-sso-integration.strategy.js'
import { GitHubSsoSecretService } from './github-sso-secret.service.js'

describe('GitHubSsoIntegrationStrategy', () => {
  const configService = new ConfigService({
    baseUrl: 'https://api.xpert.example.com',
    clientBaseUrl: 'https://xpert.example.com',
    SECRETS_ENCRYPTION_KEY: 'test-encryption-key'
  })
  const secretService = new GitHubSsoSecretService(configService)

  it('declares a tenant System Integration with a secret clientSecret', () => {
    const strategy = new GitHubSsoIntegrationStrategy(configService, secretService)

    expect(strategy.meta).toEqual(
      expect.objectContaining({
        name: 'github-sso',
        features: ['sso'],
        schema: expect.objectContaining({
          required: ['clientId', 'clientSecret'],
          secret: ['clientSecret']
        })
      })
    )
  })

  it('returns the fixed callback URL without probing GitHub credentials', async () => {
    const strategy = new GitHubSsoIntegrationStrategy(configService, secretService)

    const result = await strategy.validateConfig({
      clientId: 'client-id',
      clientSecret: 'client-secret'
    })

    expect(result).toEqual({
      mode: 'oauth_app',
      callbackUrl: 'https://xpert.example.com/api/github-identity/callback',
      options: {
        clientId: 'client-id',
        clientSecret: expect.stringMatching(/^enc:v1:/)
      }
    })
    expect(secretService.decrypt((result.options as { clientSecret: string }).clientSecret)).toBe('client-secret')
  })
})
