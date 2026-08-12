jest.mock('@xpert-ai/plugin-sdk', () => ({
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN: 'BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN',
  SSO_BINDING_PERMISSION_SERVICE_TOKEN: 'SSO_BINDING_PERMISSION_SERVICE_TOKEN'
}))

import { DingTalkSsoController } from './dingtalk-sso.controller.js'

describe('DingTalkSsoController', () => {
  function createResponse() {
    const statusJson = jest.fn()
    return {
      redirect: jest.fn(),
      statusJson,
      status: jest.fn().mockReturnValue({ json: statusJson })
    }
  }

  it('starts login using tenant context resolved from the login domain', async () => {
    const identityService = {
      startLogin: jest.fn().mockReturnValue('https://login.dingtalk.com/oauth2/auth')
    }
    const controller = new DingTalkSsoController(identityService as any)
    const response = createResponse()

    await controller.loginStart(
      {
        headers: {
          'tenant-id': 'tenant-1',
          'organization-id': 'org-1',
          host: 'xpert.example.com'
        },
        protocol: 'https',
        'anonymous-tenant-resolution': {
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        }
      } as any,
      response as any,
      '/workspace'
    )

    expect(identityService.startLogin).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      returnTo: '/workspace',
      requestBaseUrl: 'https://xpert.example.com'
    })
    expect(response.redirect).toHaveBeenCalledWith('https://login.dingtalk.com/oauth2/auth')
  })

  it('rejects tenant context that conflicts with domain resolution', async () => {
    const identityService = { startLogin: jest.fn() }
    const controller = new DingTalkSsoController(identityService as any)
    const response = createResponse()

    await controller.loginStart(
      {
        headers: { 'tenant-id': 'tenant-2', host: 'xpert.example.com' },
        protocol: 'https',
        'anonymous-tenant-resolution': { tenantId: 'tenant-1' }
      } as any,
      response as any
    )

    expect(response.status).toHaveBeenCalledWith(400)
    expect(identityService.startLogin).not.toHaveBeenCalled()
  })

  it('accepts DingTalk authCode and redirects to the service result', async () => {
    const identityService = {
      handleCallback: jest.fn().mockResolvedValue({
        type: 'redirect',
        status: 302,
        location: '/sign-in/success?jwt=token'
      })
    }
    const controller = new DingTalkSsoController(identityService as any)
    const response = createResponse()

    await controller.callback(
      { headers: { host: 'xpert.example.com' }, protocol: 'https' } as any,
      response as any,
      'ding-auth-code',
      undefined,
      'signed-state'
    )

    expect(identityService.handleCallback).toHaveBeenCalledWith({
      authorizationCode: 'ding-auth-code',
      state: 'signed-state',
      oauthError: undefined,
      oauthErrorDescription: undefined,
      requestBaseUrl: 'https://xpert.example.com'
    })
    expect(response.redirect).toHaveBeenCalledWith('/sign-in/success?jwt=token')
  })

  it('uses the public address forwarded by a reverse proxy', async () => {
    const identityService = {
      startLogin: jest.fn().mockReturnValue('https://login.dingtalk.com/oauth2/auth')
    }
    const controller = new DingTalkSsoController(identityService as any)
    const response = createResponse()

    await controller.loginStart(
      {
        headers: {
          'tenant-id': 'tenant-1',
          host: 'xpert-api:3000',
          'x-forwarded-host': 'xpert.example.com, edge.internal',
          'x-forwarded-proto': 'https, http'
        },
        protocol: 'http'
      } as any,
      response as any
    )

    expect(identityService.startLogin).toHaveBeenCalledWith(
      expect.objectContaining({ requestBaseUrl: 'https://xpert.example.com' })
    )
  })
})
