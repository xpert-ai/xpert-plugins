import {
  QQ_MAIL_AUTHORIZATION_METADATA_URL,
  QQ_MAIL_REGISTRATION_URL,
  QQ_MAIL_RESOURCE_METADATA_URL,
  QQ_MAIL_TOKEN_URL
} from '../constants.js'
import { QqMailOAuthClient } from './qq-mail-oauth.client.js'

describe('QqMailOAuthClient', () => {
  afterEach(() => jest.restoreAllMocks())

  it('discovers pinned endpoints and dynamically registers a public PKCE client', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === QQ_MAIL_RESOURCE_METADATA_URL) {
        return jsonResponse({
          resource: 'https://api.mail.qq.com',
          authorization_servers: ['https://wx.mail.qq.com'],
          scopes_supported: ['alias:read', 'mail:read', 'mail:send', 'mail:delete']
        })
      }
      if (url === QQ_MAIL_AUTHORIZATION_METADATA_URL) {
        return jsonResponse({
          issuer: 'https://wx.mail.qq.com',
          authorization_endpoint: 'https://wx.mail.qq.com/oauth/authorize',
          token_endpoint: 'https://wx.mail.qq.com/oauth/token',
          registration_endpoint: 'https://wx.mail.qq.com/oauth/register',
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256']
        })
      }
      expect(url).toBe(QQ_MAIL_REGISTRATION_URL)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).toMatchObject({
        redirect_uris: ['https://xpert.example/api/connector/oauth/callback'],
        token_endpoint_auth_method: 'none'
      })
      expect(body).not.toHaveProperty('client_secret')
      return jsonResponse({ client_id: 'xpert-client-id' }, 201)
    })

    const client = new QqMailOAuthClient()
    const metadata = await client.discover()
    await expect(client.registerClient(metadata, 'https://xpert.example/api/connector/oauth/callback')).resolves.toBe(
      'xpert-client-id'
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('rejects metadata that points token exchange outside the pinned QQ Mail endpoint', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          resource: 'https://api.mail.qq.com',
          authorization_servers: ['https://wx.mail.qq.com'],
          scopes_supported: ['alias:read', 'mail:read', 'mail:send']
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          issuer: 'https://wx.mail.qq.com',
          authorization_endpoint: 'https://wx.mail.qq.com/oauth/authorize',
          token_endpoint: 'https://evil.example/token',
          registration_endpoint: 'https://wx.mail.qq.com/oauth/register',
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256']
        })
      )

    await expect(new QqMailOAuthClient().discover()).rejects.toThrow('unexpected token endpoint')
  })

  it('exchanges an authorization code without a client secret', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      expect(String(input)).toBe(QQ_MAIL_TOKEN_URL)
      const body = new URLSearchParams(String(init?.body))
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('code_verifier')).toBe('verifier')
      expect(body.get('resource')).toBe('https://api.mail.qq.com')
      expect(body.has('client_secret')).toBe(false)
      return jsonResponse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'alias:read mail:read mail:send'
      })
    })

    await expect(
      new QqMailOAuthClient().exchangeCode({
        tokenEndpoint: QQ_MAIL_TOKEN_URL,
        clientId: 'client-id',
        code: 'authorization-code',
        codeVerifier: 'verifier',
        redirectUri: 'https://xpert.example/api/connector/oauth/callback'
      })
    ).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scopes: ['alias:read', 'mail:read', 'mail:send']
    })
  })

  it('allows HTTP callbacks only for loopback development', async () => {
    const client = new QqMailOAuthClient()
    const metadata = {
      resource: 'https://api.mail.qq.com',
      authorizationEndpoint: 'https://wx.mail.qq.com/oauth/authorize',
      tokenEndpoint: 'https://wx.mail.qq.com/oauth/token',
      registrationEndpoint: 'https://wx.mail.qq.com/oauth/register'
    }
    await expect(client.registerClient(metadata, 'http://xpert.example/callback')).rejects.toThrow('must use HTTPS')
  })
})

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
