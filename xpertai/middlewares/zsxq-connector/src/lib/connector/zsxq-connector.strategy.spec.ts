import { ZsxqConnectorError } from '../errors.js'
import { ZSXQ_AUTH_METHOD_ID } from '../constants.js'
import { ZsxqConnectorStrategy } from './zsxq-connector.strategy.js'
import type { ZsxqCliService } from '../cli/zsxq-cli.service.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('ZsxqConnectorStrategy', () => {
  it('starts device authorization and stores only an opaque handle in credential data', async () => {
    const cli = Object.create(null) as ZsxqCliService
    cli.startAuthorization = jest.fn().mockResolvedValue({
      handle: 'opaque-handle',
      authorizationUrl: 'https://garden.zsxq.com/device?code=ABCD',
      expiresAt: '2026-09-02T00:10:00.000Z',
      pollIntervalSeconds: 5
    })
    const strategy = new ZsxqConnectorStrategy(cli, { enableWrites: false })
    const started = await strategy.connect({ authMethodId: ZSXQ_AUTH_METHOD_ID, redirectUri: '', state: '' })
    expect(started).toMatchObject({ status: 'pending', authorizationUrl: 'https://garden.zsxq.com/device?code=ABCD' })
    expect(JSON.stringify(started)).not.toContain('token')
  })

  it('polls and exposes a minimal account profile', async () => {
    const cli = Object.create(null) as ZsxqCliService
    cli.pollAuthorization = jest.fn().mockResolvedValue({ status: 'complete', profile: { id: '42', name: 'Alice' } })
    const strategy = new ZsxqConnectorStrategy(cli, { enableWrites: true })
    const result = await strategy.pollConnection({
      authMethodId: ZSXQ_AUTH_METHOD_ID,
      redirectUri: '',
      metadata: {
        version: 1,
        handle: 'opaque-handle',
        expiresAt: '2026-09-02T00:10:00.000Z'
      }
    })
    expect(result).toMatchObject({
      status: 'complete',
      credential: {
        data: { connectionHandle: 'opaque-handle', transport: 'cli' },
        scopes: ['zsxq.read', 'zsxq.write'],
        profile: { id: '42', name: 'Alice' }
      }
    })
  })

  it('rejects unknown auth methods and malformed runtime credentials', () => {
    const cli = Object.create(null) as ZsxqCliService
    const strategy = new ZsxqConnectorStrategy(cli, { enableWrites: false })
    expect(() => strategy.resolveRuntimeCredential({ authMethodId: 'api-key', credential: { data: {} } })).toThrow(
      ZsxqConnectorError
    )
  })
})
