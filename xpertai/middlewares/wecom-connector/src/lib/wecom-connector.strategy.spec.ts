import { WeComConnectorStrategy } from './wecom-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => () => undefined,
  IntegrationStrategyKey: () => () => undefined,
  AgentMiddlewareStrategy: () => () => undefined,
  XpertServerPlugin: () => () => undefined,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE'
}))

import plugin from '../index.js'
import {
  WECOM_CONNECTOR_ARTIFACT_NAMESPACE,
  WECOM_CONNECTOR_ICON,
  WECOM_CONNECTOR_INSTALL_LEVEL
} from './types.js'

describe('WeComConnectorStrategy', () => {
  it('stays tenant-installed while allowing inherited WeCom auth integrations', () => {
    expect(plugin.meta.level).toBe(WECOM_CONNECTOR_INSTALL_LEVEL)
    expect(plugin.meta.artifactNamespace).toBe(WECOM_CONNECTOR_ARTIFACT_NAMESPACE)
    expect(createStrategy([]).definition.icon).toEqual({ type: 'image', value: WECOM_CONNECTOR_ICON })
    expect(plugin.permissions).toEqual([{ type: 'integration', service: 'wecom_auth', operations: ['read'] }])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('declares a QR authentication method without workspace credential fields', () => {
    const strategy = createStrategy([])

    expect(strategy.definition.provider).toBe('wecom')
    expect(strategy.definition.authMethods).toEqual([
      expect.objectContaining({
        id: 'wecom-qr',
        type: 'oauth2',
        appCredentials: expect.objectContaining({
          help: expect.objectContaining({ url: '/settings/integration/create?provider=wecom_auth' })
        })
      })
    ])
  })

  it('returns a client error when QR credentials are not configured in either scope', async () => {
    const strategy = createStrategy([])

    await expect(
      strategy.connect({
        authMethodId: 'wecom-qr',
        redirectUri: 'https://xpert.example.com/callback',
        state: 'state-missing'
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('prefers the organization integration when both inherited scopes are available', async () => {
    const strategy = createStrategy([
      integration('organization-integration', 'organization-1', 'org-corp', 'org-agent', 'org-secret'),
      integration('tenant-integration', null, 'tenant-corp', '1000002', 'tenant-secret')
    ])

    const result = await strategy.connect({
      authMethodId: 'wecom-qr',
      redirectUri: 'https://xpert.example.com/api/connector/oauth/callback',
      state: 'state-1'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected pending QR authorization')
    const url = new URL(result.authorizationUrl)
    expect(url.origin + url.pathname).toBe('https://open.work.weixin.qq.com/wwopen/sso/qrConnect')
    expect(url.searchParams.get('appid')).toBe('org-corp')
    expect(url.searchParams.get('agentid')).toBe('org-agent')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('redirect_uri')).toBe('https://xpert.example.com/api/connector/oauth/callback')
    expect(result.metadata).toEqual({ integrationId: 'organization-integration' })
    expect(JSON.stringify(result)).not.toContain('org-secret')
  })

  it('uses tenant credentials for a tenant-scoped authorization', async () => {
    const strategy = createStrategy([
      integration('tenant-integration', null, 'tenant-corp', '1000002', 'tenant-secret')
    ])

    const result = await strategy.connect({
      authMethodId: 'wecom-qr',
      redirectUri: 'https://xpert.example.com/callback',
      state: 'state-tenant'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected pending QR authorization')
    expect(new URL(result.authorizationUrl).searchParams.get('appid')).toBe('tenant-corp')
    expect(result.metadata).toEqual({ integrationId: 'tenant-integration' })
  })

  it('accepts organization-only credentials for an organization-scoped authorization', async () => {
    const strategy = createStrategy([
      integration('organization-integration', 'organization-1', 'org-corp', 'org-agent', 'org-secret')
    ])

    const result = await strategy.connect({
      authMethodId: 'wecom-qr',
      redirectUri: 'https://xpert.example.com/callback',
      state: 'state-organization'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected pending QR authorization')
    expect(new URL(result.authorizationUrl).searchParams.get('appid')).toBe('org-corp')
    expect(result.metadata).toEqual({ integrationId: 'organization-integration' })
  })

  it('falls back to valid tenant credentials when the organization integration is incomplete', async () => {
    const strategy = createStrategy([
      integration('organization-integration', 'organization-1', 'org-corp', '', 'org-secret'),
      integration('tenant-integration', null, 'tenant-corp', '1000002', 'tenant-secret')
    ])

    const result = await strategy.connect({
      authMethodId: 'wecom-qr',
      redirectUri: 'https://xpert.example.com/callback',
      state: 'state-fallback'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected pending QR authorization')
    expect(new URL(result.authorizationUrl).searchParams.get('appid')).toBe('tenant-corp')
    expect(result.metadata).toEqual({ integrationId: 'tenant-integration' })
  })

  it('exchanges the QR login code with the originally selected organization integration', async () => {
    const strategy = createStrategy([
      integration('organization-integration', 'organization-1', 'org-corp', 'org-agent', 'org-secret'),
      integration('tenant-integration', null, 'tenant-corp', '1000002', 'tenant-secret')
    ])
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, access_token: 'access-1', expires_in: 7200 }))
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 0, userid: 'user-1', open_userid: 'open-1', user_ticket: 'ticket-1' })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          errcode: 0,
          userid: 'user-1',
          name: 'WeCom User',
          avatar: 'https://avatar.example.com/u1.png',
          email: 'user@example.com',
          unionid: 'union-1'
        })
      )

    const credential = await strategy.exchangeAuthorizationCode({
      authMethodId: 'wecom-qr',
      metadata: { integrationId: 'organization-integration' },
      code: 'auth-code-1',
      redirectUri: 'https://xpert.example.com/api/connector/oauth/callback'
    })

    expect(credential).toEqual({
      data: {
        integrationId: 'organization-integration',
        corpId: 'org-corp',
        agentId: 'org-agent',
        accessToken: 'access-1'
      },
      expiresAt: expect.any(String),
      profile: expect.objectContaining({ userId: 'user-1', openId: 'open-1', unionId: 'union-1', name: 'WeCom User' })
    })
    expect(JSON.stringify(credential)).not.toContain('org-secret')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('refreshes the access token using the original tenant integration', async () => {
    const strategy = createStrategy([
      integration('tenant-integration', null, 'tenant-corp', '1000002', 'tenant-secret')
    ])
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, access_token: 'access-refresh', expires_in: 7200 }))

    await expect(
      strategy.refreshConnectionCredential({
        authMethodId: 'wecom-qr',
        credential: {
          data: {
            integrationId: 'tenant-integration',
            corpId: 'tenant-corp',
            agentId: '1000002',
            accessToken: 'access-old'
          }
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ integrationId: 'tenant-integration', accessToken: 'access-refresh' })
      })
    )
  })

  it('projects runtime credentials without exposing app secrets', async () => {
    const strategy = createStrategy([])
    const runtime = await strategy.resolveRuntimeCredential({
      authMethodId: 'wecom-qr',
      credential: {
        data: {
          integrationId: 'tenant-integration',
          corpId: 'tenant-corp',
          agentId: '1000002',
          accessToken: 'access-1'
        },
        profile: { userId: 'user-1', openId: 'open-1', unionId: 'union-1' }
      }
    })

    expect(runtime).toEqual({
      accessToken: 'access-1',
      corpId: 'tenant-corp',
      agentId: '1000002',
      userId: 'user-1',
      openId: 'open-1',
      unionId: 'union-1'
    })
    expect(JSON.stringify(runtime)).not.toContain('secret')
  })
})

function createStrategy(items: Array<ReturnType<typeof integration>>) {
  const integrationPermissionService = {
    findAllWithInheritance: jest.fn().mockResolvedValue({ items, total: items.length })
  }
  const pluginContext = {
    resolve: jest.fn().mockReturnValue(integrationPermissionService)
  }
  return new WeComConnectorStrategy(pluginContext as never)
}

function integration(id: string, organizationId: string | null, corpId: string, agentId: string, corpSecret: string) {
  return {
    id,
    provider: 'wecom_auth',
    organizationId,
    options: { corpId, agentId, corpSecret }
  }
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response
}
