import { BaiduNetdiskConnectorError } from '../errors.js'
import { BaiduNetdiskOAuthClient } from './baidu-netdisk-oauth.client.js'
import type { BaiduNetdiskOAuthConfig } from '../plugin-config.js'

const config: BaiduNetdiskOAuthConfig = {
  appKey: 'app-key',
  secretKey: 'secret-key',
  authorizationUrl: 'https://openapi.baidu.com/oauth/2.0/authorize',
  tokenUrl: 'https://openapi.baidu.com/oauth/2.0/token',
  apiBaseUrl: 'https://pan.baidu.com',
  uploadBaseUrl: 'https://d.pcs.baidu.com',
  scopes: ['basic', 'netdisk'],
  timeoutMs: 5_000,
  responseMaxBytes: 8_192
}

describe('Baidu Netdisk OAuth client', () => {
  afterEach(() => jest.restoreAllMocks())

  it('builds a direct authorization URL for end users', () => {
    const url = new URL(
      new BaiduNetdiskOAuthClient().buildAuthorizationUrl(config, {
        redirectUri: 'https://xpert.example/callback',
        state: 'opaque-state',
        scopes: ['basic', 'netdisk']
      })
    )
    expect(url.searchParams.get('client_id')).toBe('app-key')
    expect(url.searchParams.get('redirect_uri')).toBe('https://xpert.example/callback')
    expect(url.searchParams.get('state')).toBe('opaque-state')
    expect(url.searchParams.get('qrcode')).toBe('1')
  })

  it('exchanges a code and keeps the rotated refresh token', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh-2',
          expires_in: 3_600,
          refresh_token_expires_in: 7_200,
          uid: 'u1'
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    const token = await new BaiduNetdiskOAuthClient().exchangeCode(config, 'code', 'https://xpert.example/callback')
    expect(token).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh-2',
      expiresIn: 3_600,
      refreshExpiresIn: 7_200,
      tokenType: 'bearer',
      userId: 'u1'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('grant_type=authorization_code')
  })

  it('rejects malformed token responses', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ access_token: 'only-access' }), { status: 200 }))
    await expect(
      new BaiduNetdiskOAuthClient().exchangeCode(config, 'code', 'https://xpert.example/callback')
    ).rejects.toBeInstanceOf(BaiduNetdiskConnectorError)
  })
})
