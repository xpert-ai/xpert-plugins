jest.mock('@xpert-ai/plugin-sdk', () => ({
  SSOProviderStrategyKey: () => (target: unknown) => target
}))

import { LarkSSOProviderStrategy } from './lark-sso-provider.strategy.js'

describe('LarkSSOProviderStrategy', () => {
  it('returns null when required config is missing', () => {
    const strategy = new LarkSSOProviderStrategy({
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
    const strategy = new LarkSSOProviderStrategy({
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
