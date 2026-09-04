import {
  DINGTALK_CONNECTOR_AUTHORIZE_URL,
  DINGTALK_CONNECTOR_PROVIDER,
  DINGTALK_CONNECTOR_TOKEN_URL,
  DINGTALK_CONNECTOR_USER_INFO_URL,
  DingTalkConnectorStrategy
} from './dingtalk-connector.strategy.js'
import { DINGTALK_CONNECTOR_INTEGRATION_PROVIDER } from './constants.js'

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
      type: 'image',
      value: expect.stringMatching(/^data:image\/svg\+xml;charset=utf-8,/),
      size: 24
    })
    expect(strategy.definition.authMethods).toEqual([expect.objectContaining({ id: 'oauth2', type: 'oauth2' })])
    const authMethod = strategy.definition.authMethods[0]
    if (authMethod.type !== 'oauth2') throw new Error('Expected OAuth2 connector method')
    expect(authMethod).not.toHaveProperty('appCredentials')
  })

  it('builds the OAuth URL from the connector-owned system integration', async () => {
    const { strategy, integrationPermissionService } = createHarness()

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
    expect(integrationPermissionService.findAllWithInheritance).toHaveBeenCalledWith({
      where: { provider: DINGTALK_CONNECTOR_INTEGRATION_PROVIDER },
      order: { updatedAt: 'DESC' },
      take: 10
    })
  })

  it('uses the tenant-level system integration when organization configuration is unavailable', async () => {
    const strategy = createStrategy(true, DINGTALK_CONNECTOR_INTEGRATION_PROVIDER, undefined, null)

    const result = await strategy.connect({
      authMethodId: 'oauth2',
      redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
      state: 'tenant-state'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected pending OAuth result')
    expect(new URL(result.authorizationUrl).searchParams.get('client_id')).toBe('system-client')
  })

  it('does not use a system integration owned by another organization', async () => {
    const strategy = createStrategy(true, DINGTALK_CONNECTOR_INTEGRATION_PROVIDER, undefined, 'organization-2')

    await expect(
      strategy.connect({
        authMethodId: 'oauth2',
        redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
        state: 'other-organization-state'
      })
    ).rejects.toThrow('is not configured for the current tenant or organization')
  })

  it('prefers the organization integration over the tenant fallback', async () => {
    const { strategy } = createHarness(
      true,
      DINGTALK_CONNECTOR_INTEGRATION_PROVIDER,
      undefined,
      null,
      'organization-1',
      'tenant-1',
      [
        {
          id: 'organization-integration',
          provider: DINGTALK_CONNECTOR_INTEGRATION_PROVIDER,
          tenantId: 'tenant-1',
          organizationId: 'organization-1',
          options: { clientId: 'organization-client', clientSecret: 'enc:v1:organization-secret' }
        }
      ]
    )

    const result = await strategy.connect({
      authMethodId: 'oauth2',
      redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
      state: 'organization-priority-state'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected pending OAuth result')
    expect(new URL(result.authorizationUrl).searchParams.get('client_id')).toBe('organization-client')
    expect(result.metadata).toEqual({ integrationId: 'organization-integration' })
  })

  it('requires the connector plugin to run at organization scope', async () => {
    const strategy = createStrategy(true, DINGTALK_CONNECTOR_INTEGRATION_PROVIDER, undefined, 'organization-1', null)

    await expect(
      strategy.connect({
        authMethodId: 'oauth2',
        redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
        state: 'missing-organization-state'
      })
    ).rejects.toThrow('must be installed and used at organization scope')
  })

  it('does not discover the DingTalk SSO system integration', async () => {
    const strategy = createStrategy(true, 'dingtalk-sso')

    await expect(
      strategy.connect({
        authMethodId: 'oauth2',
        redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
        state: 'sso-state'
      })
    ).rejects.toThrow('DingTalk Connector OAuth system integration is not configured')
  })

  it('rejects credentials from the legacy DingTalk messaging integrations', async () => {
    const strategy = createStrategy(true, 'dingtalk_long')

    await expect(
      strategy.connect({
        authMethodId: 'oauth2',
        redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
        state: 'stream-state'
      })
    ).rejects.toThrow('DingTalk Connector OAuth system integration is not configured')
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

  it('fails clearly when the connector-owned system integration is missing', async () => {
    const strategy = createStrategy(false)

    await expect(
      strategy.connect({
        authMethodId: 'oauth2',
        redirectUri: 'https://xpert.example.com/callback',
        state: 'state-missing'
      })
    ).rejects.toThrow('DingTalk Connector OAuth system integration is not configured')
  })

  it('projects runtime user and app tokens without leaking integration secrets', async () => {
    const strategy = createStrategy()

    await expect(
      strategy.resolveRuntimeCredential({
        authMethodId: 'oauth2',
        credential: {
          data: {
            appId: 'ding-client',
            integrationId: 'integration-1',
            brand: 'dingtalk',
            accessToken: 'access-token',
            corpId: 'corp-1'
          }
        }
      })
    ).resolves.toEqual({
      appId: 'ding-client',
      brand: 'dingtalk',
      accessToken: 'access-token',
      appAccessToken: 'app-access-token',
      integrationId: 'integration-1'
    })
  })

  it('projects the Robot Code from the connector-owned system integration', async () => {
    const strategy = createStrategy(true, DINGTALK_CONNECTOR_INTEGRATION_PROVIDER, 'robot-code')

    await expect(
      strategy.resolveRuntimeCredential({
        authMethodId: 'oauth2',
        credential: {
          data: {
            appId: 'system-client',
            integrationId: 'integration-1',
            accessToken: 'access-token'
          }
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        appId: 'system-client',
        appAccessToken: 'app-access-token',
        robotCode: 'robot-code'
      })
    )
  })

  it('rejects an existing connector credential that references a DingTalk SSO integration', async () => {
    const strategy = createStrategy(true, 'dingtalk-sso')

    await expect(
      strategy.resolveRuntimeCredential({
        authMethodId: 'oauth2',
        credential: {
          data: {
            appId: 'system-client',
            integrationId: 'integration-1',
            accessToken: 'access-token'
          }
        }
      })
    ).rejects.toThrow("DingTalk OAuth system integration 'integration-1' was not found in the current tenant or organization")
  })
})

function createStrategy(
  withIntegration = true,
  integrationProvider = DINGTALK_CONNECTOR_INTEGRATION_PROVIDER,
  robotCode?: string,
  integrationOrganizationId: string | null = 'organization-1',
  pluginOrganizationId: string | null = 'organization-1',
  integrationTenantId: string | null = 'tenant-1',
  additionalIntegrations: Array<Record<string, unknown>> = []
) {
  return createHarness(
    withIntegration,
    integrationProvider,
    robotCode,
    integrationOrganizationId,
    pluginOrganizationId,
    integrationTenantId,
    additionalIntegrations
  )
    .strategy
}

function createHarness(
  withIntegration = true,
  integrationProvider = DINGTALK_CONNECTOR_INTEGRATION_PROVIDER,
  robotCode?: string,
  integrationOrganizationId: string | null = 'organization-1',
  pluginOrganizationId: string | null = 'organization-1',
  integrationTenantId: string | null = 'tenant-1',
  additionalIntegrations: Array<Record<string, unknown>> = []
) {
  const integration = {
    id: 'integration-1',
    provider: integrationProvider,
    tenantId: integrationTenantId,
    organizationId: integrationOrganizationId,
    options: {
      clientId: 'system-client',
      clientSecret: 'enc:v1:encrypted-secret',
      robotCode
    }
  }
  const items = withIntegration ? [integration, ...additionalIntegrations] : additionalIntegrations
  const integrationPermissionService = {
    items,
    read: jest.fn().mockResolvedValue(withIntegration ? integration : null),
    findAll: jest.fn().mockResolvedValue({ items, total: items.length }),
    findAllWithInheritance: jest.fn(function (this: { items: Array<Record<string, unknown>> }) {
      return Promise.resolve({ items: this.items, total: this.items.length })
    })
  }
  const pluginContext = {
    tenantId: 'tenant-1',
    organizationId: pluginOrganizationId,
    resolve: jest.fn().mockReturnValue(integrationPermissionService)
  }
  const secretService = {
    decrypt: jest.fn().mockReturnValue('system-secret')
  }
  const api = {
    getAppAccessToken: jest.fn().mockResolvedValue('app-access-token')
  }
  return {
    strategy: new DingTalkConnectorStrategy(secretService as never, api as never, pluginContext as never),
    integrationPermissionService
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
