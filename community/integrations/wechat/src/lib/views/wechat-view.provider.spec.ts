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
  function createProvider(conversationService: Record<string, unknown> = {}) {
    return new WechatViewProvider(conversationService as any, {} as any, {} as any)
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
          conversationCount: 0,
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
          conversationCount: 0,
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
        key: 'conversations',
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
          table: 'conversations',
          filtersJson: '{}'
        })
      } as any
    )

    expect(conversationService.getWorkbenchTableData).toHaveBeenCalledWith(
      '75a9a030-6413-4125-b561-e60cd8f05bde',
      'conversations',
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
        tableKey: 'conversations',
        table: expect.objectContaining({ key: 'conversations' })
      })
    )
  })
})
