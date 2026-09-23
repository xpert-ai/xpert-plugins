import { AmapWebServiceClient } from '../client/amap-webservice.client.js'
import { AmapConnectorStrategy } from './amap-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('AmapConnectorStrategy', () => {
  it('verifies the Key and optional private key before activating the connector', async () => {
    const client = Object.create(AmapWebServiceClient.prototype) as AmapWebServiceClient
    const verifyCredential = jest.spyOn(client, 'verifyCredential').mockResolvedValue()
    const strategy = new AmapConnectorStrategy(client)

    const result = await strategy.connect({
      authMethodId: 'api-key',
      redirectUri: '',
      state: '',
      values: { apiKey: ' amap-key-12345678 ', privateKey: ' private-key-87654321 ' }
    })

    expect(verifyCredential).toHaveBeenCalledWith({
      apiKey: 'amap-key-12345678',
      privateKey: 'private-key-87654321'
    })
    expect(result).toMatchObject({
      status: 'active',
      credential: {
        scopes: ['map.read'],
        profile: { name: 'AMap', runtimeMiddleware: 'ConnectorRuntime:amap' }
      }
    })
    expect(JSON.stringify(result.status === 'active' ? result.credential.profile : {})).not.toContain('12345678')
  })

  it('declares platform-vault secret fields and the official help page', () => {
    const client = Object.create(AmapWebServiceClient.prototype) as AmapWebServiceClient
    const strategy = new AmapConnectorStrategy(client)
    const method = strategy.definition.authMethods[0]
    expect(method).toMatchObject({ id: 'api-key', type: 'api_key' })
    if (method.type !== 'api_key') throw new Error('Expected API key authentication')
    expect(method.credentials.fields).toEqual([
      expect.objectContaining({ name: 'apiKey', type: 'password', required: true, secret: true }),
      expect.objectContaining({ name: 'privateKey', type: 'password', required: false, secret: true })
    ])
    expect(method.credentials.help?.url).toContain('lbs.amap.com')
    expect(strategy.definition.permissions[0]).toMatchObject({ storage: 'platform_vault', scopes: ['map.read'] })
  })

  it('rejects malformed secrets without contacting AMap', async () => {
    const client = Object.create(AmapWebServiceClient.prototype) as AmapWebServiceClient
    const verifyCredential = jest.spyOn(client, 'verifyCredential').mockResolvedValue()
    const strategy = new AmapConnectorStrategy(client)

    await expect(strategy.connect({
      authMethodId: 'api-key', redirectUri: '', state: '', values: { apiKey: 'bad key' }
    })).rejects.toMatchObject({ code: 'CONFIGURATION_INVALID' })
    expect(verifyCredential).not.toHaveBeenCalled()
  })
})
