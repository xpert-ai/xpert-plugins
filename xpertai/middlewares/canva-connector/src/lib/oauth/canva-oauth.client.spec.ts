import { CANVA_MCP_CN_AUTHORIZE_URL, CANVA_MCP_CN_REVOKE_URL, CANVA_MCP_CN_TOKEN_URL } from '../constants.js'
import { CanvaOAuthClient, type CanvaOAuthApp } from './canva-oauth.client.js'

describe('CanvaOAuthClient', () => {
  const app: CanvaOAuthApp = {
    integrationId: 'integration-1',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    mode: 'mcp-cn'
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('builds an allowlisted MCP OAuth authorization request with PKCE', async () => {
    const result = await new CanvaOAuthClient().buildAuthorization(
      app,
      'https://xpert.example/api/connector/oauth/callback',
      'state-1'
    )
    const url = new URL(result.authorizationUrl)

    expect(url.origin + url.pathname).toBe(CANVA_MCP_CN_AUTHORIZE_URL)
    expect(url.searchParams.get('client_id')).toBe(app.clientId)
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(result.metadata).toEqual(
      expect.objectContaining({
        codeVerifier: expect.any(String),
        tokenEndpoint: CANVA_MCP_CN_TOKEN_URL,
        clientIdFingerprint: expect.any(String)
      })
    )
    expect(JSON.stringify(result.metadata)).not.toContain(app.clientSecret)
  })

  it('rejects changed pending OAuth endpoints before sending a token request', async () => {
    const client = new CanvaOAuthClient()
    const authorization = await client.buildAuthorization(
      app,
      'https://xpert.example/api/connector/oauth/callback',
      'state-1'
    )
    const fetchSpy = jest.spyOn(globalThis, 'fetch')

    await expect(
      client.exchangeCode({
        app,
        code: 'authorization-code',
        pending: { ...authorization.metadata, tokenEndpoint: 'https://untrusted.example/token' }
      })
    ).rejects.toMatchObject({ code: 'CANVA_OAUTH_STATE_INVALID' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('exchanges an authorization code only at the configured token endpoint', async () => {
    const client = new CanvaOAuthClient()
    const authorization = await client.buildAuthorization(
      app,
      'https://xpert.example/api/connector/oauth/callback',
      'state-1'
    )
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'design:meta:read design:content:read design:content:write asset:read'
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const token = await client.exchangeCode({ app, code: 'authorization-code', pending: authorization.metadata })

    expect(fetchSpy).toHaveBeenCalledWith(
      CANVA_MCP_CN_TOKEN_URL,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) })
      })
    )
    const request = fetchSpy.mock.calls[0][1] as RequestInit
    expect(request.body).toBeInstanceOf(URLSearchParams)
    expect((request.body as URLSearchParams).get('client_id')).toBeNull()
    expect((request.body as URLSearchParams).get('client_secret')).toBeNull()
    expect(token).toEqual(
      expect.objectContaining({ accessToken: 'access-token', refreshToken: 'refresh-token', expiresIn: 3600 })
    )
  })

  it('supports public PKCE clients without a client secret or Basic header', async () => {
    const client = new CanvaOAuthClient()
    const publicApp: CanvaOAuthApp = { clientId: 'public-client', clientAuthentication: 'none', mode: 'mcp-cn' }
    const authorization = await client.buildAuthorization(
      publicApp,
      'https://xpert.example/api/connector/oauth/callback',
      'state-public'
    )
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'access-token', scope: 'design:meta:read design:content:read design:content:write asset:read' }), { status: 200 })
    )

    await client.exchangeCode({ app: publicApp, code: 'authorization-code', pending: authorization.metadata })

    const request = fetchSpy.mock.calls[0][1] as RequestInit
    expect((request.headers as Record<string, string>).Authorization).toBeUndefined()
    expect((request.body as URLSearchParams).get('client_id')).toBe('public-client')
    expect((request.body as URLSearchParams).get('client_secret')).toBeNull()
  })

  it('revokes China MCP tokens at the discovered token endpoint', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))

    await new CanvaOAuthClient().revoke({
      endpoint: CANVA_MCP_CN_REVOKE_URL,
      accessToken: 'access-token',
      clientId: app.clientId,
      clientSecret: app.clientSecret
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      CANVA_MCP_CN_REVOKE_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) })
      })
    )
  })
})
