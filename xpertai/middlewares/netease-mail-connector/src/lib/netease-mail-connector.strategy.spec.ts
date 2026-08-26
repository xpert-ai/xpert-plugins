import { NeteaseMailConnectorStrategy } from './netease-mail-connector.strategy.js'
import { NeteaseMailService } from './netease-mail.service.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('NeteaseMailConnectorStrategy', () => {
  it('verifies IMAP and SMTP before returning an active encrypted credential payload', async () => {
    const service = Object.create(NeteaseMailService.prototype) as NeteaseMailService
    const verifyCredential = jest.spyOn(service, 'verifyCredential').mockResolvedValue()
    const strategy = new NeteaseMailConnectorStrategy(service)

    const result = await strategy.connect({
      authMethodId: 'authorization-code',
      redirectUri: '',
      state: '',
      values: {
        email: 'User@163.COM',
        authorizationCode: ' client-auth-code '
      }
    })

    expect(verifyCredential).toHaveBeenCalledWith({
      email: 'User@163.com',
      authorizationCode: 'client-auth-code',
      providerPreset: '163'
    })
    expect(result).toMatchObject({
      status: 'active',
      credential: {
        scopes: ['mail.read', 'mail.write'],
        profile: {
          email: 'User@163.com',
          providerPreset: '163',
          runtimeMiddleware: 'ConnectorRuntime:netease-mail'
        }
      }
    })
    if (result.status !== 'active') {
      throw new Error('Expected active connector state')
    }
    expect(JSON.stringify(result.credential.profile)).not.toContain('client-auth-code')
  })

  it('rejects unsupported providers before verification', async () => {
    const service = Object.create(NeteaseMailService.prototype) as NeteaseMailService
    const verifyCredential = jest.spyOn(service, 'verifyCredential').mockResolvedValue()
    const strategy = new NeteaseMailConnectorStrategy(service)

    await expect(
      strategy.connect({
        authMethodId: 'authorization-code',
        redirectUri: '',
        state: '',
        values: { email: 'user@example.com', authorizationCode: 'client-auth-code' }
      })
    ).rejects.toThrow('MAIL_PROVIDER_UNSUPPORTED')
    expect(verifyCredential).not.toHaveBeenCalled()
  })

  it('exposes the WorkBuddy-style authorization fields and secret handling', () => {
    const service = Object.create(NeteaseMailService.prototype) as NeteaseMailService
    const strategy = new NeteaseMailConnectorStrategy(service)
    const method = strategy.definition.authMethods[0]

    expect(method).toMatchObject({ id: 'authorization-code', type: 'api_key' })
    if (method.type !== 'api_key') {
      throw new Error('Expected API key authentication method')
    }
    expect(method.credentials.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'email', type: 'text', required: true }),
        expect.objectContaining({ name: 'authorizationCode', type: 'password', required: true, secret: true })
      ])
    )
  })
})
