jest.mock('@xpert-ai/plugin-sdk', () => ({
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE'
}))

import { GITHUB_SSO_CALLBACK_PATH } from './constants.js'
import { GitHubSsoController } from './github-sso.controller.js'
import { GitHubSsoService } from './github-sso.service.js'

describe('GitHubSsoController', () => {
  it('sets an HttpOnly ten-minute PKCE cookie before redirecting to GitHub', async () => {
    const service = {
      startLogin: jest.fn().mockResolvedValue({
        authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=test',
        pkceCookie: {
          name: 'xpert_github_sso_pkce_nonce',
          value: 'verifier',
          secure: true
        }
      })
    } as Pick<GitHubSsoService, 'startLogin'>
    const controller = new GitHubSsoController(service as GitHubSsoService)
    const response = createResponse()

    await controller.loginStart(
      {
        headers: {
          'tenant-id': 'tenant-1',
          host: 'xpert.example.com'
        },
        protocol: 'https',
        'anonymous-tenant-resolution': {
          tenantId: 'tenant-1'
        }
      },
      response,
      '/workspace'
    )

    expect(service.startLogin).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      returnTo: '/workspace',
      requestBaseUrl: 'https://xpert.example.com'
    })
    expect(response.cookie).toHaveBeenCalledWith('xpert_github_sso_pkce_nonce', 'verifier', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 600000,
      path: GITHUB_SSO_CALLBACK_PATH
    })
    expect(response.redirect).toHaveBeenCalledWith('https://github.com/login/oauth/authorize?client_id=test')
  })

  it('rejects a caller-supplied tenant header without domain resolution', async () => {
    const service = {
      startLogin: jest.fn()
    } as Pick<GitHubSsoService, 'startLogin'>
    const controller = new GitHubSsoController(service as GitHubSsoService)
    const response = createResponse()

    await controller.loginStart(
      {
        headers: {
          'tenant-id': 'attacker-selected-tenant',
          host: 'xpert.example.com'
        },
        protocol: 'https'
      },
      response
    )

    expect(service.startLogin).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.statusJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'tenant_context_invalid'
      })
    )
  })

  it('rejects a tenant header that differs from domain resolution', async () => {
    const service = {
      startLogin: jest.fn()
    } as Pick<GitHubSsoService, 'startLogin'>
    const controller = new GitHubSsoController(service as GitHubSsoService)
    const response = createResponse()

    await controller.loginStart(
      {
        headers: {
          'tenant-id': 'attacker-selected-tenant',
          host: 'xpert.example.com'
        },
        protocol: 'https',
        'anonymous-tenant-resolution': {
          tenantId: 'domain-tenant'
        }
      },
      response
    )

    expect(service.startLogin).not.toHaveBeenCalled()
    expect(response.statusJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'tenant_context_invalid'
      })
    )
  })

  it('uses Express trusted proxy values instead of raw forwarded headers', async () => {
    const service = {
      startLogin: jest.fn().mockResolvedValue({
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        pkceCookie: {
          name: 'xpert_github_sso_pkce_nonce',
          value: 'verifier',
          secure: true
        }
      })
    } as Pick<GitHubSsoService, 'startLogin'>
    const controller = new GitHubSsoController(service as GitHubSsoService)
    const response = createResponse()

    await controller.loginStart(
      {
        headers: {
          'tenant-id': 'tenant-1',
          'x-forwarded-proto': 'http',
          'x-forwarded-host': 'attacker.example.com',
          host: 'internal.example.com'
        },
        protocol: 'https',
        host: 'tenant-login.example.com',
        'anonymous-tenant-resolution': {
          tenantId: 'tenant-1'
        }
      },
      response
    )

    expect(service.startLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBaseUrl: 'https://tenant-login.example.com'
      })
    )
  })

  it('clears the nonce cookie after callback and redirects to the service result', async () => {
    const service = {
      resolvePkceCookieName: jest.fn().mockReturnValue('xpert_github_sso_pkce_nonce'),
      handleCallback: jest.fn().mockResolvedValue({
        type: 'redirect',
        status: 302,
        location: '/auth/register?ticket=ticket'
      })
    } as Pick<GitHubSsoService, 'resolvePkceCookieName' | 'handleCallback'>
    const controller = new GitHubSsoController(service as GitHubSsoService)
    const response = createResponse()

    await controller.callback(
      {
        headers: { host: 'xpert.example.com' },
        protocol: 'https',
        cookies: {
          xpert_github_sso_pkce_nonce: 'verifier'
        }
      },
      response,
      'code',
      'state'
    )

    expect(service.handleCallback).toHaveBeenCalledWith({
      code: 'code',
      state: 'state',
      oauthError: undefined,
      oauthErrorDescription: undefined,
      requestBaseUrl: 'https://xpert.example.com',
      cookies: {
        xpert_github_sso_pkce_nonce: 'verifier'
      }
    })
    expect(response.clearCookie).toHaveBeenCalledWith('xpert_github_sso_pkce_nonce', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: GITHUB_SSO_CALLBACK_PATH
    })
    expect(response.redirect).toHaveBeenCalledWith('/auth/register?ticket=ticket')
  })
})

function createResponse() {
  const statusJson = jest.fn()
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
    status: jest.fn().mockReturnValue({ json: statusJson }),
    statusJson
  }
}
