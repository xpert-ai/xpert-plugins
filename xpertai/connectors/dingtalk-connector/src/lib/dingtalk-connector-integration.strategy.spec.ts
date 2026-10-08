import { DINGTALK_CONNECTOR_INTEGRATION_PROVIDER } from './constants.js'
import { DingTalkConnectorIntegrationStrategy } from './dingtalk-connector-integration.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => () => undefined
}))

describe('DingTalkConnectorIntegrationStrategy', () => {
  const secretService = {
    encrypt: jest.fn().mockReturnValue('enc:v1:encrypted-secret')
  }
  const strategy = new DingTalkConnectorIntegrationStrategy(secretService as never)

  it('declares connector-owned OAuth credentials', () => {
    expect(strategy.meta).toEqual(
      expect.objectContaining({
        name: DINGTALK_CONNECTOR_INTEGRATION_PROVIDER,
        icon: {
          type: 'image',
          value: expect.stringMatching(/^data:image\/svg\+xml;charset=utf-8,/),
          size: 24
        },
        schema: expect.objectContaining({
          required: ['clientId', 'clientSecret'],
          secret: ['clientSecret']
        })
      })
    )
    expect(strategy.meta.description).toEqual(expect.objectContaining({ zh_Hans: expect.stringContaining('组织级') }))
  })

  it('normalizes and encrypts the client secret for storage', async () => {
    await expect(strategy.validateConfig({ clientId: ' client-1 ', clientSecret: ' secret-1 ' })).resolves.toEqual({
      mode: 'oauth_app',
      options: { clientId: 'client-1', clientSecret: 'enc:v1:encrypted-secret' }
    })
    expect(secretService.encrypt).toHaveBeenCalledWith('secret-1')
  })

  it('stores an optional Robot Code for proactive message tools', async () => {
    await expect(
      strategy.validateConfig({ clientId: 'client-1', clientSecret: 'secret-1', robotCode: ' robot-1 ' })
    ).resolves.toEqual({
      mode: 'oauth_app',
      options: { clientId: 'client-1', clientSecret: 'enc:v1:encrypted-secret', robotCode: 'robot-1' }
    })
  })

  it('rejects incomplete credentials', async () => {
    await expect(strategy.validateConfig({ clientId: 'client-1', clientSecret: '' })).rejects.toThrow(
      'DingTalk OAuth Client Secret is required.'
    )
  })
})
