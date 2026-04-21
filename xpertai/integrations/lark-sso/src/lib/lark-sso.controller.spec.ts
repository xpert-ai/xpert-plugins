jest.mock('@xpert-ai/plugin-sdk', () => ({
  ACCOUNT_BINDING_PERMISSION_SERVICE_TOKEN: 'ACCOUNT_BINDING_PERMISSION_SERVICE_TOKEN',
  runWithRequestContext: jest.fn((_req: unknown, _res: unknown, next: () => void) => next())
}))

import { LarkSsoController } from './lark-sso.controller.js'

describe('LarkSsoController', () => {
  function createResponse() {
    const json = jest.fn()
    const statusJson = jest.fn()
    return {
      redirect: jest.fn(),
      json,
      statusJson,
      status: jest.fn().mockReturnValue({ json: statusJson })
    }
  }

  it('starts login with tenant context injected by the host', async () => {
    const identityService = {
      startLogin: jest.fn().mockReturnValue('https://open.feishu.cn/open-apis/authen/v1/index')
    }
    const controller = new LarkSsoController(identityService as any)
    const response = createResponse()

    await controller.loginStart(
      {
        headers: {
          'tenant-id': 'tenant-1',
          'organization-id': 'org-1',
          host: 'xpert.example.com'
        },
        protocol: 'https'
      } as any,
      response as any,
      '/settings/account'
    )

    expect(identityService.startLogin).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      returnTo: '/settings/account',
      requestBaseUrl: 'https://xpert.example.com'
    })
    expect(response.redirect).toHaveBeenCalledWith('https://open.feishu.cn/open-apis/authen/v1/index')
  })

  it('returns tenant_required when the host did not inject tenant context', async () => {
    const controller = new LarkSsoController({
      startLogin: jest.fn()
    } as any)
    const response = createResponse()

    await controller.loginStart(
      {
        headers: {
          host: 'xpert.example.com'
        },
        protocol: 'https'
      } as any,
      response as any
    )

    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.statusJson).toHaveBeenCalledWith({
      success: false,
      code: 'tenant_required',
      message: 'tenantId is missing from the current request context.'
    })
  })
})
