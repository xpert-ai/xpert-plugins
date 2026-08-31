import {
  DINGTALK_CONNECTOR_AUTH_METHOD_ID,
  DINGTALK_CONNECTOR_AUTHORIZE_URL,
  DINGTALK_CONNECTOR_PROVIDER,
  DINGTALK_CONNECTOR_TOKEN_URL,
  DINGTALK_DWS_MANAGED_OAUTH_APP_ID,
  DingTalkConnectorStrategy,
  type DingTalkDwsAuth
} from './dingtalk-connector.strategy.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ConnectorStrategyKey: () => (target: object) => target
}))

describe('DingTalkConnectorStrategy', () => {
  it('declares a DWS-managed OAuth connector without user credential fields', () => {
    const strategy = new DingTalkConnectorStrategy(createAuthStub())
    const method = strategy.definition.authMethods[0]

    expect(strategy.definition.provider).toBe(DINGTALK_CONNECTOR_PROVIDER)
    expect(strategy.definition.auth).toEqual(
      expect.objectContaining({
        type: 'oauth2',
        authorizationUrl: DINGTALK_CONNECTOR_AUTHORIZE_URL,
        tokenUrl: DINGTALK_CONNECTOR_TOKEN_URL,
        redirectPath: '/api/connector/oauth/callback'
      })
    )
    expect(method).toMatchObject({ id: DINGTALK_CONNECTOR_AUTH_METHOD_ID, type: 'oauth2' })
    expect(method).not.toHaveProperty('appCredentials')
    expect(strategy.definition.permissions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ credential: 'app_credential' })])
    )
  })

  it('starts the DWS default loopback flow without application configuration', async () => {
    const auth = createAuthStub()
    const strategy = new DingTalkConnectorStrategy(auth)

    const result = await strategy.connect({
      authMethodId: DINGTALK_CONNECTOR_AUTH_METHOD_ID,
      redirectUri: 'https://xpert.example/api/connector/oauth/callback',
      state: 'state-1'
    })

    expect(result).toEqual({
      status: 'pending',
      authorizationUrl: 'https://login.dingtalk.com/oauth2/challenge.htm?client_id=dws-client',
      scopes: ['openid', 'corpid'],
      metadata: {
        authMode: 'loopback',
        managedApp: DINGTALK_DWS_MANAGED_OAUTH_APP_ID,
        clientId: 'dws-client',
        loopbackRedirectUri: 'http://127.0.0.1:51971/callback'
      }
    })
    expect(auth.startLoopbackAuthorization).toHaveBeenCalledWith({
      state: 'state-1',
      scopes: ['openid', 'corpid'],
      forwardRedirectUri: 'https://xpert.example/api/connector/oauth/callback'
    })
  })

  it('exchanges through DWS, checks CLI access, and stores no application secret', async () => {
    const auth = createAuthStub()
    const strategy = new DingTalkConnectorStrategy(auth)

    const credential = await strategy.exchangeAuthorizationCode({
      authMethodId: DINGTALK_CONNECTOR_AUTH_METHOD_ID,
      metadata: { authMode: 'loopback', clientId: 'dws-client' },
      code: 'oauth-code',
      redirectUri: 'https://xpert.example/api/connector/oauth/callback'
    })

    expect(auth.exchangeAuthorizationCode).toHaveBeenCalledWith('dws-client', 'oauth-code')
    expect(auth.assertCliAccess).toHaveBeenCalledWith('access-token')
    expect(credential.data).toEqual({
      appId: 'dws-client',
      brand: 'dingtalk',
      corpId: 'corp-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token'
    })
    expect(credential.data).not.toHaveProperty('clientSecret')
    expect(credential.profile).toEqual(
      expect.objectContaining({ corpId: 'corp-1', userId: 'user-1', name: 'Ding User' })
    )
  })

  it('refreshes with the stored managed client ID and rotated refresh token', async () => {
    const auth = createAuthStub()
    const strategy = new DingTalkConnectorStrategy(auth)

    const credential = await strategy.refreshConnectionCredential({
      authMethodId: DINGTALK_CONNECTOR_AUTH_METHOD_ID,
      credential: {
        data: { appId: 'stored-client', accessToken: 'old-access', refreshToken: 'old-refresh', corpId: 'corp-1' },
        scopes: ['openid', 'corpid'],
        profile: { openId: 'open-1' }
      }
    })

    expect(auth.refreshToken).toHaveBeenCalledWith('stored-client', 'old-refresh')
    expect(credential.data).toEqual(
      expect.objectContaining({ appId: 'stored-client', accessToken: 'refreshed-access', refreshToken: 'new-refresh' })
    )
    expect(auth.getOfficialClientId).not.toHaveBeenCalled()
  })

  it('projects only the user access token at runtime', () => {
    const strategy = new DingTalkConnectorStrategy(createAuthStub())
    expect(
      strategy.resolveRuntimeCredential({
        authMethodId: DINGTALK_CONNECTOR_AUTH_METHOD_ID,
        credential: {
          data: { appId: 'dws-client', brand: 'dingtalk', accessToken: 'access-token', clientSecret: 'secret' }
        }
      })
    ).toEqual({ appId: 'dws-client', brand: 'dingtalk', accessToken: 'access-token' })
  })
})

function createAuthStub(): jest.Mocked<DingTalkDwsAuth> {
  return {
    startLoopbackAuthorization: jest.fn().mockResolvedValue({
      clientId: 'dws-client',
      redirectUri: 'http://127.0.0.1:51971/callback',
      authorizationUrl: 'https://login.dingtalk.com/oauth2/challenge.htm?client_id=dws-client',
      close: jest.fn().mockResolvedValue(undefined)
    }),
    exchangeAuthorizationCode: jest.fn().mockResolvedValue({
      clientId: 'dws-client',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 7200,
      refreshExpiresIn: 2592000,
      corpId: 'corp-1',
      userId: 'user-1',
      userName: 'Ding User'
    }),
    refreshToken: jest.fn().mockResolvedValue({
      clientId: 'stored-client',
      accessToken: 'refreshed-access',
      refreshToken: 'new-refresh',
      expiresIn: 7200,
      refreshExpiresIn: 2592000,
      corpId: 'corp-1',
      userId: 'user-1',
      userName: 'Ding User'
    }),
    assertCliAccess: jest.fn().mockResolvedValue(undefined),
    getOfficialClientId: jest.fn().mockResolvedValue('dws-client')
  }
}
