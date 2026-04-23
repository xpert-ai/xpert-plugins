jest.mock('@xpert-ai/plugin-sdk', () => ({
  SSOProviderStrategyKey: () => (target: unknown) => target
}))

import { LarkSsoProviderStrategy } from './lark-sso-provider.strategy.js'

describe('LarkSsoProviderStrategy', () => {
  it('returns null when required config is missing', () => {
    const strategy = new LarkSsoProviderStrategy({
      appId: '',
      appSecret: 'secret'
    } as any)

    expect(
      strategy.describe({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).toBeNull()
  })

  it('returns a render-ready descriptor when config is valid', () => {
    const strategy = new LarkSsoProviderStrategy({
      appId: 'cli_xxx',
      appSecret: 'secret'
    } as any)

    expect(
      strategy.describe({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).toEqual({
      provider: 'lark',
      displayName: 'Feishu',
      icon: '/assets/images/destinations/feishu.png',
      order: 100,
      startUrl: '/api/lark-identity/login/start'
    })
  })
})
