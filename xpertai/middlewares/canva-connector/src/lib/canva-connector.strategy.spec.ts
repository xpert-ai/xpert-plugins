jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target,
  IntegrationStrategyKey: () => (target: object) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('integration-permission-service')
}))

import { CanvaConnectorStrategy } from './canva-connector.strategy.js'

describe('CanvaConnectorStrategy System Integration login', () => {
  it('resolves the selected System Integration before building authorization', async () => {
    const buildAuthorization = jest.fn().mockResolvedValue({
      authorizationUrl: 'https://mcp.canva.cn/authorize?client_id=system-client',
      scopes: ['design:meta:read', 'design:content:read', 'design:content:write', 'asset:read'],
      metadata: { version: 1, mode: 'mcp-cn' }
    })
    const findAllWithInheritance = jest.fn().mockResolvedValue({
      items: [{
        id: 'integration-1',
        organizationId: 'organization-1',
        provider: 'canva-mcp-cn',
        options: { clientId: 'system-client', clientSecret: 'system-secret' }
      }],
      total: 1
    })
    const resolve = jest.fn().mockReturnValue({ findAllWithInheritance })
    const strategy = new CanvaConnectorStrategy(
      { buildAuthorization } as never,
      {} as never,
      { config: {}, resolve } as never
    )

    const result = await strategy.connect({
      authMethodId: 'mcp-oauth-cn',
      redirectUri: 'https://xpert.example/api/connector/oauth/callback',
      state: 'state-1'
    })

    expect(result.status).toBe('pending')
    expect(findAllWithInheritance).toHaveBeenCalledWith({
      where: { provider: 'canva-mcp-cn' },
      order: { createdAt: 'ASC' }
    })
    expect(buildAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        clientId: 'system-client',
        clientSecret: 'system-secret',
        clientAuthentication: 'client_secret_basic',
        mode: 'mcp-cn'
      }),
      'https://xpert.example/api/connector/oauth/callback',
      'state-1'
    )
  })

  it('preserves the permission service receiver when resolving integrations', async () => {
    const buildAuthorization = jest.fn().mockResolvedValue({
      authorizationUrl: 'https://mcp.canva.cn/authorize?client_id=bound-client',
      scopes: ['design:meta:read'],
      metadata: { version: 1, mode: 'mcp-cn' }
    })
    const permissionService = {
      provider: 'canva-permission-service',
      async findAllWithInheritance() {
        if (this.provider !== 'canva-permission-service') {
          throw new Error('permission service receiver was lost')
        }
        return {
          items: [{ id: 'bound-integration', provider: 'canva-mcp-cn', organizationId: 'organization-1', options: { clientId: 'bound-client', clientSecret: 'bound-secret' } }],
          total: 1
        }
      }
    }
    const strategy = new CanvaConnectorStrategy(
      { buildAuthorization } as never,
      {} as never,
      { config: {}, resolve: jest.fn().mockReturnValue(permissionService) } as never
    )

    await expect(strategy.connect({
      authMethodId: 'mcp-oauth-cn',
      redirectUri: 'https://xpert.example/api/connector/oauth/callback',
      state: 'state-bound'
    })).resolves.toEqual(expect.objectContaining({ status: 'pending' }))
  })

  it('prefers an organization integration over an inherited tenant integration', async () => {
    const buildAuthorization = jest.fn().mockResolvedValue({
      authorizationUrl: 'https://mcp.canva.cn/authorize?client_id=organization-client',
      scopes: ['design:meta:read'],
      metadata: { version: 1, mode: 'mcp-cn' }
    })
    const findAllWithInheritance = jest.fn().mockResolvedValue({
      items: [
        { id: 'tenant-integration', organizationId: null, provider: 'canva-mcp-cn', options: { clientId: 'tenant-client', clientSecret: 'tenant-secret' } },
        { id: 'organization-integration', organizationId: 'organization-1', provider: 'canva-mcp-cn', options: { clientId: 'organization-client', clientSecret: 'organization-secret' } }
      ],
      total: 2
    })
    const strategy = new CanvaConnectorStrategy(
      { buildAuthorization } as never,
      {} as never,
      { config: {}, resolve: jest.fn().mockReturnValue({ findAllWithInheritance }) } as never
    )

    await strategy.connect({
      authMethodId: 'mcp-oauth-cn',
      redirectUri: 'https://xpert.example/api/connector/oauth/callback',
      state: 'state-organization'
    })

    expect(buildAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: 'organization-integration', clientId: 'organization-client' }),
      expect.any(String),
      'state-organization'
    )
  })

  it('fails clearly when no Canva System Integration is configured', async () => {
    const strategy = new CanvaConnectorStrategy(
      { buildAuthorization: jest.fn() } as never,
      {} as never,
      { config: {}, resolve: jest.fn().mockReturnValue({ findAllWithInheritance: jest.fn().mockResolvedValue({ items: [], total: 0 }) }) } as never
    )

    await expect(strategy.connect({
      authMethodId: 'mcp-oauth-cn',
      redirectUri: 'https://xpert.example/api/connector/oauth/callback',
      state: 'state-missing'
    })).rejects.toThrow('Configure a Canva China MCP OAuth System Integration before connecting')
  })

  it('requires a System Integration id when an explicit legacy value is supplied', async () => {
    const read = jest.fn().mockResolvedValue(null)
    const strategy = new CanvaConnectorStrategy(
      { buildAuthorization: jest.fn() } as never,
      {} as never,
      { config: {}, resolve: jest.fn().mockReturnValue({ read }) } as never
    )

    await expect(strategy.connect({
      authMethodId: 'mcp-oauth-cn',
      redirectUri: 'https://xpert.example/api/connector/oauth/callback',
      state: 'state-explicit',
      values: { integrationId: 'missing-integration' }
    })).rejects.toThrow("System Integration 'missing-integration' is not a Canva MCP integration")
  })

  it('reads the integration by id during a public OAuth callback', async () => {
    const exchangeCode = jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      scopes: ['design:meta:read', 'design:content:read', 'design:content:write', 'asset:read'],
      resource: 'https://mcp.canva.cn',
      revokeEndpoint: 'https://mcp.canva.cn/token'
    })
    const read = jest.fn().mockResolvedValue({
      id: 'integration-callback',
      tenantId: 'tenant-1',
      organizationId: null,
      provider: 'canva-mcp-cn',
      options: { clientId: 'callback-client', clientSecret: 'callback-secret' }
    })
    const strategy = new CanvaConnectorStrategy(
      { exchangeCode } as never,
      {} as never,
      {
        config: {},
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        resolve: jest.fn().mockReturnValue({ read })
      } as never
    )
    const metadata = await new (await import('./oauth/canva-oauth.client.js')).CanvaOAuthClient().buildAuthorization(
      { integrationId: 'integration-callback', clientId: 'callback-client', clientSecret: 'callback-secret', clientAuthentication: 'client_secret_basic', mode: 'mcp-cn' },
      'https://xpert.example/api/connector/oauth/callback',
      'state-callback'
    )

    const credential = await strategy.exchangeAuthorizationCode({
      authMethodId: 'mcp-oauth-cn',
      metadata: metadata.metadata,
      code: 'authorization-code',
      redirectUri: 'https://xpert.example/api/connector/oauth/callback'
    })

    expect(read).toHaveBeenCalledWith('integration-callback')
    expect(exchangeCode).toHaveBeenCalled()
    expect(credential.data.integrationId).toBe('integration-callback')
  })

  it('rejects legacy direct-login methods for new connections', async () => {
    const buildAuthorization = jest.fn()
    const resolve = jest.fn()
    const strategy = new CanvaConnectorStrategy(
      { buildAuthorization } as never,
      {} as never,
      { config: {}, resolve } as never
    )

    await expect(strategy.connect({
      authMethodId: 'mcp-oauth-cn-public',
      redirectUri: 'https://xpert.example/api/connector/oauth/callback',
      state: 'state-3'
    })).rejects.toThrow('Unsupported Canva authentication method for a new connection')

    expect(buildAuthorization).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })
})
