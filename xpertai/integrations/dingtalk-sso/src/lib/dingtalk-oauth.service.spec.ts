import {
  DINGTALK_AUTHORIZE_URL,
  DINGTALK_CURRENT_USER_URL,
  DINGTALK_USER_ACCESS_TOKEN_URL,
  DingTalkOAuthService
} from './dingtalk-oauth.service.js'

describe('DingTalkOAuthService', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.resetAllMocks()
  })

  function createService() {
    return new DingTalkOAuthService()
  }

  it('builds the documented DingTalk OAuth2 authorization URL', () => {
    const url = new URL(
      createService().buildAuthorizeUrl({
        clientId: 'ding-client',
        redirectUri: 'https://xpert.example.com/api/dingtalk-identity/callback',
        state: 'signed-state'
      })
    )

    expect(url.origin + url.pathname).toBe(DINGTALK_AUTHORIZE_URL)
    expect(url.searchParams.get('client_id')).toBe('ding-client')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://xpert.example.com/api/dingtalk-identity/callback'
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid')
    expect(url.searchParams.get('state')).toBe('signed-state')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })

  it('exchanges authCode through the userAccessToken endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accessToken: 'user-token' })
    })
    global.fetch = fetchMock as typeof fetch

    await expect(createService().exchangeCodeForAccessToken({
      clientId: 'ding-client',
      clientSecret: 'ding-secret',
      code: 'auth-code'
    })).resolves.toBe('user-token')
    expect(fetchMock).toHaveBeenCalledWith(
      DINGTALK_USER_ACCESS_TOKEN_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          clientId: 'ding-client',
          clientSecret: 'ding-secret',
          code: 'auth-code',
          grantType: 'authorization_code'
        })
      })
    )
  })

  it('loads the current user and normalizes DingTalk identity fields', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          unionId: 'union-1',
          openId: 'open-1',
          nick: 'Alice',
          avatarUrl: 'https://example.com/avatar.png'
        })
    })
    global.fetch = fetchMock as typeof fetch

    await expect(createService().fetchUserProfile('user-token')).resolves.toEqual({
      unionId: 'union-1',
      openId: 'open-1',
      name: 'Alice',
      avatarUrl: 'https://example.com/avatar.png'
    })
    expect(fetchMock).toHaveBeenCalledWith(
      DINGTALK_CURRENT_USER_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-acs-dingtalk-access-token': 'user-token'
        })
      })
    )
  })

  it('maps DingTalk HTTP errors to a stable OAuth error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: 'invalid token' })
    }) as typeof fetch

    await expect(createService().fetchUserProfile('bad-token')).rejects.toMatchObject({
      code: 'oauth_failed',
      message: 'invalid token'
    })
  })
})
