import { CTRIP_WENDAO_ICON } from './branding.js'
import { CtripWendaoClient } from './ctrip-wendao.client.js'
import { CtripWendaoConnectorStrategy } from './ctrip-wendao-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('CtripWendaoConnectorStrategy', () => {
  it('validates the token before returning an active credential payload', async () => {
    const client = new CtripWendaoClient()
    const validateCredential = jest.spyOn(client, 'validateCredential').mockResolvedValue()
    const strategy = new CtripWendaoConnectorStrategy(client)

    const result = await strategy.connect({
      authMethodId: 'api-token',
      redirectUri: '',
      state: '',
      values: { apiToken: ' server-secret ' }
    })

    expect(validateCredential).toHaveBeenCalledWith('server-secret')
    expect(result).toMatchObject({
      status: 'active',
      credential: {
        data: { apiToken: 'server-secret' },
        scopes: ['travel.query'],
        profile: { name: 'Ctrip Wendao', runtimeMiddleware: 'ConnectorRuntime:ctrip-wendao' }
      }
    })
    if (result.status !== 'active') throw new Error('Expected active connector state')
    expect(JSON.stringify(result.credential.profile)).not.toContain('server-secret')
  })

  it('exposes one secret API Token field and the official application portal', () => {
    const strategy = new CtripWendaoConnectorStrategy(new CtripWendaoClient())
    const method = strategy.definition.authMethods[0]

    expect(strategy.definition.icon).toBe(CTRIP_WENDAO_ICON)
    expect(method).toMatchObject({ id: 'api-token', type: 'api_key' })
    if (method.type !== 'api_key') throw new Error('Expected API key authentication method')
    expect(method.credentials.fields).toEqual([
      expect.objectContaining({ name: 'apiToken', type: 'password', required: true, secret: true })
    ])
    expect(method.credentials.help?.url).toBe('https://www.ctrip.com/wendao/openclaw')
  })

  it('rejects unsupported authentication methods before verification', async () => {
    const client = new CtripWendaoClient()
    const validateCredential = jest.spyOn(client, 'validateCredential').mockResolvedValue()
    const strategy = new CtripWendaoConnectorStrategy(client)

    await expect(
      strategy.connect({ authMethodId: 'oauth2', redirectUri: '', state: '', values: { apiToken: 'server-secret' } })
    ).rejects.toMatchObject({ code: 'WENDAO_AUTH_INVALID' })
    expect(validateCredential).not.toHaveBeenCalled()
  })
})
