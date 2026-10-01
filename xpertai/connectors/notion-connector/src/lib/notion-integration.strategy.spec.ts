import { NotionIntegrationStrategy } from './notion-integration.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => (target: object) => target
}))

describe('NotionIntegrationStrategy', () => {
  it('declares the Public OAuth application form in System Integration', () => {
    const strategy = new NotionIntegrationStrategy()
    expect(strategy.meta.name).toBe('notion')
    expect(strategy.meta.schema).toEqual(
      expect.objectContaining({
        required: ['clientId', 'clientSecret'],
        secret: ['clientSecret']
      })
    )
    expect(strategy.meta.icon).toEqual(
      expect.objectContaining({
        type: 'image',
        size: 32,
        value: expect.stringMatching(/^data:image\/svg\+xml;base64,/)
      })
    )
  })

  it('validates both OAuth application credentials without returning secrets', async () => {
    const strategy = new NotionIntegrationStrategy()
    await expect(strategy.validateConfig({ clientId: 'client-id', clientSecret: 'client-secret' })).resolves.toEqual(
      expect.objectContaining({ mode: 'public-oauth', probe: expect.objectContaining({ state: 'configured' }) })
    )
    await expect(strategy.validateConfig({ clientId: '', clientSecret: 'client-secret' })).rejects.toThrow(
      'Notion OAuth Client ID is required.'
    )
  })
})
