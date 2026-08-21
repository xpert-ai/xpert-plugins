jest.mock('@xpert-ai/plugin-sdk', () => ({
  SSOProviderStrategyKey: () => (target: unknown) => target
}))

import { DingTalkSsoProviderStrategy } from './dingtalk-sso-provider.strategy.js'

describe('DingTalkSsoProviderStrategy', () => {
  it('hides the provider until a tenant integration is configured', async () => {
    const strategy = new DingTalkSsoProviderStrategy({ findAvailable: jest.fn().mockResolvedValue(null) } as any)
    await expect(strategy.describe({ tenantId: 'tenant-1' } as any)).resolves.toBeNull()
  })

  it('returns a render-ready DingTalk descriptor', async () => {
    const strategy = new DingTalkSsoProviderStrategy({ findAvailable: jest.fn().mockResolvedValue({ id: 'integration-1' }) } as any)
    await expect(strategy.describe({ tenantId: 'tenant-1' } as any)).resolves.toEqual({
      provider: 'dingtalk-sso',
      displayName: 'DingTalk',
      icon: '/assets/images/destinations/dingtalk.svg',
      order: 105,
      startUrl: '/api/dingtalk-identity/login/start'
    })
  })
})
