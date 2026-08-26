import {
  DINGTALK_CONNECTOR_AUTHORIZE_URL,
  DINGTALK_CONNECTOR_PROVIDER,
  DINGTALK_CONNECTOR_TOKEN_URL,
  DINGTALK_CONNECTOR_USER_INFO_URL,
  DingTalkConnectorStrategy
} from './dingtalk-connector.strategy.js'
import { DINGTALK_CONNECTOR_INTEGRATION_PROVIDER, DINGTALK_SSO_SYSTEM_INTEGRATION_PROVIDER } from './constants.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => () => undefined,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE'
}))

describe('DingTalkConnectorStrategy', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('declares an OAuth connector without page-level application credential fields', () => {
    const strategy = createStrategy()

    expect(strategy.definition.provider).toBe(DINGTALK_CONNECTOR_PROVIDER)
    expect(strategy.definition.icon).toEqual({
      type: 'svg',
      value: expect.stringContaining('<svg')
    })
    expect(strategy.definition.authMethods).toEqual([expect.objectContaining({ id: 'oauth2', type: 'oauth2' })])
    expect(strategy.definition.authMethods[0].appCredentials).toEqual({
      help: expect.objectContaining({
        url: '/settings/integration/create?provider=dingtalk-connector'
      })
    })
  })

  it('builds the OAuth URL from the DingTalk SSO system integration', async () => {
    const strategy = createStrategy()

    const result = await strategy.connect({
      authMethodId: 'oauth2',
      redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
      state: 'state-1'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') {
      throw new Error('Expected pending OAuth result')
    }

    const url = new URL(result.authorizationUrl)
    expect(url.origin + url.pathname).toBe(DINGTALK_CONNECTOR_AUTHORIZE_URL)
    expect(url.searchParams.get('client_id')).toBe('system-client')
    expect(url.searchParams.get('redirect_uri')).toBe('https://xpert.example.com/api/connector/oauth/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid corpid')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(result.metadata).toEqual({ integrationId: 'integration-1' })
  })

  it('falls back to the connector-owned system integration when SSO is unavailable', async () => {
    const strategy = createStrategy(true, DINGTALK_CONNECTOR_INTEGRATION_PROVIDER)

    const result = await strategy.connect({
      authMethodId: 'oauth2',
      redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
      state: 'connector-state'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') {
      throw new Error('Expected pending OAuth result')
    }

    expect(new URL(result.authorizationUrl).searchParams.get('client_id')).toBe('system-client')
    expect(result.metadata).toEqual({ integrationId: 'integration-1' })
  })

  it('rejects credentials from the legacy DingTalk messaging integrations', async () => {
    const strategy = createStrategy(true, 'dingtalk_long')

    await expect(
      strategy.connect({
        authMethodId: 'oauth2',
        redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
        state: 'stream-state'
      })
    ).rejects.toThrow('DingTalk OAuth system integration is not configured')
  })

  it('exchanges the OAuth code with system integration credentials without storing the secret', async () => {
    const strategy = createStrategy()
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          corpId: 'corp-1'
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          unionId: 'union-1',
          openId: 'open-1',
          nick: 'Ding User',
          avatarUrl: 'https://example.com/avatar.png'
        })
      )

    const credential = await strategy.exchangeAuthorizationCode({
      authMethodId: 'oauth2',
      metadata: { integrationId: 'integration-1' },
      code: 'oauth-code',
      redirectUri: 'https://xpert.example.com/api/connector/oauth/callback'
    })

    expect(credential).toEqual({
      data: {
        appId: 'system-client',
        integrationId: 'integration-1',
        brand: 'dingtalk',
        corpId: 'corp-1',
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      },
      scopes: ['openid', 'corpid'],
      profile: expect.objectContaining({
        unionId: 'union-1',
        openId: 'open-1',
        userId: 'union-1',
        name: 'Ding User'
      })
    })
    expect(credential.data).not.toHaveProperty('clientSecret')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      DINGTALK_CONNECTOR_TOKEN_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          clientId: 'system-client',
          clientSecret: 'system-secret',
          code: 'oauth-code',
          grantType: 'authorization_code'
        })
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      DINGTALK_CONNECTOR_USER_INFO_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-acs-dingtalk-access-token': 'access-token'
        })
      })
    )
  })

  it('refreshes with the system integration secret and preserves the refresh token', async () => {
    const strategy = createStrategy()
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'refreshed-access', corpId: 'corp-1' }))
      .mockResolvedValueOnce(jsonResponse({ openId: 'open-1', nick: 'Ding User', corpId: 'corp-1' }))

    const credential = await strategy.refreshConnectionCredential({
      authMethodId: 'oauth2',
      credential: {
        data: {
          appId: 'system-client',
          integrationId: 'integration-1',
          accessToken: 'old-access',
          refreshToken: 'old-refresh',
          corpId: 'corp-1'
        },
        scopes: ['openid', 'corpid'],
        profile: { openId: 'open-1' }
      }
    })

    expect(credential.data).toEqual(
      expect.objectContaining({
        accessToken: 'refreshed-access',
        refreshToken: 'old-refresh',
        corpId: 'corp-1'
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      DINGTALK_CONNECTOR_TOKEN_URL,
      expect.objectContaining({
        body: JSON.stringify({
          clientId: 'system-client',
          clientSecret: 'system-secret',
          grantType: 'refresh_token',
          refreshToken: 'old-refresh'
        })
      })
    )
  })

  it('fails clearly when the DingTalk SSO system integration is missing', async () => {
    const strategy = createStrategy(false)

    await expect(
      strategy.connect({
        authMethodId: 'oauth2',
        redirectUri: 'https://xpert.example.com/callback',
        state: 'state-missing'
      })
    ).rejects.toThrow('DingTalk OAuth system integration is not configured')
  })

  it('projects runtime credentials without leaking integration secrets', () => {
    const strategy = createStrategy()

    expect(
      strategy.resolveRuntimeCredential({
        authMethodId: 'oauth2',
        credential: {
          data: {
            appId: 'ding-client',
            brand: 'dingtalk',
            accessToken: 'access-token',
            corpId: 'corp-1'
          }
        }
      })
    ).toEqual({
      appId: 'ding-client',
      brand: 'dingtalk',
      accessToken: 'access-token'
    })
  })
})

function createStrategy(withIntegration = true, integrationProvider = DINGTALK_SSO_SYSTEM_INTEGRATION_PROVIDER) {
  const integration = {
    id: 'integration-1',
    provider: integrationProvider,
    options: {
      clientId: 'system-client',
      clientSecret: 'enc:v1:encrypted-secret'
    }
  }
  const integrationPermissionService = {
    read: jest.fn().mockResolvedValue(withIntegration ? integration : null),
    findAll: jest
      .fn()
      .mockResolvedValue({ items: withIntegration ? [integration] : [], total: withIntegration ? 1 : 0 }),
    findAllWithInheritance: jest
      .fn()
      .mockResolvedValue({ items: withIntegration ? [integration] : [], total: withIntegration ? 1 : 0 })
  }
  const pluginContext = {
    resolve: jest.fn().mockReturnValue(integrationPermissionService)
  }
  const secretService = {
    decrypt: jest.fn().mockReturnValue('system-secret')
  }
  return new DingTalkConnectorStrategy(secretService as never, pluginContext as never)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
