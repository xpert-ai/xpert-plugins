jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  ViewExtensionProvider: () => (target: unknown) => target,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

jest.mock('../dingtalk-long-connection.service.js', () => ({
  DingTalkLongConnectionService: class DingTalkLongConnectionService {}
}))

import type { IIntegration } from '@xpert-ai/contracts'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { DingTalkLongConnectionService } from '../dingtalk-long-connection.service.js'
import {
  INTEGRATION_DINGTALK,
  INTEGRATION_DINGTALK_LONG,
  type TIntegrationDingTalkOptions
} from '../types.js'
import { DingTalkIntegrationViewProvider } from './dingtalk-integration-view.provider.js'

describe('DingTalkIntegrationViewProvider', () => {
  function createContext(provider = INTEGRATION_DINGTALK_LONG): XpertResolvedViewHostContext {
    return {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      hostType: 'integration',
      hostId: 'integration-1',
      locale: 'zh-Hans',
      slots: [{ key: 'detail.main_tabs', mode: 'tabs', order: 0 }],
      hostSnapshot: {
        id: 'integration-1',
        provider,
        type: provider,
        name: '钉钉机器人',
        status: 'connected'
      }
    }
  }

  function createIntegration(provider = INTEGRATION_DINGTALK_LONG) {
    return {
      id: 'integration-1',
      provider,
      name: '钉钉机器人',
      options: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        robotCode: 'robot-code',
        callbackToken: provider === INTEGRATION_DINGTALK ? 'token' : undefined,
        callbackAesKey: provider === INTEGRATION_DINGTALK ? 'aes-key' : undefined,
        preferLanguage: 'zh-Hans'
      }
    } as IIntegration<TIntegrationDingTalkOptions>
  }

  function createFixture(providerValue = INTEGRATION_DINGTALK_LONG) {
    const integration = createIntegration(providerValue)
    const longConnectionService = {
      status: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        connectionMode: providerValue === INTEGRATION_DINGTALK_LONG ? 'long_connection' : 'webhook',
        connected: providerValue === INTEGRATION_DINGTALK_LONG,
        state: providerValue === INTEGRATION_DINGTALK_LONG ? 'connected' : 'idle',
        lastConnectedAt:
          providerValue === INTEGRATION_DINGTALK_LONG ? Date.parse('2026-04-01T00:00:00.000Z') : null,
        lastDisconnectedAt:
          providerValue === INTEGRATION_DINGTALK_LONG ? Date.parse('2026-04-01T01:00:00.000Z') : null,
        lastCallbackAt: Date.parse('2026-04-01T02:00:00.000Z'),
        lastError: null,
        reconnectAttempts: 2
      }),
      reconnect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue(integration)
    }
    const pluginContext = {
      resolve: jest.fn().mockReturnValue(integrationPermissionService)
    }

    return {
      longConnectionService,
      integrationPermissionService,
      provider: new DingTalkIntegrationViewProvider(
        longConnectionService as unknown as DingTalkLongConnectionService,
        pluginContext as any
      )
    }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('supports both DingTalk HTTP and Stream integration hosts', () => {
    const { provider } = createFixture()

    expect(provider.supports(createContext(INTEGRATION_DINGTALK))).toBe(true)
    expect(provider.supports(createContext(INTEGRATION_DINGTALK_LONG))).toBe(true)
    expect(provider.supports(createContext('wecom'))).toBe(false)
  })

  it('declares a status tab for both HTTP and Stream integrations', () => {
    const { provider } = createFixture()

    expect(
      provider.getViewManifests(createContext(INTEGRATION_DINGTALK), 'detail.main_tabs').map((manifest) => manifest.key)
    ).toEqual(['status'])
    expect(
      provider
        .getViewManifests(createContext(INTEGRATION_DINGTALK_LONG), 'detail.main_tabs')
        .map((manifest) => manifest.key)
    ).toEqual(['status'])
    expect(provider.getViewManifests(createContext(INTEGRATION_DINGTALK), 'detail.sidebar')).toEqual([])
  })

  it('loads Stream status data from runtime status and integration metadata', async () => {
    const { provider } = createFixture(INTEGRATION_DINGTALK_LONG)

    await expect(provider.getViewData(createContext(INTEGRATION_DINGTALK_LONG), 'status', {})).resolves.toEqual({
      summary: {
        connectionMode: 'long_connection',
        state: 'connected',
        botUser: '钉钉机器人',
        callbackUrl: null,
        callbackTokenConfigured: 'N/A',
        callbackAesKeyConfigured: 'N/A',
        streamSubscriptions: '/v1.0/im/bot/messages/get, /v1.0/card/instances/callback',
        lastConnectedAt: '2026-04-01T00:00:00.000Z',
        lastDisconnectedAt: '2026-04-01T01:00:00.000Z',
        lastCallbackAt: '2026-04-01T02:00:00.000Z',
        lastError: null,
        reconnectAttempts: 2
      }
    })
  })

  it('loads HTTP status data without exposing callback secrets', async () => {
    const { provider } = createFixture(INTEGRATION_DINGTALK)

    await expect(provider.getViewData(createContext(INTEGRATION_DINGTALK), 'status', {})).resolves.toEqual({
      summary: expect.objectContaining({
        connectionMode: 'webhook',
        state: 'idle',
        botUser: '钉钉机器人',
        callbackUrl: expect.stringContaining('/api/dingtalk/webhook/integration-1'),
        callbackTokenConfigured: 'Yes',
        callbackAesKeyConfigured: 'Yes',
        streamSubscriptions: 'N/A'
      })
    })
  })

  it('refreshes status and restricts connection actions to Stream mode', async () => {
    const { provider, longConnectionService } = createFixture(INTEGRATION_DINGTALK_LONG)

    await expect(provider.executeViewAction(createContext(), 'status', 'refresh', {})).resolves.toEqual({
      success: true,
      message: { en_US: 'DingTalk view refreshed', zh_Hans: '钉钉视图已刷新' },
      refresh: true
    })

    await expect(provider.executeViewAction(createContext(), 'status', 'reconnect', {})).resolves.toEqual({
      success: true,
      message: { en_US: 'DingTalk Stream connection reconnected', zh_Hans: '钉钉 Stream 连接已重连' },
      refresh: true
    })
    expect(longConnectionService.reconnect).toHaveBeenCalledWith('integration-1')
  })

  it('rejects reconnect for HTTP mode without touching the runtime connection', async () => {
    const { provider, longConnectionService } = createFixture(INTEGRATION_DINGTALK)

    await expect(
      provider.executeViewAction(createContext(INTEGRATION_DINGTALK), 'status', 'reconnect', {})
    ).resolves.toEqual({
      success: false,
      message: {
        en_US: 'This action is only available for Stream mode',
        zh_Hans: '该操作仅适用于 Stream 模式'
      }
    })
    expect(longConnectionService.reconnect).not.toHaveBeenCalled()
  })
})
