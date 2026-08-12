jest.mock('@xpert-ai/plugin-sdk', () => ({
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN: 'BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN',
  SSO_BINDING_PERMISSION_SERVICE_TOKEN: 'SSO_BINDING_PERMISSION_SERVICE_TOKEN'
}))

import {
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN,
  SSO_BINDING_PERMISSION_SERVICE_TOKEN
} from '@xpert-ai/plugin-sdk'
import { DingTalkSsoService } from './dingtalk-sso.service.js'
import { DingTalkSsoError } from './types.js'

describe('DingTalkSsoService', () => {
  const callbackUrl = 'https://xpert.example.com/api/dingtalk-identity/callback'

  function createUnsignedStateToken(payload: Record<string, unknown>) {
    return [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      'invalid-signature'
    ].join('.')
  }

  function createStateToken(payload: Record<string, unknown> = {}) {
    return createUnsignedStateToken({
      mode: 'bind',
      tenantId: 'tenant-1',
      integrationId: 'integration-1',
      ...payload
    })
  }

  function createFixture(overrides?: {
    verifyState?: jest.Mock
    loginWithBoundIdentity?: jest.Mock
    createPendingBinding?: jest.Mock
    fetchUserProfile?: jest.Mock
  }) {
    const boundIdentityLoginPermissionService = {
      loginWithBoundIdentity:
        overrides?.loginWithBoundIdentity ??
        jest.fn().mockResolvedValue({
          jwt: 'jwt-token',
          refreshToken: 'refresh-token',
          userId: 'user-1'
        })
    }
    const ssoBindingPermissionService = {
      createPendingBinding:
        overrides?.createPendingBinding ?? jest.fn().mockResolvedValue({ ticket: 'ticket-1' })
    }
    const pluginContext = {
      resolve: jest.fn((token: string) => {
        if (token === BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN) {
          return boundIdentityLoginPermissionService
        }
        if (token === SSO_BINDING_PERMISSION_SERVICE_TOKEN) {
          return ssoBindingPermissionService
        }
        throw new Error(`Unexpected token: ${token}`)
      })
    }
    const oauthService = {
      buildAuthorizeUrl: jest.fn().mockReturnValue('https://login.dingtalk.com/oauth2/auth?signed=1'),
      exchangeCodeForAccessToken: jest.fn().mockResolvedValue('user-token'),
      fetchUserProfile:
        overrides?.fetchUserProfile ??
        jest.fn().mockResolvedValue({
          unionId: 'union-1',
          openId: 'open-1',
          name: 'Alice',
          avatarUrl: 'https://example.com/avatar.png'
        })
    }
    const stateService = {
      createState: jest.fn().mockReturnValue('signed-state'),
      verifyState:
        overrides?.verifyState ??
        jest.fn().mockReturnValue({
          mode: 'bind',
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          userId: 'user-1',
          returnTo: '/profile',
          redirectUri: callbackUrl,
          nonce: 'nonce-1',
          iat: 1,
          exp: 9999999999
        })
    }
    const integrationResolver = {
      resolveForTenant: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'tenant-1',
        clientId: 'ding-client',
        clientSecret: 'ding-secret'
      }),
      resolveById: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'tenant-1',
        clientId: 'ding-client',
        clientSecret: 'ding-secret'
      })
    }
    const service = new DingTalkSsoService(
      oauthService as any,
      stateService as any,
      integrationResolver as any,
      pluginContext as any
    )

    return {
      service,
      oauthService,
      stateService,
      boundIdentityLoginPermissionService,
      ssoBindingPermissionService
    }
  }

  beforeEach(() => jest.clearAllMocks())

  it('starts tenant-scoped OAuth with a signed callback URL', async () => {
    const { service, stateService, oauthService } = createFixture()

    await expect(
      service.startLogin({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: '/workspace',
        requestBaseUrl: 'https://runtime.example.com'
      })
    ).resolves.toBe('https://login.dingtalk.com/oauth2/auth?signed=1')
    expect(stateService.createState).toHaveBeenCalledWith(
      'ding-secret',
      expect.objectContaining({
        integrationId: 'integration-1',
        mode: 'login',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: '/workspace',
        redirectUri: 'https://runtime.example.com/api/dingtalk-identity/callback'
      })
    )
    expect(oauthService.buildAuthorizeUrl).toHaveBeenCalledWith({
      clientId: 'ding-client',
      redirectUri: 'https://runtime.example.com/api/dingtalk-identity/callback',
      state: 'signed-state'
    })
  })

  it('creates a current-user confirmation ticket after bind OAuth', async () => {
    const { service, ssoBindingPermissionService } = createFixture()

    await expect(
      service.handleCallback({
        authorizationCode: 'auth-code',
        state: createStateToken(),
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).resolves.toEqual({
      type: 'redirect',
      status: 302,
      location: '/auth/sso-confirm?ticket=ticket-1'
    })
    expect(ssoBindingPermissionService.createPendingBinding).toHaveBeenCalledWith({
      provider: 'dingtalk-sso',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      profile: {
        unionId: 'union-1',
        openId: 'open-1',
        clientId: 'ding-client',
        name: 'Alice',
        avatarUrl: 'https://example.com/avatar.png'
      },
      returnTo: '/profile',
      flow: 'current_user_confirm'
    })
  })

  it('signs in an already bound DingTalk identity', async () => {
    const { service, boundIdentityLoginPermissionService } = createFixture({
      verifyState: jest.fn().mockReturnValue({
        mode: 'login',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: '/workspace',
        redirectUri: callbackUrl,
        nonce: 'nonce-1',
        iat: 1,
        exp: 9999999999
      })
    })

    await expect(
      service.handleCallback({
        authorizationCode: 'auth-code',
        state: createStateToken({ mode: 'login' }),
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).resolves.toEqual({
      type: 'redirect',
      status: 302,
      location:
        '/sign-in/success?jwt=jwt-token&refreshToken=refresh-token&userId=user-1&returnTo=%2Fworkspace'
    })
    expect(boundIdentityLoginPermissionService.loginWithBoundIdentity).toHaveBeenCalledWith({
      provider: 'dingtalk-sso',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1'
    })
  })

  it('creates an anonymous binding ticket for an unbound identity', async () => {
    const { service, ssoBindingPermissionService } = createFixture({
      verifyState: jest.fn().mockReturnValue({
        mode: 'login',
        tenantId: 'tenant-1',
        returnTo: '/workspace',
        redirectUri: callbackUrl,
        nonce: 'nonce-1',
        iat: 1,
        exp: 9999999999
      }),
      loginWithBoundIdentity: jest.fn().mockResolvedValue(null)
    })

    await expect(
      service.handleCallback({
        authorizationCode: 'auth-code',
        state: createStateToken({ mode: 'login' }),
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).resolves.toEqual({
      type: 'redirect',
      status: 302,
      location: '/auth/sso-bind?ticket=ticket-1'
    })
    expect(ssoBindingPermissionService.createPendingBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'dingtalk-sso',
        subjectId: 'union-1',
        tenantId: 'tenant-1'
      })
    )
  })

  it('rejects callback origin mismatch before exchanging the code', async () => {
    const { service, oauthService } = createFixture({
      verifyState: jest.fn().mockReturnValue({
        mode: 'bind',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        redirectUri: 'https://different.example.com/api/dingtalk-identity/callback',
        nonce: 'nonce-1',
        iat: 1,
        exp: 9999999999
      })
    })

    await expect(
      service.handleCallback({
        authorizationCode: 'auth-code',
        state: createStateToken(),
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).rejects.toMatchObject({ code: 'callback_mismatch' })
    expect(oauthService.exchangeCodeForAccessToken).not.toHaveBeenCalled()
  })

  it('does not trust returnTo from an invalid signed login state', async () => {
    const { service } = createFixture({
      verifyState: jest.fn(() => {
        throw new DingTalkSsoError('state_invalid', 'Invalid OAuth state.')
      })
    })

    const result = await service.handleCallback({
      authorizationCode: 'auth-code',
      state: createStateToken({ mode: 'login', returnTo: '/private' }),
      requestBaseUrl: 'https://xpert.example.com'
    })
    const params = new URLSearchParams(result.location.split('?')[1])
    expect(result.location.startsWith('/auth/login?')).toBe(true)
    expect(params.get('ssoProvider')).toBe('dingtalk-sso')
    expect(params.get('ssoError')).toBe('state_invalid')
    expect(params.get('returnUrl')).toBeNull()
  })

  it('requires unionId and rejects external returnTo values', async () => {
    const { service } = createFixture({
      fetchUserProfile: jest.fn().mockResolvedValue({
        unionId: null,
        openId: 'open-1',
        name: 'Alice',
        avatarUrl: null
      })
    })

    await expect(
      service.handleCallback({
        authorizationCode: 'auth-code',
        state: createStateToken(),
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).rejects.toMatchObject({ code: 'union_id_missing' })
    await expect(
      service.startLogin({
        tenantId: 'tenant-1',
        returnTo: 'https://evil.example.com',
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).rejects.toThrow(DingTalkSsoError)
  })
})
