jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => (target: object) => target
}))

import { BaiduNetdiskIntegrationStrategy } from './baidu-netdisk-integration.strategy.js'

describe('BaiduNetdiskIntegrationStrategy', () => {
  it('exposes AppKey and SecretKey only through tenant System Integration', async () => {
    const strategy = new BaiduNetdiskIntegrationStrategy()
    expect(strategy.meta.name).toBe('baidu-netdisk-oauth')
    expect(strategy.meta.schema?.required).toEqual(['appKey', 'secretKey'])
    expect(strategy.meta.schema?.secret).toEqual(['secretKey'])
    await expect(
      strategy.validateConfig?.({ appKey: 'app-key', secretKey: 'secret-key' }, { organizationId: 'org-1' } as never)
    ).rejects.toThrow('tenant scope')
  })

  it('validates tenant credentials and applies default scopes', async () => {
    const result = await new BaiduNetdiskIntegrationStrategy().validateConfig?.(
      { appKey: 'app-key', secretKey: 'secret-key' },
      { organizationId: undefined } as never
    )
    expect(result).toMatchObject({ mode: 'oauth', probe: { state: 'configured' }, scopes: ['basic', 'netdisk'] })
  })
})
