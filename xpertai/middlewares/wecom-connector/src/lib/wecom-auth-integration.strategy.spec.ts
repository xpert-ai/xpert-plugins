import { WeComAuthIntegrationStrategy } from './wecom-auth-integration.strategy.js'
import { WECOM_CONNECTOR_ICON } from './types.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => () => undefined
}))

describe('WeComAuthIntegrationStrategy', () => {
  const strategy = new WeComAuthIntegrationStrategy()

  it('declares connector-owned credentials as a secret-backed integration', () => {
    expect(strategy.meta.name).toBe('wecom_auth')
    expect(strategy.meta.icon).toEqual({ type: 'svg', value: WECOM_CONNECTOR_ICON })
    expect(strategy.meta.schema).toEqual(
      expect.objectContaining({
        required: ['corpId', 'agentId', 'corpSecret'],
        secret: ['corpSecret']
      })
    )
  })

  it('normalizes valid credentials for storage', async () => {
    await expect(
      strategy.validateConfig({ corpId: ' corp-1 ', agentId: ' 1000002 ', corpSecret: ' secret-1 ' })
    ).resolves.toEqual({
      mode: 'oauth_app',
      options: { corpId: 'corp-1', agentId: '1000002', corpSecret: 'secret-1' }
    })
  })

  it('rejects incomplete credentials', async () => {
    await expect(strategy.validateConfig({ corpId: 'corp-1', agentId: '', corpSecret: 'secret-1' })).rejects.toThrow(
      'WeCom AgentID is required.'
    )
  })
})
