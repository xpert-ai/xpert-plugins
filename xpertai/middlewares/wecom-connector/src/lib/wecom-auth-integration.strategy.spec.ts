import { WeComAuthIntegrationStrategy } from './wecom-auth-integration.strategy.js'
import { WECOM_AUTH_INTEGRATION_PROVIDER, WECOM_CONNECTOR_ICON } from './types.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => (target: object) => target
}))

describe('WeComAuthIntegrationStrategy', () => {
  it('declares the WeCom AI Bot system integration with the connector logo', () => {
    const strategy = new WeComAuthIntegrationStrategy()

    expect(strategy.meta).toEqual(
      expect.objectContaining({
        name: WECOM_AUTH_INTEGRATION_PROVIDER,
        icon: { type: 'svg', value: WECOM_CONNECTOR_ICON },
        schema: expect.objectContaining({
          required: ['botId', 'botSecret'],
          secret: ['botSecret']
        })
      })
    )
  })

  it('validates both Bot ID and Secret', async () => {
    const strategy = new WeComAuthIntegrationStrategy()

    await expect(strategy.validateConfig({ botId: 'bot-1', botSecret: 'secret-1' })).resolves.toEqual(
      expect.objectContaining({ mode: 'wecom-ai-bot' })
    )
    await expect(strategy.validateConfig({ botId: '', botSecret: 'secret-1' })).rejects.toThrow('Bot ID')
    await expect(strategy.validateConfig({ botId: 'bot-1', botSecret: '' })).rejects.toThrow('Secret')
  })
})
