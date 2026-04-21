jest.mock('@xpert-ai/plugin-sdk', () => ({
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN: 'BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN',
  SSO_BINDING_PERMISSION_SERVICE_TOKEN: 'SSO_BINDING_PERMISSION_SERVICE_TOKEN'
}))

import {
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN,
  SSO_BINDING_PERMISSION_SERVICE_TOKEN
} from '@xpert-ai/plugin-sdk'
import { LarkSsoService } from './lark-sso.service.js'
import { LarkSsoError } from './types.js'

describe('LarkSsoService', () => {
  function createUnsignedStateToken(payload: Record<string, unknown>) {
    const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8').toString('base64url')
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    return `${encodedHeader}.${encodedPayload}.invalid-signature`
  }

  function createFixture(overrides?: {
    publicBaseUrl?: string
    loginWithBoundIdentity?: jest.Mock
    createPendingBinding?: jest.Mock
    exchangeCodeForAccessToken?: jest.Mock
    fetchUserProfile?: jest.Mock
    verifyState?: jest.Mock
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
        overrides?.createPendingBinding ??
        jest.fn().mockResolvedValue({
          ticket: 'ticket-1'
        })
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
      buildAuthorizeUrl: jest
        .fn()
        .mockImplementation(
          ({ redirectUri, state }: { redirectUri: string; state: string }) =>
            `${redirectUri}?state=${state}`
        ),
      exchangeCodeForAccessToken:
        overrides?.exchangeCodeForAccessToken ?? jest.fn().mockResolvedValue('access-token'),
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
          nonce: 'nonce-1',
          iat: 1,
          exp: 9999999999
        })
    }

    const service = new LarkSsoService(
      oauthService as any,
      stateService as any,
      pluginContext as any,
      {
        appId: 'cli_xxx',
        appSecret: 'secret',
        publicBaseUrl: overrides?.publicBaseUrl ?? 'https://xpert.example.com'
      } as any
    )

    return {
      service,
      oauthService,
      stateService,
      pluginContext,
      boundIdentityLoginPermissionService,
      ssoBindingPermissionService
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('handles bind success by creating a current-user confirmation ticket', async () => {
    const { service, ssoBindingPermissionService } = createFixture()

    await expect(
      service.handleCallback({
        code: 'oauth-code',
        state: 'signed-state',
        requestBaseUrl: 'https://runtime.example.com'
      })
    ).resolves.toEqual({
      type: 'redirect',
      status: 302,
      location: '/auth/sso-confirm?ticket=ticket-1'
    })

    expect(ssoBindingPermissionService.createPendingBinding).toHaveBeenCalledWith({
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      profile: {
        unionId: 'union-1',
        openId: 'open-1',
        appId: 'cli_xxx',
        name: 'Alice',
        avatarUrl: 'https://example.com/avatar.png'
      },
      returnTo: '/profile',
      flow: 'current_user_confirm'
    })
  })

  it('handles login success by issuing Xpert tokens for the bound identity', async () => {
    const { service, boundIdentityLoginPermissionService } = createFixture({
      verifyState: jest.fn().mockReturnValue({
        mode: 'login',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: '/ignored',
        nonce: 'nonce-1',
        iat: 1,
        exp: 9999999999
      })
    })

    await expect(
      service.handleCallback({
        code: 'oauth-code',
        state: 'signed-state',
        requestBaseUrl: 'https://runtime.example.com'
      })
    ).resolves.toEqual({
      type: 'redirect',
      status: 302,
      location:
        '/sign-in/success?jwt=jwt-token&refreshToken=refresh-token&userId=user-1&returnTo=%2Fignored'
    })

    expect(boundIdentityLoginPermissionService.loginWithBoundIdentity).toHaveBeenCalledWith({
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1'
    })
  })

  it('creates an anonymous pending bind challenge when no existing binding is found', async () => {
    const { service, ssoBindingPermissionService } = createFixture({
      verifyState: jest.fn().mockReturnValue({
        mode: 'login',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: '/workspace',
        nonce: 'nonce-1',
        iat: 1,
        exp: 9999999999
      }),
      loginWithBoundIdentity: jest.fn().mockResolvedValue(null)
    })

    await expect(
      service.handleCallback({
        code: 'oauth-code',
        state: 'signed-state',
        requestBaseUrl: 'https://runtime.example.com'
      })
    ).resolves.toEqual({
      type: 'redirect',
      status: 302,
      location: '/auth/sso-bind?ticket=ticket-1'
    })

    expect(ssoBindingPermissionService.createPendingBinding).toHaveBeenCalledWith({
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      profile: {
        unionId: 'union-1',
        openId: 'open-1',
        appId: 'cli_xxx',
        name: 'Alice',
        avatarUrl: 'https://example.com/avatar.png'
      },
      returnTo: '/workspace'
    })
  })

  it('redirects login callback failures back to auth/login with the trusted returnUrl', async () => {
    const { service } = createFixture({
      verifyState: jest.fn().mockReturnValue({
        mode: 'login',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: '/chat',
        nonce: 'nonce-1',
        iat: 1,
        exp: 9999999999
      })
    })

    const result = await service.handleCallback({
      state: 'signed-state',
      oauthError: 'access_denied',
      oauthErrorDescription: 'User denied access.',
      requestBaseUrl: 'https://runtime.example.com'
    })

    expect(result).toMatchObject({
      type: 'redirect',
      status: 302
    })

    const params = new URLSearchParams((result as { location: string }).location.split('?')[1] ?? '')
    expect((result as { location: string }).location.startsWith('/auth/login?')).toBe(true)
    expect(params.get('ssoProvider')).toBe('lark')
    expect(params.get('ssoError')).toBe('oauth_failed')
    expect(params.get('ssoMessage')).toBe('Feishu OAuth failed: User denied access.')
    expect(params.get('returnUrl')).toBe('/chat')
  })

  it('redirects login state_invalid errors without trusting returnUrl from an unverified state', async () => {
    const { service } = createFixture({
      verifyState: jest.fn(() => {
        throw new LarkSsoError('state_invalid', 'Invalid OAuth state.')
      })
    })

    const result = await service.handleCallback({
      code: 'oauth-code',
      state: createUnsignedStateToken({
        mode: 'login',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: '/chat'
      }),
      requestBaseUrl: 'https://runtime.example.com'
    })

    expect(result).toMatchObject({
      type: 'redirect',
      status: 302
    })

    const params = new URLSearchParams((result as { location: string }).location.split('?')[1] ?? '')
    expect((result as { location: string }).location.startsWith('/auth/login?')).toBe(true)
    expect(params.get('ssoProvider')).toBe('lark')
    expect(params.get('ssoError')).toBe('state_invalid')
    expect(params.get('ssoMessage')).toBe('Invalid OAuth state.')
    expect(params.get('returnUrl')).toBeNull()
  })

  it('keeps bind callback state errors as API errors', async () => {
    const { service } = createFixture({
      verifyState: jest.fn(() => {
        throw new LarkSsoError('state_invalid', 'Invalid OAuth state.')
      })
    })

    await expect(
      service.handleCallback({
        code: 'oauth-code',
        state: createUnsignedStateToken({
          mode: 'bind',
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          userId: 'user-1'
        }),
        requestBaseUrl: 'https://runtime.example.com'
      })
    ).rejects.toMatchObject({
      code: 'state_invalid'
    })
  })

  it('redirects unexpected login callback errors with a generic message', async () => {
    const { service } = createFixture({
      verifyState: jest.fn().mockReturnValue({
        mode: 'login',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: '/workspace',
        nonce: 'nonce-1',
        iat: 1,
        exp: 9999999999
      }),
      loginWithBoundIdentity: jest.fn().mockRejectedValue(new Error('database unavailable'))
    })

    const result = await service.handleCallback({
      code: 'oauth-code',
      state: 'signed-state',
      requestBaseUrl: 'https://runtime.example.com'
    })

    expect(result).toMatchObject({
      type: 'redirect',
      status: 302
    })

    const params = new URLSearchParams((result as { location: string }).location.split('?')[1] ?? '')
    expect((result as { location: string }).location.startsWith('/auth/login?')).toBe(true)
    expect(params.get('ssoProvider')).toBe('lark')
    expect(params.get('ssoError')).toBe('oauth_failed')
    expect(params.get('ssoMessage')).toBe('Feishu sign-in failed. Please try again.')
    expect(params.get('returnUrl')).toBe('/workspace')
  })

  it('fails callback when Feishu profile is missing union_id', async () => {
    const { service } = createFixture({
      fetchUserProfile: jest.fn().mockResolvedValue({
        unionId: null,
        openId: 'open-1',
        name: 'Alice',
        avatarUrl: 'https://example.com/avatar.png'
      })
    })

    await expect(
      service.handleCallback({
        code: 'oauth-code',
        state: 'signed-state',
        requestBaseUrl: 'https://runtime.example.com'
      })
    ).rejects.toMatchObject({
      code: 'union_id_missing'
    })
  })

  it('rejects invalid absolute returnTo and accepts same-origin absolute returnTo', () => {
    const { service } = createFixture({
      publicBaseUrl: 'https://xpert.example.com'
    })

    expect(() =>
      service.startBind({
        userId: 'user-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: 'https://evil.example.com/pwn',
        requestBaseUrl: 'https://runtime.example.com'
      })
    ).toThrow(LarkSsoError)

    expect(() =>
      service.startLogin({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        returnTo: 'https://xpert.example.com/settings',
        requestBaseUrl: 'https://runtime.example.com'
      })
    ).not.toThrow()
  })
})
