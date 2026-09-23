import { QqMailProtocolService } from './protocol/qq-mail-protocol.service.js'
import { QqMailIntegrationStrategy } from './qq-mail-integration.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => (target: object) => target
}))

describe('QqMailIntegrationStrategy', () => {
  it('declares the plugin-owned mailbox and secret authorization-code fields', () => {
    const strategy = createStrategy()

    expect(strategy.meta.name).toBe('qq-mail-imap-smtp')
    expect(strategy.meta.schema.required).toEqual(['email', 'authorizationCode'])
    expect(strategy.meta.schema.secret).toEqual(['authorizationCode'])
    expect(strategy.meta.schema.properties.authorizationCode['x-ui']).toEqual({ component: 'password' })
  })

  it('validates the normalized credential through both mail protocols', async () => {
    const verifyCredential = jest.fn().mockResolvedValue(undefined)
    const strategy = createStrategy(verifyCredential)

    await expect(
      strategy.validateConfig({ email: ' 123456@qq.com ', authorizationCode: 'abcd1234efgh5678' })
    ).resolves.toMatchObject({
      mode: 'imap-smtp',
      imap: { host: 'imap.qq.com', port: 993, secure: true },
      smtp: { host: 'smtp.qq.com', port: 465, secure: true }
    })
    expect(verifyCredential).toHaveBeenCalledWith({
      email: '123456@qq.com',
      authorizationCode: 'abcd1234efgh5678'
    })
  })
})

function createStrategy(verifyCredential = jest.fn()) {
  return new QqMailIntegrationStrategy({ verifyCredential } as unknown as QqMailProtocolService)
}
