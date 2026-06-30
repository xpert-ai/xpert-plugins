let mockTenantId: string | undefined
let mockOrganizationId: string | undefined
let mockUserId: string | undefined

jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  RequestContext: {
    currentTenantId: () => mockTenantId,
    currentUserId: () => mockUserId,
    getOrganizationId: () => mockOrganizationId
  }
}))

import { WECHAT_PROVIDER_KEY } from './constants.js'
import { WechatAccountManagementService } from './wechat-account-management.service.js'

describe('WechatAccountManagementService', () => {
  beforeEach(() => {
    mockTenantId = undefined
    mockOrganizationId = undefined
    mockUserId = undefined
  })

  function createService(overrides: Record<string, any> = {}) {
    const integration = {
      id: 'integration-1',
      provider: WECHAT_PROVIDER_KEY,
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      options: {},
      ...overrides.integration
    }
    const integrationPermissionService = {
      read: jest.fn(async () => integration),
      ...overrides.integrationPermissionService
    }
    const wechatClient = {
      bindDeviceKey: jest.fn(async () => ({ success: true, raw: { code: 0 } })),
      listDeviceAccounts: jest.fn(async () => ({ success: true, raw: { code: 0, data: [] } })),
      startDeviceLogin: jest.fn(async () => ({
        success: true,
        raw: {
          code: 0,
          data: {
            uuid: 'SDabc1234567',
            sessionId: 'session-1',
            nextAction: 'SHOW_QR',
            qrCodeUrl: 'http://qr.example/qrcode.png',
            data62: 'secret-data62',
            ticket: 'secret-ticket'
          }
        }
      })),
      pollDeviceLogin: jest.fn(async () => ({
        success: true,
        raw: {
          code: 0,
          data: {
            uuid: 'SDabc1234567',
            sessionId: 'session-1',
            nextAction: 'LOGIN_SUCCESS'
          }
        }
      })),
      verifyLoginCode: jest.fn(async () => ({ success: true, raw: { code: 0, data: {} } })),
      verifyLoginSlide: jest.fn(async () => ({ success: true, raw: { code: 0, data: {} } })),
      logoutDeviceAccount: jest.fn(async () => ({ success: true, raw: { code: 0, data: true } })),
      deleteDeviceAccount: jest.fn(async () => ({ success: true, raw: { code: 0, data: true } })),
      ...overrides.wechatClient
    }
    const accountRepository = {
      find: jest.fn(async () => []),
      upsert: jest.fn(async () => undefined),
      update: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      ...overrides.accountRepository
    }
    const cacheManager = {
      get: jest.fn(async () => undefined),
      set: jest.fn(async () => undefined),
      ...overrides.cacheManager
    }
    const pluginContext = {
      resolve: jest.fn(() => integrationPermissionService),
      ...overrides.pluginContext
    }

    return {
      service: new WechatAccountManagementService(
        wechatClient as any,
        accountRepository as any,
        cacheManager as any,
        pluginContext as any
      ),
      integration,
      integrationPermissionService,
      wechatClient,
      accountRepository,
      cacheManager,
      pluginContext
    }
  }

  it('binds a device key and upserts an offline local account in the integration scope', async () => {
    mockTenantId = 'ctx-tenant'
    mockOrganizationId = 'ctx-org'
    const { service, integration, wechatClient, accountRepository } = createService()

    await expect(service.bindDeviceKey('integration-1', 'SDabc1234567')).resolves.toEqual({ uuid: 'SDabc1234567' })

    expect(wechatClient.bindDeviceKey).toHaveBeenCalledWith(integration, { key: 'SDabc1234567' })
    expect(accountRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        uuid: 'SDabc1234567',
        ownerWxid: null,
        displayName: null,
        status: 'offline',
        enabled: true,
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      }),
      ['integrationId', 'uuid']
    )
  })

  it('maps wx2.0 account lists into local accounts and preserves disabled rows', async () => {
    const accountRepository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([{ uuid: 'SDdisabled01', enabled: false }])
        .mockResolvedValueOnce([{ uuid: 'SDonline001' }]),
      upsert: jest.fn(async () => undefined)
    }
    const { service } = createService({
      accountRepository,
      wechatClient: {
        listDeviceAccounts: jest.fn(async () => ({
          success: true,
          raw: {
            code: 0,
            data: [
              { uuid: 'SDonline001', username: 'wxid_online', nickname: '在线账号', status: 1 },
              { UUID: 'SDdisabled01', wxid: 'wxid_disabled', NickName: '禁用账号', Status: 1 },
              { key: 'SDoffline01', wxID: 'wxid_offline', nickName: '离线账号', state: 0 }
            ]
          }
        }))
      }
    })

    await expect(service.syncDeviceAccounts('integration-1')).resolves.toEqual({
      accounts: [{ uuid: 'SDonline001' }]
    })

    expect(accountRepository.upsert).toHaveBeenCalledTimes(3)
    expect(accountRepository.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        uuid: 'SDonline001',
        ownerWxid: 'wxid_online',
        displayName: '在线账号',
        status: 'online',
        enabled: true
      }),
      ['integrationId', 'uuid']
    )
    expect(accountRepository.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        uuid: 'SDdisabled01',
        ownerWxid: 'wxid_disabled',
        displayName: '禁用账号',
        status: 'disabled',
        enabled: false
      }),
      ['integrationId', 'uuid']
    )
    expect(accountRepository.upsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        uuid: 'SDoffline01',
        ownerWxid: 'wxid_offline',
        displayName: '离线账号',
        status: 'offline',
        enabled: true
      }),
      ['integrationId', 'uuid']
    )
  })

  it('caches login tickets but returns only sanitized login status fields', async () => {
    const { service, cacheManager } = createService()

    const status = await service.startDeviceLogin('integration-1', 'SDabc1234567')

    expect(status).toEqual(
      expect.objectContaining({
        uuid: 'SDabc1234567',
        sessionId: 'session-1',
        nextAction: 'SHOW_QR',
        qrCodeUrl: 'http://qr.example/qrcode.png'
      })
    )
    expect(status).not.toHaveProperty('data62')
    expect(status).not.toHaveProperty('ticket')
    expect(cacheManager.set).toHaveBeenCalledWith(
      'wechat:account-login:integration-1:SDabc1234567:session-1',
      {
        data62: 'secret-data62',
        ticket: 'secret-ticket'
      },
      600000
    )
  })

  it('syncs accounts after login success without registering legacy callbacks', async () => {
    const accountRepository = {
      find: jest.fn(async () => []),
      upsert: jest.fn(async () => undefined)
    }
    const { service, wechatClient } = createService({
      accountRepository,
      wechatClient: {
        startDeviceLogin: jest.fn(async () => ({
          success: true,
          raw: {
            code: 0,
            data: {
              uuid: 'SDabc1234567',
              sessionId: 'session-1',
              nextAction: 'LOGIN_SUCCESS'
            }
          }
        })),
        listDeviceAccounts: jest.fn(async () => ({
          success: true,
          raw: { code: 0, data: [{ uuid: 'SDabc1234567', username: 'wxid_owner', nickname: '小白', status: 1 }] }
        }))
      }
    })

    await expect(service.startDeviceLogin('integration-1', 'SDabc1234567')).resolves.toEqual(
      expect.objectContaining({
        nextAction: 'LOGIN_SUCCESS'
      })
    )

    expect(wechatClient.listDeviceAccounts).toHaveBeenCalledTimes(1)
    expect(accountRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'SDabc1234567',
        ownerWxid: 'wxid_owner',
        displayName: '小白',
        status: 'online'
      }),
      ['integrationId', 'uuid']
    )
    expect(wechatClient).not.toHaveProperty('registerCallback')
  })

  it('requires cached login tickets before code or slide verification', async () => {
    const { service, wechatClient } = createService()

    await expect(service.verifyLoginCode('integration-1', 'SDabc1234567', 'session-1', '123456')).rejects.toThrow(
      '登录票据已过期，请重新扫码登录'
    )
    await expect(
      service.verifyLoginSlide('integration-1', 'SDabc1234567', 'session-1', 'rand', 'slideticket')
    ).rejects.toThrow('登录票据已过期，请重新扫码登录')
    expect(wechatClient.verifyLoginCode).not.toHaveBeenCalled()
    expect(wechatClient.verifyLoginSlide).not.toHaveBeenCalled()
  })

  it('logs out a device account and marks the local account offline', async () => {
    const { service, integration, wechatClient, accountRepository } = createService()

    await expect(service.logoutDeviceAccount('integration-1', 'SDabc1234567')).resolves.toEqual({
      uuid: 'SDabc1234567'
    })

    expect(wechatClient.logoutDeviceAccount).toHaveBeenCalledWith(integration, { uuid: 'SDabc1234567' })
    expect(accountRepository.update).toHaveBeenCalledWith(
      {
        integrationId: 'integration-1',
        uuid: 'SDabc1234567',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      },
      {
        status: 'offline',
        lastError: null
      }
    )
  })

  it('deletes a device account from wx2.0 and removes the local account row', async () => {
    const { service, integration, wechatClient, accountRepository } = createService()

    await expect(service.deleteDeviceAccount('integration-1', 'SDabc1234567')).resolves.toEqual({
      uuid: 'SDabc1234567'
    })

    expect(wechatClient.deleteDeviceAccount).toHaveBeenCalledWith(integration, { uuid: 'SDabc1234567' })
    expect(accountRepository.delete).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      uuid: 'SDabc1234567',
      tenantId: 'tenant-1',
      organizationId: 'org-1'
    })
  })

  it('treats a wx2.0 logout false response as a failed logout', async () => {
    const { service, accountRepository } = createService({
      wechatClient: {
        logoutDeviceAccount: jest.fn(async () => ({ success: true, raw: { code: 0, data: false, text: '退出登录失败' } }))
      }
    })

    await expect(service.logoutDeviceAccount('integration-1', 'SDabc1234567')).rejects.toThrow('退出登录失败')
    expect(accountRepository.update).not.toHaveBeenCalled()
  })
})
