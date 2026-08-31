import {
  WECOM_CLI_QR_AUTH_METHOD,
  WECOM_QR_AUTHORIZATION_TTL_MS,
  WECOM_QR_GENERATE_URL,
  WECOM_QR_QUERY_URL,
  WECOM_QR_SOURCE
} from './types.js'
import { WeComConnectorStrategy } from './wecom-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('WeComConnectorStrategy', () => {
  afterEach(() => jest.restoreAllMocks())

  it('declares QR authentication as the only connection method', () => {
    const strategy = new WeComConnectorStrategy()
    expect(strategy.definition.provider).toBe('wecom')
    expect(strategy.definition.permissions).toEqual([
      expect.objectContaining({ key: 'wecom.ai_bot_credential', storage: 'platform_vault' })
    ])
    expect(strategy.definition.authMethods).toEqual([
      expect.objectContaining({
        id: WECOM_CLI_QR_AUTH_METHOD,
        type: 'oauth2',
        authorizationPresentation: {
          mode: 'embedded_qr',
          title: { en_US: 'Connect WeCom intelligent robot', zh_Hans: '接入企业微信智能机器人' },
          description: {
            en_US: 'Use WeCom to scan the QR code and complete authorization.',
            zh_Hans: '请使用企业微信扫描二维码完成授权配置。'
          },
          ariaLabel: { en_US: 'WeCom authorization QR code', zh_Hans: '企业微信授权二维码' },
          completionHint: {
            en_US: 'The dialog will close automatically after authorization.',
            zh_Hans: '扫码完成后页面将自动关闭。'
          },
          cancelLabel: { en_US: 'Cancel authorization', zh_Hans: '取消授权' },
          copyLinkLabel: { en_US: 'Copy link', zh_Hans: '复制链接' },
          copyLinkError: {
            en_US: 'Could not copy authorization link.',
            zh_Hans: '无法复制授权链接。'
          }
        }
      })
    ])
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
    const strategy = new WeComConnectorStrategy()

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
    const strategy = new WeComConnectorStrategy()
    await expect(
      strategy.resolveRuntimeCredential({
        authMethodId: 'wecom-qr',
        credential: { data: { accessToken: 'old-token' } }
      } as never)
    ).rejects.toThrow('reauthorized')
  })

  it('rejects the removed manual credential authentication method', async () => {
    const strategy = new WeComConnectorStrategy()
    await expect(
      strategy.resolveRuntimeCredential({
        authMethodId: 'wecom-cli-manual',
        credential: { data: { botId: 'bot-1', botSecret: 'secret-1' } }
      } as never)
    ).rejects.toThrow('Unsupported')
  })
})

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response
}
