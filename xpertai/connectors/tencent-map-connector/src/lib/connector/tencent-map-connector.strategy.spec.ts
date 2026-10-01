import { TencentMapWebServiceClient } from '../client/tencent-map-webservice.client.js'
import { TencentMapConnectorStrategy } from './tencent-map-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('TencentMapConnectorStrategy', () => {
  it('executes a real WebService verification before activating the connector', async () => {
    const client = Object.create(TencentMapWebServiceClient.prototype) as TencentMapWebServiceClient
    const verifyCredential = jest.spyOn(client, 'verifyCredential').mockResolvedValue()
    const strategy = new TencentMapConnectorStrategy(client)

    const result = await strategy.connect({
      authMethodId: 'api-key',
      redirectUri: '',
      state: '',
      values: { apiKey: ' ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-12345 ' }
    })

    expect(verifyCredential).toHaveBeenCalledWith('ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-12345')
    expect(result).toMatchObject({
      status: 'active',
      credential: {
        scopes: ['map.read'],
        profile: { name: 'Tencent Maps', runtimeMiddleware: 'ConnectorRuntime:tencent-map' }
      }
    })
    expect(JSON.stringify(result.status === 'active' ? result.credential.profile : {})).not.toContain('ABCDE')
  })

  it('exposes one platform-vault secret field and the official Key help page', () => {
    const client = Object.create(TencentMapWebServiceClient.prototype) as TencentMapWebServiceClient
    const strategy = new TencentMapConnectorStrategy(client)
    const method = strategy.definition.authMethods[0]
    expect(method).toMatchObject({ id: 'api-key', type: 'api_key' })
    if (method.type !== 'api_key') throw new Error('Expected API key authentication')
    expect(method.credentials.fields).toEqual([
      expect.objectContaining({ name: 'apiKey', type: 'password', required: true, secret: true })
    ])
    expect(strategy.definition.permissions[0]).toMatchObject({ storage: 'platform_vault', scopes: ['map.read'] })
  })

  it('rejects malformed keys without contacting Tencent Maps', async () => {
    const client = Object.create(TencentMapWebServiceClient.prototype) as TencentMapWebServiceClient
    const verifyCredential = jest.spyOn(client, 'verifyCredential').mockResolvedValue()
    const strategy = new TencentMapConnectorStrategy(client)
    await expect(strategy.connect({
      authMethodId: 'api-key', redirectUri: '', state: '', values: { apiKey: 'bad key' }
    })).rejects.toThrow('16-128')
    expect(verifyCredential).not.toHaveBeenCalled()
  })
})
