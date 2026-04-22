jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  CHAT_CHANNEL_TEXT_LIMITS: { wecom: 1000 },
  ChatChannel: () => (target: unknown) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  RequestContext: {
    currentUser: jest.fn(),
    currentTenantId: jest.fn(),
    currentUserId: jest.fn(),
    getOrganizationId: jest.fn(),
    getLanguageCode: jest.fn()
  },
  ViewExtensionProvider: () => (target: unknown) => target,
  WorkflowTriggerStrategy: () => (target: unknown) => target,
  XpertServerPlugin: () => (target: unknown) => target,
  defineChannelMessageType: (...parts: Array<string | number>) => parts.join('.'),
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  runWithRequestContext: async (_context: unknown, _store: unknown, callback: () => unknown) => await callback()
}))

import type { IIntegration } from '@metad/contracts'
import { WeComChannelStrategy } from '../wecom-channel.strategy.js'
import { WeComLongConnectionService } from '../wecom-long-connection.service.js'
import { TIntegrationWeComLongOptions } from '../types.js'
import { WeComIntegrationViewProvider } from './wecom-integration-view.provider.js'

type WeComViewHostContext = {
  tenantId: string
  organizationId: string
  userId: string
  hostType: string
  hostId: string
  locale: string
  slots: Array<{ key: string; mode: string; order: number }>
  hostSnapshot: Record<string, unknown>
}

describe('WeComIntegrationViewProvider', () => {
  function createContext(provider = 'wecom_long'): WeComViewHostContext {
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
        name: '企微机器人',
        status: 'connected'
      }
    }
  }

  function createIntegration() {
    return {
      id: 'integration-1',
      provider: 'wecom_long',
      name: '企微机器人',
      options: {
        botId: 'bot-1',
        secret: 'secret-1',
        xpertId: 'xpert-1',
        preferLanguage: 'zh-Hans'
      }
    } as IIntegration<TIntegrationWeComLongOptions>
  }

  function createFixture() {
    const integration = createIntegration()
    const longConnectionService = {
      status: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        connectionMode: 'long_connection',
        connected: true,
        state: 'connected',
        ownerInstanceId: 'instance-1',
        lastConnectedAt: Date.parse('2026-04-01T00:00:00.000Z'),
        lastDisconnectedAt: Date.parse('2026-04-01T01:00:00.000Z'),
        lastCallbackAt: Date.parse('2026-04-01T02:00:00.000Z'),
        lastPingAt: Date.parse('2026-04-01T03:00:00.000Z'),
        lastError: null,
        reconnectAttempts: 2,
        disabledReason: null
      }),
      reconnect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }
    const wecomChannel = {
      readIntegrationById: jest.fn().mockResolvedValue(integration)
    }

    return {
      longConnectionService,
      wecomChannel,
      provider: new WeComIntegrationViewProvider(
        longConnectionService as unknown as WeComLongConnectionService,
        wecomChannel as unknown as WeComChannelStrategy
      )
    }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('supports only wecom long integration hosts', () => {
    const { provider } = createFixture()

    expect(provider.supports(createContext('wecom_long'))).toBe(true)
    expect(provider.supports(createContext('wecom'))).toBe(false)
  })

  it('declares only a status tab for integration detail main tabs', () => {
    const { provider } = createFixture()

    expect(provider.getViewManifests(createContext(), 'detail.main_tabs').map((manifest) => manifest.key)).toEqual([
      'status'
    ])
    expect(provider.getViewManifests(createContext(), 'detail.sidebar')).toEqual([])
  })

  it('loads status data from runtime status and integration metadata', async () => {
    const { provider } = createFixture()

    await expect(provider.getViewData(createContext(), 'status', {})).resolves.toEqual({
      summary: {
        connectionMode: 'long_connection',
        state: 'connected',
        botUser: '企微机器人',
        ownerInstanceId: 'instance-1',
        lastConnectedAt: '2026-04-01T00:00:00.000Z',
        lastDisconnectedAt: '2026-04-01T01:00:00.000Z',
        lastCallbackAt: '2026-04-01T02:00:00.000Z',
        lastPingAt: '2026-04-01T03:00:00.000Z',
        lastError: null,
        reconnectAttempts: 2,
        disabledReason: null
      }
    })
  })

  it('refreshes and invokes reconnect or disconnect actions', async () => {
    const { provider, longConnectionService } = createFixture()

    await expect(provider.executeViewAction(createContext(), 'status', 'refresh', {})).resolves.toEqual({
      success: true,
      message: { en_US: 'WeCom view refreshed', zh_Hans: 'WeCom 视图已刷新' },
      refresh: true
    })

    await expect(provider.executeViewAction(createContext(), 'status', 'reconnect', {})).resolves.toEqual({
      success: true,
      message: { en_US: 'WeCom long connection reconnected', zh_Hans: 'WeCom 长连接已重连' },
      refresh: true
    })
    expect(longConnectionService.reconnect).toHaveBeenCalledWith('integration-1')

    await expect(provider.executeViewAction(createContext(), 'status', 'disconnect', {})).resolves.toEqual({
      success: true,
      message: { en_US: 'WeCom long connection disconnected', zh_Hans: 'WeCom 长连接已断开' },
      refresh: true
    })
    expect(longConnectionService.disconnect).toHaveBeenCalledWith('integration-1')
  })
})
