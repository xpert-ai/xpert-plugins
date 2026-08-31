import {
  WECOM_AUTH_INTEGRATION_PROVIDER,
  WECOM_CLI_MANUAL_AUTH_METHOD,
  WECOM_CLI_QR_AUTH_METHOD,
  WECOM_QR_AUTHORIZATION_TTL_MS,
  WECOM_QR_GENERATE_URL,
  WECOM_QR_QUERY_URL,
  WECOM_QR_SOURCE
} from './types.js'
import { WeComConnectorStrategy } from './wecom-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE',
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('WeComConnectorStrategy', () => {
  afterEach(() => jest.restoreAllMocks())

  it('declares QR auth and routes manual credentials through a system integration', () => {
    const strategy = new WeComConnectorStrategy(pluginContext())
    expect(strategy.definition.provider).toBe('wecom')
    expect(strategy.definition.permissions).toEqual([
      expect.objectContaining({ key: 'wecom.ai_bot_credential', storage: 'platform_vault' })
    ])
    expect(strategy.definition.authMethods).toEqual([
      expect.objectContaining({ id: WECOM_CLI_QR_AUTH_METHOD, type: 'oauth2' }),
      expect.objectContaining({
        id: WECOM_CLI_MANUAL_AUTH_METHOD,
        type: 'api_key',
        credentials: expect.objectContaining({
          fields: [
            expect.objectContaining({
              name: 'integrationId',
              type: 'integration',
              provider: WECOM_AUTH_INTEGRATION_PROVIDER
            })
          ]
        })
      })
    ])
  })

  it('validates the selected system integration and stores only its ID in the connector credential', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ errcode: 0, token: 'bootstrap-token' }))
    const strategy = new WeComConnectorStrategy(
      pluginContext({
        read: jest.fn().mockResolvedValue({
          id: 'integration-1',
          provider: WECOM_AUTH_INTEGRATION_PROVIDER,
          options: { botId: 'bot-1', botSecret: 'secret-1' }
        })
      })
    )

    const result = await strategy.connect({
      authMethodId: WECOM_CLI_MANUAL_AUTH_METHOD,
      values: { integrationId: 'integration-1' }
    } as never)

    expect(result).toEqual({
      status: 'active',
      credential: {
        data: { integrationId: 'integration-1' },
        profile: { name: 'WeCom AI Bot', identityType: 'bot' }
      }
    })
    expect(JSON.stringify(result)).not.toContain('botSecret')
    const request = (global.fetch as jest.Mock).mock.calls[0]
    expect(request[0]).toBe('https://qyapi.weixin.qq.com/cgi-bin/aibot/cli/get_cli_config')
    expect(JSON.parse(request[1].body)).toEqual(expect.objectContaining({ bot_id: 'bot-1', bind_source: 1 }))
  })

  it('starts QR authorization and polls until the official CLI bot is returned', async () => {
    const now = Date.parse('2026-08-27T08:00:00.000Z')
    jest.spyOn(Date, 'now').mockReturnValue(now)
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: { scode: 'scode-1234', auth_url: 'https://qr.example/1' } }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { status: 'success', bot_info: { botid: 'bot-1', secret: 'secret-1' } } })
      )
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, token: 'bootstrap-token' }))
    const strategy = new WeComConnectorStrategy(pluginContext())

    const connected = await strategy.connect({
      authMethodId: WECOM_CLI_QR_AUTH_METHOD,
      redirectUri: 'unused',
      state: 'unused'
    })
    expect(connected.status).toBe('pending')
    if (connected.status !== 'pending') throw new Error('Expected pending QR connection')
    expect(connected.authorizationUrl).toBe('https://qr.example/1')
    expect(connected.metadata).toEqual(expect.objectContaining({ version: 1, scode: 'scode-1234' }))
    expect(Date.parse(String(connected.metadata?.expiresAt)) - Date.parse(String(connected.metadata?.issuedAt))).toBe(
      WECOM_QR_AUTHORIZATION_TTL_MS
    )

    const result = await strategy.pollConnection({
      authMethodId: WECOM_CLI_QR_AUTH_METHOD,
      metadata: connected.metadata,
      redirectUri: 'unused'
    })
    expect(result).toEqual({
      status: 'complete',
      credential: {
        data: { botId: 'bot-1', botSecret: 'secret-1' },
        profile: { name: 'WeCom AI Bot', identityType: 'bot' }
      }
    })
    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls[0][0]).toBe(`${WECOM_QR_GENERATE_URL}?source=${WECOM_QR_SOURCE}&plat=3`)
    expect(calls[1][0]).toBe(`${WECOM_QR_QUERY_URL}?scode=scode-1234`)
    expect(JSON.stringify(result)).toContain('botSecret')
  })

  it('rejects legacy application OAuth credentials with a reauthorization message', async () => {
    const strategy = new WeComConnectorStrategy(pluginContext())
    await expect(
      strategy.resolveRuntimeCredential({
        authMethodId: 'wecom-qr',
        credential: { data: { accessToken: 'old-token' } }
      } as never)
    ).rejects.toThrow('reauthorized')
  })

  it('resolves manual runtime credentials from the selected system integration', async () => {
    const strategy = new WeComConnectorStrategy(
      pluginContext({
        read: jest.fn().mockResolvedValue({
          id: 'integration-1',
          provider: WECOM_AUTH_INTEGRATION_PROVIDER,
          options: { botId: 'bot-1', botSecret: 'secret-1' }
        })
      })
    )

    await expect(
      strategy.resolveRuntimeCredential({
        authMethodId: WECOM_CLI_MANUAL_AUTH_METHOD,
        credential: { data: { integrationId: 'integration-1' } }
      } as never)
    ).resolves.toEqual({ botId: 'bot-1', botSecret: 'secret-1' })
  })
})

function pluginContext(integrationService?: Record<string, unknown>) {
  return {
    resolve: jest.fn().mockReturnValue(
      integrationService ?? {
        read: jest.fn(),
        findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
        findAllWithInheritance: jest.fn().mockResolvedValue({ items: [], total: 0 })
      }
    )
  } as never
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response
}
