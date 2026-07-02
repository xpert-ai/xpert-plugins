import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  IntegrationStrategyKey: () => (target: unknown) => target
}))

import { WechatIntegrationStrategy } from './wechat-integration.strategy.js'

function readStrategySource() {
  return readFileSync(join(process.cwd(), 'src/lib/wechat-integration.strategy.ts'), 'utf8')
}

describe('WechatIntegrationStrategy', () => {
  function createStrategy() {
    const tunnelBroker = {
      disconnectClient: jest.fn(),
      buildSetupConfig: jest.fn((clientId = '<tunnelClientId>', clientName = 'wechat') => ({
        forwardServerInfo: {
          Url: '127.0.0.1',
          TcpPort: 8088,
          HttpPort: 8099
        },
        msgClientInfo: {
          Id: clientId,
          Name: clientName
        },
        settingJson: '{}',
        sidecar: {
          websocketUrl: `wss://api.example.com/api/wechat/tunnel/ws/${clientId}`,
          listenHost: '127.0.0.1',
          listenPort: 8088,
          command: 'node scripts/wechat-tunnel-sidecar.mjs'
        }
      }))
    }
    const strategy = new WechatIntegrationStrategy(tunnelBroker as any, {} as any)
    return { strategy, tunnelBroker }
  }

  it('declares the integration detail extension view in provider metadata', () => {
    const source = readStrategySource()

    expect(source).toContain('@IntegrationStrategyKey(WECHAT_PROVIDER_KEY)')
    expect(source).toContain("targetApps: ['data-xpert']")
    expect(source).toContain(`WECHAT_PROVIDER_KEY`)
    expect(source).toContain(`WECHAT_VIEW_KEY`)
    expect(source).toContain(`WECHAT_VIEW_PROVIDER_KEY`)
    expect(source).toContain(`WECHAT_REMOTE_ENTRY_KEY`)
    expect(source).toContain(`WECHAT_PLUGIN_NAME`)
    expect(source).toContain(`WECHAT_FEATURE`)
    expect(source).toContain(`WECHAT_RUNTIME_FEATURE`)
    expect(source).toContain(`WECHAT_WORKBENCH_FEATURE`)
    expect(source).toContain("hostType: 'integration'")
    expect(source).toContain("slot: 'detail.main_tabs'")
    expect(source).toContain("viewType: 'remote_component'")
    expect(source).toContain("runtime: 'react'")
    expect(source).toContain('viewProviders: [WECHAT_VIEW_PROVIDER_KEY]')
    expect(source).toContain('extensions: {')
    expect(source).toContain('extensionViews: [WECHAT_INTEGRATION_VIEW_EXTENSION]')
  })

  it('declares direct HTTP and reverse tunnel integration configuration without inbound trigger policy fields', () => {
    const source = readStrategySource()

    expect(source).toContain('connectionMode')
    expect(source).toContain('direct_http')
    expect(source).toContain('reverse_tunnel')
    expect(source).not.toContain('tunnelClientId: {')
    expect(source).not.toContain('Required in reverse tunnel mode')
    expect(source).toContain('outboundQueue')
    expect(source).toContain('fallbackToLegacySendText')
    expect(source).not.toContain('reverse_tunnel:/message/SetCallback?key=<uuid>')
    expect(source).not.toContain('chatFilterMode: {')
    expect(source).not.toContain('allowedGroupIds: {')
    expect(source).not.toContain('blockedGroupIds: {')
    expect(source).not.toContain('allowedSenderIds: {')
    expect(source).not.toContain('blockedSenderIds: {')
    expect(source).not.toContain('ignoreSelfMessages: {')
    expect(source).not.toContain('groupTriggerMode: {')
  })

  it('disconnects a legacy reverse tunnel client while keeping the integration id client active', async () => {
    const { strategy, tunnelBroker } = createStrategy()

    await strategy.onUpdate(
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'old-client'
        }
      } as any,
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'new-client'
        }
      } as any
    )

    expect(tunnelBroker.disconnectClient).toHaveBeenCalledWith(
      'old-client',
      'wechat integration integration-1 tunnel client id changed'
    )
  })

  it('disconnects the previous reverse tunnel client when switching back to direct HTTP', async () => {
    const { strategy, tunnelBroker } = createStrategy()

    await strategy.onUpdate(
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'old-client'
        }
      } as any,
      {
        id: 'integration-1',
        options: {
          connectionMode: 'direct_http',
          tunnelClientId: 'old-client'
        }
      } as any
    )

    expect(tunnelBroker.disconnectClient).toHaveBeenCalledWith(
      'integration-1',
      'wechat integration integration-1 tunnel client id changed'
    )
    expect(tunnelBroker.disconnectClient).toHaveBeenCalledWith(
      'old-client',
      'wechat integration integration-1 tunnel client id changed'
    )
  })

  it('keeps the current integration id tunnel client connected when reverse tunnel stays enabled', async () => {
    const { strategy, tunnelBroker } = createStrategy()

    await strategy.onUpdate(
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel'
        }
      } as any,
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel'
        }
      } as any
    )

    expect(tunnelBroker.disconnectClient).not.toHaveBeenCalled()
  })

  it('disconnects the integration id and legacy tunnel clients when the integration is deleted', async () => {
    const { strategy, tunnelBroker } = createStrategy()

    await strategy.onDelete({
      id: 'integration-1',
      options: {
        connectionMode: 'reverse_tunnel',
        tunnelClientId: 'client-1'
      }
    } as any)

    expect(tunnelBroker.disconnectClient).toHaveBeenCalledWith(
      'integration-1',
      'wechat integration integration-1 deleted'
    )
    expect(tunnelBroker.disconnectClient).toHaveBeenCalledWith(
      'client-1',
      'wechat integration integration-1 deleted'
    )
  })

  it('validates reverse tunnel config without a user-supplied tunnel client id', async () => {
    const { strategy, tunnelBroker } = createStrategy()

    const result = await strategy.validateConfig(
      {
        connectionMode: 'reverse_tunnel'
      } as any,
      {
        id: 'integration-1',
        name: 'WeChat Shenzhen'
      } as any
    )

    expect(tunnelBroker.buildSetupConfig).toHaveBeenCalledWith('integration-1', 'WeChat Shenzhen')
    expect(result.tunnel.clientId).toBe('integration-1')
    expect(result.tunnel.sidecarConfig).toEqual(
      expect.objectContaining({
        MsgClientId: 'integration-1',
        MsgClientName: 'WeChat Shenzhen',
        ListenHost: '127.0.0.1',
        ListenPort: 8088,
        InAppPageUrl: 'http://127.0.0.1:8201'
      })
    )
    expect(result.tunnel.sidecarConfigJson).toContain('"MsgClientId": "integration-1"')
  })
})
