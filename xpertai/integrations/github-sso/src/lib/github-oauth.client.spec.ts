import { fetch, Response } from 'undici'
import { GITHUB_ACCESS_TOKEN_URL, GITHUB_API_URL } from './constants.js'
import { GitHubOAuthClient } from './github-oauth.client.js'
import { GitHubSsoError } from './github-sso.error.js'

jest.mock('undici', () => {
  const actual = jest.requireActual<typeof import('undici')>('undici')
  return {
    ...actual,
    fetch: jest.fn()
  }
})

describe('GitHubOAuthClient', () => {
  const client = new GitHubOAuthClient()
  const fetchMock = jest.mocked(fetch)

  afterEach(() => {
    fetchMock.mockReset()
    jest.restoreAllMocks()
  })

  it('builds GitHub authorization with user:email and PKCE S256', () => {
    const pkce = client.createPkce()
    const url = new URL(
      client.buildAuthorizeUrl({
        clientId: 'client-id',
        redirectUri: 'https://xpert.example.com/api/github-identity/callback',
        state: 'signed-state',
        codeChallenge: pkce.challenge
      })
    )

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('scope')).toBe('user:email')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toHaveLength(43)
    expect(pkce.verifier).toHaveLength(43)
  })

  it('exchanges the code with the PKCE verifier and returns only the token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'ephemeral-token', token_type: 'bearer' }))

    await expect(
      client.exchangeCode(
        {
          id: 'integration-1',
          tenantId: 'tenant-1',
          clientId: 'client-id',
          clientSecret: 'client-secret'
        },
        {
          code: 'oauth-code',
          redirectUri: 'https://xpert.example.com/api/github-identity/callback',
          codeVerifier: 'code-verifier'
        }
      )
    ).resolves.toBe('ephemeral-token')

    expect(fetchMock).toHaveBeenCalledWith(
      GITHUB_ACCESS_TOKEN_URL,
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
        signal: expect.any(AbortSignal)
      })
    )
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body
    expect(requestBody?.toString()).toContain('client_secret=client-secret')
    expect(requestBody?.toString()).toContain('code_verifier=code-verifier')
  })

  it('uses the configured HTTPS proxy for the OAuth token request', async () => {
    const originalHttpsProxy = process.env.HTTPS_PROXY
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7897'
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'ephemeral-token', token_type: 'bearer' }))

    try {
      await client.exchangeCode(
        {
          id: 'integration-1',
          tenantId: 'tenant-1',
          clientId: 'client-id',
          clientSecret: 'client-secret'
        },
        {
          code: 'oauth-code',
          redirectUri: 'https://xpert.example.com/api/github-identity/callback',
          codeVerifier: 'code-verifier'
        }
      )

      expect(fetchMock).toHaveBeenCalledWith(
        GITHUB_ACCESS_TOKEN_URL,
        expect.objectContaining({
          dispatcher: expect.anything()
        })
      )
    } finally {
      if (originalHttpsProxy === undefined) {
        delete process.env.HTTPS_PROXY
      } else {
        process.env.HTTPS_PROXY = originalHttpsProxy
      }
    }
  })

  it('maps an outbound request timeout to a stable OAuth error', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout')
    timeoutError.name = 'TimeoutError'
    fetchMock.mockRejectedValue(timeoutError)

    await expect(
      client.exchangeCode(
        {
          id: 'integration-1',
          tenantId: 'tenant-1',
          clientId: 'client-id',
          clientSecret: 'client-secret'
        },
        {
          code: 'oauth-code',
          redirectUri: 'https://xpert.example.com/api/github-identity/callback',
          codeVerifier: 'code-verifier'
        }
      )
    ).rejects.toMatchObject<Partial<GitHubSsoError>>({
      code: 'oauth_failed',
      message: 'Unable to reach GitHub OAuth.'
    })
  })

  it('selects only the primary verified email after loading the user', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: 12345,
          login: 'octocat',
          name: 'The Octocat',
          avatar_url: 'https://avatars.example/octocat',
          html_url: 'https://github.com/octocat'
        })
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            email: 'secondary@example.com',
            primary: false,
            verified: true
          },
          {
            email: ' OctoCat@Example.com ',
            primary: true,
            verified: true
          }
        ])
      )

    await expect(client.fetchVerifiedProfile('ephemeral-token')).resolves.toEqual({
      id: 12345,
      login: 'octocat',
      name: 'The Octocat',
      email: 'octocat@example.com',
      avatarUrl: 'https://avatars.example/octocat',
      profileUrl: 'https://github.com/octocat'
    })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${GITHUB_API_URL}/user`,
      `${GITHUB_API_URL}/user/emails`
    ])
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        authorization: 'Bearer ephemeral-token'
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${GITHUB_API_URL}/user`,
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${GITHUB_API_URL}/user/emails`,
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('rejects login without a primary verified email', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 12345, login: 'octocat' })).mockResolvedValueOnce(
      jsonResponse([
        {
          email: 'private@example.com',
          primary: true,
          verified: false
        }
      ])
    )

    await expect(client.fetchVerifiedProfile('ephemeral-token')).rejects.toMatchObject<Partial<GitHubSsoError>>({
      code: 'verified_email_missing'
    })
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  })
}
