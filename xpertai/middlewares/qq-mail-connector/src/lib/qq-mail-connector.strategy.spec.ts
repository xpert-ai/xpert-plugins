import { QqMailMcpClient } from './mcp/qq-mail-mcp.client.js'
import { QqMailOAuthClient } from './oauth/qq-mail-oauth.client.js'
import { QqMailProtocolService } from './protocol/qq-mail-protocol.service.js'
import { QqMailConnectorStrategy } from './qq-mail-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'integration-service'
}))

describe('QqMailConnectorStrategy', () => {
  const account = {
    scopes: ['alias:read', 'mail:read', 'mail:send'],
    aliases: [{ aliasId: 'alias-primary', email: 'user@qq.com', name: 'User', isPrimary: true }],
    rateLimits: {},
    constraints: {}
  }

  it('offers only IMAP/SMTP first and OAuth second', () => {
    const strategy = createStrategy(new QqMailOAuthClient(), new QqMailMcpClient())

    expect(strategy.definition.authMethods.map((method) => method.id)).toEqual([
      'imap-smtp-authorization-code',
      'oauth2-pkce'
    ])
    expect(
      strategy.definition.authMethods.map((method) =>
        typeof method.label === 'string' ? method.label : method.label.zh_Hans
      )
    ).toEqual(['IMAP/SMTP 认证', 'OAuth 认证'])
  })

  it('builds a PKCE authorization URL from discovered and dynamically registered metadata', async () => {
    const oauth = new QqMailOAuthClient()
    jest.spyOn(oauth, 'discover').mockResolvedValue({
      resource: 'https://api.mail.qq.com',
      authorizationEndpoint: 'https://wx.mail.qq.com/oauth/authorize',
      tokenEndpoint: 'https://wx.mail.qq.com/oauth/token',
      registrationEndpoint: 'https://wx.mail.qq.com/oauth/register'
    })
    jest.spyOn(oauth, 'registerClient').mockResolvedValue('registered-client')
    const strategy = createStrategy(oauth, new QqMailMcpClient())

    const result = await strategy.connect({
      authMethodId: 'oauth2-pkce',
      redirectUri: 'https://xpert.example/callback',
      state: 'state-value'
    })

    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected pending connector state')
    const url = new URL(result.authorizationUrl)
    expect(url.origin + url.pathname).toBe('https://wx.mail.qq.com/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('alias:read mail:read mail:send')
    expect(result.metadata).toMatchObject({ clientId: 'registered-client', resource: 'https://api.mail.qq.com' })
    expect(String(result.metadata?.codeVerifier)).not.toBe(url.searchParams.get('code_challenge'))
  })

  it('exchanges code, validates GetMe scopes, and projects no refresh token at runtime', async () => {
    const oauth = new QqMailOAuthClient()
    jest.spyOn(oauth, 'exchangeCode').mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      scopes: account.scopes
    })
    const mcp = new QqMailMcpClient()
    jest.spyOn(mcp, 'getAccount').mockResolvedValue(account)
    const strategy = createStrategy(oauth, mcp)
    const credential = await strategy.exchangeAuthorizationCode({
      authMethodId: 'oauth2-pkce',
      code: 'code',
      redirectUri: 'https://xpert.example/callback',
      metadata: {
        clientId: 'client-id',
        codeVerifier: 'verifier',
        redirectUri: 'https://xpert.example/callback',
        tokenEndpoint: 'https://wx.mail.qq.com/oauth/token',
        resource: 'https://api.mail.qq.com',
        scopes: account.scopes
      }
    })

    expect(credential.data.refreshToken).toBe('refresh-token')
    expect(credential.profile).toMatchObject({ email: 'user@qq.com' })
    await expect(strategy.resolveRuntimeCredential({ authMethodId: 'oauth2-pkce', credential })).resolves.toEqual({
      accessToken: 'access-token',
      tokenType: 'Bearer',
      resource: 'https://api.mail.qq.com'
    })
  })

  it('preserves a refresh token when QQ Mail does not rotate it', async () => {
    const oauth = new QqMailOAuthClient()
    jest.spyOn(oauth, 'refresh').mockResolvedValue({
      accessToken: 'new-access-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      scopes: []
    })
    const strategy = createStrategy(oauth, new QqMailMcpClient())
    const refreshed = await strategy.refreshConnectionCredential({
      authMethodId: 'oauth2-pkce',
      credential: {
        data: {
          clientId: 'client-id',
          accessToken: 'old-access-token',
          refreshToken: 'existing-refresh-token',
          tokenType: 'Bearer'
        },
        scopes: account.scopes,
        profile: { email: 'user@qq.com' }
      }
    })

    expect(oauth.refresh).toHaveBeenCalledWith({ clientId: 'client-id', refreshToken: 'existing-refresh-token' })
    expect(refreshed.data).toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'existing-refresh-token'
    })
    expect(refreshed.scopes).toEqual(account.scopes)
  })

  it('rejects a callback URI that differs from the encrypted authorization session', async () => {
    const oauth = new QqMailOAuthClient()
    const exchange = jest.spyOn(oauth, 'exchangeCode')
    const strategy = createStrategy(oauth, new QqMailMcpClient())

    await expect(
      strategy.exchangeAuthorizationCode({
        authMethodId: 'oauth2-pkce',
        code: 'code',
        redirectUri: 'https://attacker.example/callback',
        metadata: {
          clientId: 'client-id',
          codeVerifier: 'verifier',
          redirectUri: 'https://xpert.example/callback',
          tokenEndpoint: 'https://wx.mail.qq.com/oauth/token',
          resource: 'https://api.mail.qq.com',
          scopes: account.scopes
        }
      })
    ).rejects.toThrow('does not match')
    expect(exchange).not.toHaveBeenCalled()
  })

  it('connects with a selected System Integration and stores only its ID', async () => {
    const verifyCredential = jest.fn().mockResolvedValue(undefined)
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue({
        id: 'integration-1',
        provider: 'qq-mail-imap-smtp',
        options: { email: '123456@qq.com', authorizationCode: 'abcd1234efgh5678' }
      })
    }
    const strategy = createStrategy(new QqMailOAuthClient(), new QqMailMcpClient(), {
      verifyCredential,
      integrationPermissionService
    })

    const result = await strategy.connect({
      authMethodId: 'imap-smtp-authorization-code',
      values: { integrationId: 'integration-1' },
      redirectUri: 'https://xpert.example/callback',
      state: 'unused'
    })

    expect(result).toMatchObject({
      status: 'active',
      credential: {
        data: { integrationId: 'integration-1' },
        profile: { email: '123456@qq.com', authentication: 'imap-smtp' }
      }
    })
    expect(JSON.stringify(result)).not.toContain('abcd1234efgh5678')
    expect(verifyCredential).toHaveBeenCalledWith({ email: '123456@qq.com', authorizationCode: 'abcd1234efgh5678' })

    await expect(
      strategy.resolveRuntimeCredential({
        authMethodId: 'imap-smtp-authorization-code',
        credential: result.status === 'active' ? result.credential : { data: {} }
      })
    ).resolves.toEqual({
      protocol: 'imap-smtp',
      integrationId: 'integration-1',
      email: '123456@qq.com',
      authorizationCode: 'abcd1234efgh5678'
    })
  })
})

function createStrategy(
  oauth: QqMailOAuthClient,
  mcp: QqMailMcpClient,
  options?: {
    verifyCredential?: jest.Mock
    integrationPermissionService?: { read: jest.Mock }
  }
) {
  const integrationPermissionService = options?.integrationPermissionService ?? { read: jest.fn() }
  const mailService = {
    verifyCredential: options?.verifyCredential ?? jest.fn()
  } as unknown as QqMailProtocolService
  return new QqMailConnectorStrategy(oauth, mcp, mailService, {
    resolve: jest.fn(() => integrationPermissionService)
  } as never)
}
