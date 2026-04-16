import { LarkOAuthService } from './lark-oauth.service.js'

describe('LarkOAuthService', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.resetAllMocks()
  })

  function createService() {
    return new LarkOAuthService({
      appId: 'cli_xxx',
      appSecret: 'secret_xxx'
    } as any)
  }

  it('exchanges code for access token via v2 oauth token endpoint with JSON body', async () => {
    const payload = {
      code: 0,
      access_token: 'user-access-token'
    }
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(payload),
      json: async () => payload
    })
    global.fetch = fetchMock as typeof fetch

    const service = createService()
    const accessToken = await service.exchangeCodeForAccessToken({
      code: 'oauth-code',
      redirectUri: 'http://localhost:4200/api/lark-identity/callback'
    })

    expect(accessToken).toBe('user-access-token')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          accept: 'application/json',
          'content-type': 'application/json; charset=utf-8'
        }),
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: 'oauth-code',
          client_id: 'cli_xxx',
          client_secret: 'secret_xxx',
          redirect_uri: 'http://localhost:4200/api/lark-identity/callback'
        })
      })
    )
  })

  it('builds authorize url with the documented accounts.feishu.cn origin', () => {
    const service = createService()

    const authorizeUrl = service.buildAuthorizeUrl({
      redirectUri: 'http://localhost:4200/api/lark-identity/callback',
      state: 'signed-state'
    })

    expect(authorizeUrl.startsWith('https://accounts.feishu.cn/open-apis/authen/v1/authorize?')).toBe(true)
    const url = new URL(authorizeUrl)
    expect(url.searchParams.get('app_id')).toBe('cli_xxx')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4200/api/lark-identity/callback'
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('signed-state')
  })
})
