jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

import { BAIDU_NETDISK_AUTH_METHOD_OAUTH } from '../constants.js'
import { BaiduNetdiskOAuthClient } from './baidu-netdisk-oauth.client.js'
import { BaiduNetdiskConnectorStrategy } from './baidu-netdisk-connector.strategy.js'
import type { BaiduNetdiskOAuthConfigService } from './baidu-netdisk-oauth-config.service.js'

const app = {
  integrationId: 'integration-1',
  config: {
    appKey: 'app-key',
    secretKey: 'secret-key',
    authorizationUrl: 'https://openapi.baidu.com/oauth/2.0/authorize',
    tokenUrl: 'https://openapi.baidu.com/oauth/2.0/token',
    apiBaseUrl: 'https://pan.baidu.com',
    uploadBaseUrl: 'https://d.pcs.baidu.com',
    scopes: ['basic', 'netdisk'],
    timeoutMs: 30_000,
    responseMaxBytes: 2 * 1024 * 1024
  }
}

describe('Baidu Netdisk connector strategy', () => {
  it('starts OAuth without requesting end-user app credentials', async () => {
    const oauth = {
      buildAuthorizationUrl: jest.fn().mockReturnValue('https://openapi.baidu.com/oauth/2.0/authorize?state=s')
    } as unknown as BaiduNetdiskOAuthClient
    const oauthConfig = { resolve: jest.fn().mockResolvedValue(app) } as unknown as BaiduNetdiskOAuthConfigService
    const strategy = new BaiduNetdiskConnectorStrategy(oauthConfig, oauth)
    const result = await strategy.connect({
      authMethodId: BAIDU_NETDISK_AUTH_METHOD_OAUTH,
      redirectUri: 'https://xpert.example/callback',
      state: 's'
    })
    expect(result.status).toBe('pending')
    if (result.status !== 'pending') throw new Error('Expected a pending OAuth result')
    expect(result.authorizationUrl).toContain('openapi.baidu.com')
    expect(result.metadata).toMatchObject({
      version: 1,
      integrationId: 'integration-1',
      redirectUri: 'https://xpert.example/callback'
    })
    expect(oauth.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ appKey: 'app-key' }),
      expect.objectContaining({ state: 's' })
    )
    expect(strategy.definition.authMethods?.[0]).toMatchObject({
      id: BAIDU_NETDISK_AUTH_METHOD_OAUTH,
      appCredentials: { fields: [] }
    })
  })

  it('rejects a callback whose redirect URI does not match pending state', async () => {
    const oauth = { exchangeCode: jest.fn() } as unknown as BaiduNetdiskOAuthClient
    const oauthConfig = { resolve: jest.fn() } as unknown as BaiduNetdiskOAuthConfigService
    const strategy = new BaiduNetdiskConnectorStrategy(oauthConfig, oauth)
    await expect(
      strategy.exchangeAuthorizationCode({
        authMethodId: BAIDU_NETDISK_AUTH_METHOD_OAUTH,
        code: 'one-time-code',
        redirectUri: 'https://evil.example/callback',
        metadata: {
          version: 1,
          integrationId: 'integration-1',
          appKeyFingerprint: 'wrong',
          redirectUri: 'https://xpert.example/callback',
          scopes: ['basic']
        }
      })
    ).rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID' })
    expect(oauth.exchangeCode).not.toHaveBeenCalled()
  })

  it('projects refresh responses without exposing the app secret', async () => {
    const oauth = {
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'rotated-refresh',
        expiresIn: 3600,
        tokenType: 'bearer',
        userId: 'u1'
      })
    } as unknown as BaiduNetdiskOAuthClient
    const oauthConfig = { resolve: jest.fn().mockResolvedValue(app) } as unknown as BaiduNetdiskOAuthConfigService
    const strategy = new BaiduNetdiskConnectorStrategy(oauthConfig, oauth)
    const result = await strategy.refreshConnectionCredential({
      authMethodId: BAIDU_NETDISK_AUTH_METHOD_OAUTH,
      credential: {
        data: { accessToken: 'old-access', refreshToken: 'old-refresh', integrationId: 'integration-1' },
        scopes: ['basic']
      }
    })
    expect(result.data).toMatchObject({ accessToken: 'new-access', refreshToken: 'rotated-refresh' })
    expect(result.data).toHaveProperty('integrationId', 'integration-1')
    expect(result.data).not.toHaveProperty('secretKey')
    expect(result.profile).toMatchObject({ userId: 'u1' })
  })
})
