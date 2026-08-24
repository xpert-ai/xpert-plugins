jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => (target: unknown) => target
}))

import { IntegrationFeatureEnum } from '@xpert-ai/contracts'
import { DingTalkSsoIntegrationStrategy } from './dingtalk-sso-integration.strategy.js'

describe('DingTalkSsoIntegrationStrategy', () => {
  it('declares an SSO system integration with secret fields', () => {
    const strategy = new DingTalkSsoIntegrationStrategy({ get: jest.fn() } as any, { encrypt: jest.fn() } as any)
    expect(strategy.meta.name).toBe('dingtalk-sso')
    expect(strategy.meta.features).toContain(IntegrationFeatureEnum.SSO)
    expect(strategy.meta.schema).toMatchObject({ required: ['clientId', 'clientSecret'], secret: ['clientSecret'] })
  })

  it('encrypts credentials and returns the public callback URL', async () => {
    const strategy = new DingTalkSsoIntegrationStrategy(
      { get: jest.fn().mockReturnValue('https://xpert.example.com') } as any,
      { encrypt: jest.fn().mockReturnValue('enc:v1:secret') } as any
    )
    await expect(strategy.validateConfig({ clientId: ' ding-client ', clientSecret: ' ding-secret ' })).resolves.toEqual({
      mode: 'oauth_app',
      callbackUrl: 'https://xpert.example.com/api/dingtalk-identity/callback',
      options: { clientId: 'ding-client', clientSecret: 'enc:v1:secret' }
    })
  })
})
