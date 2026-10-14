import { GitHubConnectorStrategy, GitHubRequestError } from './github-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => () => undefined,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE'
}))

describe('GitHubConnectorStrategy', () => {
  const strategy = createStrategy([])

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('declares GitHub App OAuth and PAT authentication methods', () => {
    expect(strategy.definition.authMethods).toEqual([
      expect.objectContaining({
        id: 'github-app-oauth',
        type: 'oauth2',
        appCredentials: expect.objectContaining({
          help: expect.objectContaining({ url: '/settings/integration' })
        })
      }),
      expect.objectContaining({ id: 'pat', type: 'api_key' })
    ])
  })

  it('validates a PAT with GET /user and activates the connector', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(githubUser()))

    await expect(
      strategy.connect({
        authMethodId: 'pat',
        values: { token: 'github_pat_test' },
        redirectUri: 'https://xpert.test/api/connector/oauth/callback',
        state: 'state'
      })
    ).resolves.toEqual({
      status: 'active',
      credential: expect.objectContaining({
        data: {
          accessToken: 'github_pat_test',
          tokenType: 'bearer'
        },
        profile: expect.objectContaining({ name: 'The Octocat' })
      })
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer github_pat_test' })
      })
    )
  })

  it.each([401, 403])('rejects a PAT when GitHub returns %s', async (status) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ message: 'Bad credentials' }, status))

    await expect(
      strategy.connect({
        authMethodId: 'pat',
        values: { token: 'revoked' },
        redirectUri: 'https://xpert.test/callback',
        state: 'state'
      })
    ).rejects.toEqual(expect.objectContaining<Partial<GitHubRequestError>>({ status }))
  })

  it('rejects an empty PAT before calling GitHub', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')

    await expect(
      strategy.connect({
        authMethodId: 'pat',
        values: { token: ' ' },
        redirectUri: 'https://xpert.test/callback',
        state: 'state'
      })
    ).rejects.toThrow('GitHub personal access token is required')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('surfaces PAT network failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network unavailable'))

    await expect(
      strategy.connect({
        authMethodId: 'pat',
        values: { token: 'github_pat_test' },
        redirectUri: 'https://xpert.test/callback',
        state: 'state'
      })
    ).rejects.toThrow('network unavailable')
  })

  it('surfaces the underlying network failure code', async () => {
    const cause = Object.assign(new Error('Connect Timeout Error'), { code: 'UND_ERR_CONNECT_TIMEOUT' })
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed', { cause }))

    await expect(
      strategy.connect({
        authMethodId: 'pat',
        values: { token: 'github_pat_test' },
        redirectUri: 'https://xpert.test/callback',
        state: 'state'
      })
    ).rejects.toThrow('fetch failed (UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error)')
  })

  it('prefers a tenant GitHub integration when creating the authorization URL', async () => {
    const oauthStrategy = createStrategy([
      githubIntegration('organization-integration', 'organization-1', 'organization-client', 'organization-secret'),
      githubIntegration('tenant-integration', null, 'tenant-client', 'tenant-secret')
    ])

    const result = await oauthStrategy.connect({
      authMethodId: 'github-app-oauth',
      redirectUri: 'https://xpert.test/api/connector/oauth/callback',
      state: 'state-1'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') {
      throw new Error('Expected pending OAuth result')
    }
    const url = new URL(result.authorizationUrl)
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('tenant-client')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(result.metadata).toEqual(
      expect.objectContaining({
        integrationId: 'tenant-integration',
        codeVerifier: expect.any(String)
      })
    )
    expect(JSON.stringify(result.metadata)).not.toContain('tenant-secret')
  })

  it('uses the explicitly selected integration instead of the first inherited integration', async () => {
    const selected = createStrategy([
      githubIntegration('tenant-integration', null, 'tenant-client', 'tenant-secret'),
      githubIntegration('selected-integration', 'organization-1', 'selected-client', 'selected-secret')
    ])
    const result = await selected.connect({
      authMethodId: 'github-app-oauth',
      values: { integrationId: 'selected-integration' },
      redirectUri: 'https://xpert.test/api/connector/oauth/callback',
      state: 'state'
    })
    if (result.status !== 'pending') throw new Error('Expected OAuth authorization')
    expect(new URL(result.authorizationUrl).searchParams.get('client_id')).toBe('selected-client')
    expect(result.metadata?.integrationId).toBe('selected-integration')
  })

  it('does not fall back when an explicitly selected integration has been removed', async () => {
    const selected = createStrategy([githubIntegration('other', null, 'other-client', 'other-secret')])
    await expect(
      selected.connect({
        authMethodId: 'github-app-oauth',
        values: { integrationId: 'removed' },
        redirectUri: 'https://xpert.test/callback',
        state: 'state'
      })
    ).rejects.toThrow()
  })

  it('falls back to an organization GitHub integration', async () => {
    const oauthStrategy = createStrategy([
      githubIntegration('organization-integration', 'organization-1', 'organization-client', 'organization-secret')
    ])

    const result = await oauthStrategy.connect({
      authMethodId: 'github-app-oauth',
      redirectUri: 'https://xpert.test/api/connector/oauth/callback',
      state: 'state-organization'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') {
      throw new Error('Expected pending OAuth result')
    }
    expect(new URL(result.authorizationUrl).searchParams.get('client_id')).toBe('organization-client')
    expect(result.metadata?.integrationId).toBe('organization-integration')
  })

  it('asks the user to configure a system integration when neither scope has one', async () => {
    await expect(
      strategy.connect({
        authMethodId: 'github-app-oauth',
        redirectUri: 'https://xpert.test/api/connector/oauth/callback',
        state: 'state-missing'
      })
    ).rejects.toThrow('Configure a GitHub system integration at tenant or organization scope before connecting.')
  })

  it('keeps system integration secrets out of OAuth sessions and stored connector credentials', async () => {
    const oauthStrategy = createStrategy([
      githubIntegration('tenant-integration', null, 'tenant-client', 'tenant-secret')
    ])
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-1',
          token_type: 'bearer',
          expires_in: 28800,
          refresh_token: 'refresh-1',
          refresh_token_expires_in: 15897600
        })
      )
      .mockResolvedValueOnce(jsonResponse(githubUser()))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-2',
          token_type: 'bearer',
          expires_in: 28800,
          refresh_token: 'refresh-2',
          refresh_token_expires_in: 15897600
        })
      )

    const credential = await oauthStrategy.exchangeAuthorizationCode({
      authMethodId: 'github-app-oauth',
      metadata: { codeVerifier: 'verifier', integrationId: 'tenant-integration' },
      code: 'oauth-code',
      redirectUri: 'https://xpert.test/api/connector/oauth/callback'
    })
    expect(credential.data).toEqual({
      integrationId: 'tenant-integration',
      accessToken: 'access-1',
      tokenType: 'bearer',
      refreshToken: 'refresh-1'
    })
    expect(JSON.stringify(credential.data)).not.toContain('tenant-secret')
    expect(fetchSpy.mock.calls[0]?.[1]?.body?.toString()).toContain('client_id=tenant-client')
    expect(fetchSpy.mock.calls[0]?.[1]?.body?.toString()).toContain('client_secret=tenant-secret')

    const refreshed = await oauthStrategy.refreshConnectionCredential({
      authMethodId: 'github-app-oauth',
      credential
    })
    expect(refreshed.data).toEqual({
      integrationId: 'tenant-integration',
      accessToken: 'access-2',
      tokenType: 'bearer',
      refreshToken: 'refresh-2'
    })
    expect(JSON.stringify(refreshed.data)).not.toContain('tenant-secret')
    expect(fetchSpy.mock.calls[2]?.[1]?.body?.toString()).toContain('grant_type=refresh_token')
    expect(fetchSpy.mock.calls[2]?.[1]?.body?.toString()).toContain('client_secret=tenant-secret')

    const runtime = oauthStrategy.resolveRuntimeCredential({
      authMethodId: 'github-app-oauth',
      credential: refreshed
    })
    expect(runtime).toEqual({
      accessToken: 'access-2',
      tokenType: 'bearer',
      resource: 'https://api.githubcopilot.com/mcp/'
    })
    expect(JSON.stringify(runtime)).not.toContain('tenant-secret')
    expect(JSON.stringify(runtime)).not.toContain('refresh-2')
  })

  it('uses the persisted callback scope for an exact app lookup without inherited-request fallback', async () => {
    const readForConnector = jest
      .fn()
      .mockResolvedValue(githubIntegration('app', null, 'callback-client', 'callback-secret'))
    const findAllWithInheritance = jest.fn()
    const scoped = new GitHubConnectorStrategy({
      resolve: () => ({ readForConnector, findAllWithInheritance })
    } as never)
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', token_type: 'bearer' }))
      .mockResolvedValueOnce(jsonResponse(githubUser()))
    await scoped.exchangeAuthorizationCode({
      authMethodId: 'github-app-oauth',
      scope: { tenantId: 'original-tenant', organizationId: null },
      metadata: { integrationId: 'app', codeVerifier: 'verifier' },
      code: 'code',
      redirectUri: 'https://xpert.test/callback'
    })
    expect(readForConnector).toHaveBeenCalledWith('app', 'github', {
      tenantId: 'original-tenant',
      organizationId: null
    })
    expect(findAllWithInheritance).not.toHaveBeenCalled()
  })

  it('limits MCP credentials to the official GitHub MCP resource while retaining CLI token fields', () => {
    const runtime = strategy.resolveRuntimeCredential({
      authMethodId: 'pat',
      credential: { data: { accessToken: 'pat', tokenType: 'bearer' } }
    })
    expect(runtime).toEqual({ accessToken: 'pat', tokenType: 'bearer', resource: 'https://api.githubcopilot.com/mcp/' })
  })

  it('refreshes inline legacy credentials using their original application instead of another integration', async () => {
    const current = createStrategy([githubIntegration('other', null, 'other-client', 'other-secret')])
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ access_token: 'renewed', token_type: 'bearer' }))
    const refreshed = await current.refreshConnectionCredential({
      authMethodId: 'github-app-oauth',
      credential: {
        data: {
          clientId: 'original-client',
          clientSecret: 'original-secret',
          accessToken: 'old',
          refreshToken: 'refresh',
          tokenType: 'bearer'
        }
      }
    })
    expect(fetchSpy.mock.calls[0]?.[1]?.body?.toString()).toContain('client_id=original-client')
    expect(refreshed.data).toMatchObject({
      clientId: 'original-client',
      clientSecret: 'original-secret',
      accessToken: 'renewed'
    })
    expect(refreshed.data.integrationId).toBeUndefined()
  })

  it('migrates a legacy OAuth credential to the selected system integration during refresh', async () => {
    const oauthStrategy = createStrategy([
      githubIntegration('tenant-integration', null, 'tenant-client', 'tenant-secret')
    ])
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        access_token: 'access-migrated',
        token_type: 'bearer',
        refresh_token: 'refresh-migrated'
      })
    )

    await expect(
      oauthStrategy.refreshConnectionCredential({
        authMethodId: 'github-app-oauth',
        credential: {
          data: {
            accessToken: 'access-legacy',
            tokenType: 'bearer',
            refreshToken: 'refresh-legacy'
          }
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        data: {
          integrationId: 'tenant-integration',
          accessToken: 'access-migrated',
          tokenType: 'bearer',
          refreshToken: 'refresh-migrated'
        }
      })
    )
  })
})

function createStrategy(integrations: Array<Record<string, unknown>>) {
  const integrationPermissionService = {
    findAllWithInheritance: jest.fn(async (options?: { where?: { id?: string } }) => {
      const items = options?.where?.id
        ? integrations.filter((integration) => integration.id === options.where?.id)
        : integrations
      return { items, total: items.length }
    })
  }
  const pluginContext = {
    resolve: jest.fn(() => integrationPermissionService)
  }
  return new GitHubConnectorStrategy(pluginContext as never)
}

function githubIntegration(id: string, organizationId: string | null, clientId: string, clientSecret: string) {
  return {
    id,
    provider: 'github',
    organizationId,
    options: { clientId, clientSecret }
  }
}

function githubUser() {
  return {
    id: 1,
    login: 'octocat',
    name: 'The Octocat',
    email: 'octocat@github.com',
    avatar_url: 'https://github.com/images/error/octocat_happy.gif',
    html_url: 'https://github.com/octocat'
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
