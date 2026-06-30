jest.mock('@xpert-ai/plugin-sdk', () => ({
  ViewExtensionProvider: () => (target: unknown) => target,
  renderRemoteReactIframeHtml: jest.fn(() => '<html></html>'),
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

jest.mock('../conversation.service.js', () => ({
  WechatConversationService: class WechatConversationService {}
}))

jest.mock('../wechat-channel.strategy.js', () => ({
  WechatChannelStrategy: class WechatChannelStrategy {}
}))

import {
  AGENT_WORKBENCH_FIXED_SLOT,
  WECHAT_FEATURE,
  WECHAT_PROVIDER_KEY,
  WECHAT_VIEW_KEY
} from '../constants.js'
import { WechatViewProvider } from './wechat-view.provider.js'

describe('WechatViewProvider', () => {
  function createProvider(
    conversationService: Record<string, unknown> = {},
    accountManagement: Record<string, unknown> = {}
  ) {
    return new WechatViewProvider(conversationService as any, accountManagement as any, {} as any, {} as any)
  }

  it('declares the workbench tab for WeChat integration hosts without feature activation', async () => {
    const provider = createProvider()
    const manifests = await provider.getViewManifests(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'integration',
        hostId: 'integration-1',
        slots: [{ key: 'detail.main_tabs', mode: 'tabs', order: 0 }],
        hostSnapshot: {
          provider: WECHAT_PROVIDER_KEY,
          type: WECHAT_PROVIDER_KEY
        }
      } as any,
      'detail.main_tabs'
    )

    expect(manifests.map((manifest) => manifest.key)).toEqual([WECHAT_VIEW_KEY])
    expect(manifests[0].activation).toBeUndefined()
    expect(manifests[0].hostType).toBe('integration')
    expect(manifests[0].slot).toBe('detail.main_tabs')
  })

  it('keeps feature activation for agent workbench manifests', async () => {
    const provider = createProvider()
    const manifests = await provider.getViewManifests(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: AGENT_WORKBENCH_FIXED_SLOT, mode: 'tabs', order: 0 }]
      } as any,
      AGENT_WORKBENCH_FIXED_SLOT
    )

    expect(manifests.map((manifest) => manifest.key)).toEqual([WECHAT_VIEW_KEY])
    expect(manifests[0].activation?.requiredFeatures).toEqual([WECHAT_FEATURE])
  })

  it('falls back to the assistant trigger binding when the view query has no integration id', async () => {
    const conversationService = {
      getBoundIntegrationIdForXpert: jest.fn(async () => 'integration-1'),
      getWorkbenchData: jest.fn(async () => ({
        summary: {
          accountCount: 1,
          recentMessageCount: 0,
          errorCount: 0
        }
      }))
    }
    const provider = createProvider(conversationService)

    const result = await provider.getViewData(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: []
      } as any,
      WECHAT_VIEW_KEY,
      {
        page: 1,
        pageSize: 50
      }
    )

    expect(conversationService.getBoundIntegrationIdForXpert).toHaveBeenCalledWith('xpert-1')
    expect(conversationService.getWorkbenchData).toHaveBeenCalledWith('integration-1', {
      search: undefined,
      page: 1,
      pageSize: 50
    })
    expect(result).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({ accountCount: 1 })
      })
    )
  })

  it('returns organization workbench data for an agent without a bound integration', async () => {
    const conversationService = {
      getBoundIntegrationIdForXpert: jest.fn(async () => null),
      getOrganizationWorkbenchData: jest.fn(async () => ({
        scope: 'organization',
        summary: {
          integrationCount: 2,
          accountCount: 3,
          recentMessageCount: 0,
          errorCount: 0
        }
      }))
    }
    const provider = createProvider(conversationService)

    const result = await provider.getViewData(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-admin',
        slots: []
      } as any,
      WECHAT_VIEW_KEY,
      {
        page: 1,
        pageSize: 50,
        search: 'wxid'
      }
    )

    expect(conversationService.getBoundIntegrationIdForXpert).toHaveBeenCalledWith('xpert-admin')
    expect(conversationService.getOrganizationWorkbenchData).toHaveBeenCalledWith({
      search: 'wxid',
      page: 1,
      pageSize: 50
    })
    expect(result).toEqual(
      expect.objectContaining({
        scope: 'organization',
        summary: expect.objectContaining({ integrationCount: 2 })
      })
    )
  })

  it('routes remote paged table requests to the organization table loader', async () => {
    const conversationService = {
      getBoundIntegrationIdForXpert: jest.fn(async () => null),
      getOrganizationWorkbenchTableData: jest.fn(async () => ({
        key: 'messages',
        items: [],
        total: 0,
        page: 2,
        pageSize: 20
      }))
    }
    const provider = createProvider(conversationService)

    const result = await provider.getViewData(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-admin',
        slots: []
      } as any,
      WECHAT_VIEW_KEY,
      {
        page: 2,
        pageSize: 20,
        search: 'hello',
        parameters: {
          table: 'messages',
          filtersJson: JSON.stringify({
            direction: 'inbound',
            status: 'failed'
          })
        }
      }
    )

    expect(conversationService.getOrganizationWorkbenchTableData).toHaveBeenCalledWith('messages', {
      search: 'hello',
      page: 2,
      pageSize: 20,
      filters: {
        direction: 'inbound',
        status: 'failed'
      }
    })
    expect(result).toEqual(
      expect.objectContaining({
        scope: 'organization',
        tableKey: 'messages',
        table: expect.objectContaining({ page: 2, pageSize: 20 })
      })
    )
  })

  it('routes tunnel client table requests to the organization table loader', async () => {
    const conversationService = {
      getBoundIntegrationIdForXpert: jest.fn(async () => null),
      getOrganizationWorkbenchTableData: jest.fn(async () => ({
        key: 'tunnelClients',
        items: [
          {
            clientId: 'client-1',
            connected: true
          }
        ],
        total: 1,
        page: 1,
        pageSize: 20
      }))
    }
    const provider = createProvider(conversationService)

    const result = await provider.getViewData(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-admin',
        slots: []
      } as any,
      WECHAT_VIEW_KEY,
      {
        page: 1,
        pageSize: 20,
        parameters: {
          table: 'tunnelClients',
          filtersJson: JSON.stringify({
            status: 'connected'
          })
        }
      }
    )

    expect(conversationService.getOrganizationWorkbenchTableData).toHaveBeenCalledWith('tunnelClients', {
      search: undefined,
      page: 1,
      pageSize: 20,
      filters: {
        status: 'connected'
      }
    })
    expect(result).toEqual(
      expect.objectContaining({
        scope: 'organization',
        tableKey: 'tunnelClients',
        table: expect.objectContaining({ total: 1 })
      })
    )
  })

  it('routes remote paged table requests to the integration table loader', async () => {
    const conversationService = {
      getWorkbenchTableData: jest.fn(async () => ({
        key: 'accounts',
        items: [],
        total: 0,
        page: 1,
        pageSize: 10
      }))
    }
    const provider = createProvider(conversationService)

    await provider.getViewData(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'integration',
        hostId: 'integration-1',
        slots: []
      } as any,
      WECHAT_VIEW_KEY,
      {
        page: 1,
        pageSize: 10,
        parameters: {
          table: 'accounts',
          filtersJson: JSON.stringify({
            status: 'online'
          })
        }
      }
    )

    expect(conversationService.getWorkbenchTableData).toHaveBeenCalledWith('integration-1', 'accounts', {
      search: undefined,
      page: 1,
      pageSize: 10,
      filters: {
        status: 'online'
      }
    })
  })

  it('accepts view-host query parameters serialized as a JSON string', async () => {
    const conversationService = {
      getWorkbenchTableData: jest.fn(async () => ({
        key: 'messages',
        items: [],
        total: 0,
        page: 1,
        pageSize: 20
      }))
    }
    const provider = createProvider(conversationService)

    const result = await provider.getViewData(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'integration',
        hostId: '75a9a030-6413-4125-b561-e60cd8f05bde',
        slots: []
      } as any,
      WECHAT_VIEW_KEY,
      {
        page: 1,
        pageSize: 20,
        parameters: JSON.stringify({
          table: 'messages',
          filtersJson: '{}'
        })
      } as any
    )

    expect(conversationService.getWorkbenchTableData).toHaveBeenCalledWith(
      '75a9a030-6413-4125-b561-e60cd8f05bde',
      'messages',
      {
        search: undefined,
        page: 1,
        pageSize: 20,
        filters: {}
      }
    )
    expect(result).toEqual(
      expect.objectContaining({
        scope: 'integration',
        tableKey: 'messages',
        table: expect.objectContaining({ key: 'messages' })
      })
    )
  })

  it('declares device account login actions in the manifest', async () => {
    const provider = createProvider()
    const [manifest] = await provider.getViewManifests(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'integration',
        hostId: 'integration-1',
        slots: [{ key: 'detail.main_tabs', mode: 'tabs', order: 0 }],
        hostSnapshot: {
          provider: WECHAT_PROVIDER_KEY
        }
      } as any,
      'detail.main_tabs'
    )

    expect(manifest.actions?.map((action) => action.key)).toEqual(
      expect.arrayContaining([
        'bind_device_key',
        'start_device_login',
        'poll_device_login',
        'verify_device_login_code',
        'verify_device_login_slide',
        'sync_device_accounts',
        'logout_device_account',
        'delete_device_account'
      ])
    )
  })

  it('routes device login actions to the account management service', async () => {
    const accountManagement = {
      bindDeviceKey: jest.fn(async () => ({ uuid: 'SDabc1234567' })),
      startDeviceLogin: jest.fn(async () => ({ uuid: 'SDabc1234567', nextAction: 'SHOW_QR' })),
      pollDeviceLogin: jest.fn(async () => ({ uuid: 'SDabc1234567', nextAction: 'SHOW_SCANNED_AVATAR' })),
      verifyLoginCode: jest.fn(async () => ({ uuid: 'SDabc1234567', nextAction: 'LOGIN_SUCCESS' })),
      verifyLoginSlide: jest.fn(async () => ({ uuid: 'SDabc1234567', nextAction: 'LOGIN_SUCCESS' })),
      syncDeviceAccounts: jest.fn(async () => ({ accounts: [] })),
      logoutDeviceAccount: jest.fn(async () => ({ uuid: 'SDabc1234567' })),
      deleteDeviceAccount: jest.fn(async () => ({ uuid: 'SDabc1234567' }))
    }
    const provider = createProvider({}, accountManagement)
    const context = {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      hostType: 'integration',
      hostId: 'integration-1',
      slots: []
    } as any

    const bindResult = await provider.executeViewAction(context, WECHAT_VIEW_KEY, 'bind_device_key', {
      input: { key: 'SDabc1234567' }
    } as any)
    const startResult = await provider.executeViewAction(context, WECHAT_VIEW_KEY, 'start_device_login', {
      input: { uuid: 'SDabc1234567' }
    } as any)
    await provider.executeViewAction(context, WECHAT_VIEW_KEY, 'poll_device_login', {
      input: { uuid: 'SDabc1234567', sessionId: 'session-1' }
    } as any)
    await provider.executeViewAction(context, WECHAT_VIEW_KEY, 'verify_device_login_code', {
      input: { uuid: 'SDabc1234567', sessionId: 'session-1', code: '123456' }
    } as any)
    await provider.executeViewAction(context, WECHAT_VIEW_KEY, 'verify_device_login_slide', {
      input: { uuid: 'SDabc1234567', sessionId: 'session-1', randstr: 'rand', slideticket: 'slide' }
    } as any)
    await provider.executeViewAction(context, WECHAT_VIEW_KEY, 'sync_device_accounts', { input: {} } as any)
    await provider.executeViewAction(context, WECHAT_VIEW_KEY, 'logout_device_account', {
      input: { uuid: 'SDabc1234567' }
    } as any)
    await provider.executeViewAction(context, WECHAT_VIEW_KEY, 'delete_device_account', {
      input: { uuid: 'SDabc1234567' }
    } as any)

    expect(accountManagement.bindDeviceKey).toHaveBeenCalledWith('integration-1', 'SDabc1234567')
    expect(accountManagement.startDeviceLogin).toHaveBeenCalledWith('integration-1', 'SDabc1234567')
    expect(accountManagement.pollDeviceLogin).toHaveBeenCalledWith('integration-1', 'SDabc1234567', 'session-1')
    expect(accountManagement.verifyLoginCode).toHaveBeenCalledWith('integration-1', 'SDabc1234567', 'session-1', '123456')
    expect(accountManagement.verifyLoginSlide).toHaveBeenCalledWith('integration-1', 'SDabc1234567', 'session-1', 'rand', 'slide')
    expect(accountManagement.syncDeviceAccounts).toHaveBeenCalledWith('integration-1')
    expect(accountManagement.logoutDeviceAccount).toHaveBeenCalledWith('integration-1', 'SDabc1234567')
    expect(accountManagement.deleteDeviceAccount).toHaveBeenCalledWith('integration-1', 'SDabc1234567')
    expect(bindResult).toEqual(expect.objectContaining({ success: true, data: { uuid: 'SDabc1234567' } }))
    expect(startResult).toEqual(expect.objectContaining({ success: true, data: expect.objectContaining({ nextAction: 'SHOW_QR' }) }))
  })

  it('returns a failed result when a device action has no integration id', async () => {
    const conversationService = {
      getBoundIntegrationIdForXpert: jest.fn(async () => null)
    }
    const accountManagement = {
      bindDeviceKey: jest.fn()
    }
    const provider = createProvider(conversationService, accountManagement)

    const result = await provider.executeViewAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-admin',
        slots: []
      } as any,
      WECHAT_VIEW_KEY,
      'bind_device_key',
      {
        input: { key: 'SDabc1234567' }
      } as any
    )

    expect(accountManagement.bindDeviceKey).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ success: false }))
  })

  it('surfaces account management validation failures', async () => {
    const accountManagement = {
      bindDeviceKey: jest.fn(async () => {
        throw new Error('请输入 SD 开头的 12 位设备 key')
      })
    }
    const provider = createProvider({}, accountManagement)

    const result = await provider.executeViewAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'integration',
        hostId: 'integration-1',
        slots: []
      } as any,
      WECHAT_VIEW_KEY,
      'bind_device_key',
      {
        input: { key: 'bad' }
      } as any
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: {
          en_US: '请输入 SD 开头的 12 位设备 key',
          zh_Hans: '请输入 SD 开头的 12 位设备 key'
        }
      })
    )
  })

  it('disconnects tunnel clients without requiring an integration id', async () => {
    const conversationService = {
      disconnectTunnelClient: jest.fn(() => true)
    }
    const provider = createProvider(conversationService)

    const result = await provider.executeViewAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-admin',
        slots: []
      } as any,
      WECHAT_VIEW_KEY,
      'disconnect_tunnel_client',
      {
        input: {
          clientId: 'client-1'
        }
      } as any
    )

    expect(conversationService.disconnectTunnelClient).toHaveBeenCalledWith('client-1')
    expect(result).toEqual(
      expect.objectContaining({
        success: true
      })
    )
  })
})
