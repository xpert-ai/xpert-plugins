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
      buildSetupConfig: jest.fn(() => ({
        forwardServerInfo: {},
        msgClientInfo: {},
        settingJson: '{}',
        sidecar: {}
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
    expect(source).toContain('tunnelClientId')
    expect(source).toContain('outboundQueue')
    expect(source).toContain('fallbackToLegacySendText')
    expect(source).toContain('reverse_tunnel:/message/SetCallback?key=<uuid>')
    expect(source).not.toContain('chatFilterMode: {')
    expect(source).not.toContain('allowedGroupIds: {')
    expect(source).not.toContain('blockedGroupIds: {')
    expect(source).not.toContain('allowedSenderIds: {')
    expect(source).not.toContain('blockedSenderIds: {')
    expect(source).not.toContain('ignoreSelfMessages: {')
    expect(source).not.toContain('groupTriggerMode: {')
  })

  it('disconnects the previous reverse tunnel client when the integration client id changes', async () => {
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
      'old-client',
      'wechat integration integration-1 tunnel client id changed'
    )
  })

  it('keeps the current tunnel client connected when the client id is unchanged', async () => {
    const { strategy, tunnelBroker } = createStrategy()

    await strategy.onUpdate(
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'client-1'
        }
      } as any,
      {
        id: 'integration-1',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'client-1'
        }
      } as any
    )

    expect(tunnelBroker.disconnectClient).not.toHaveBeenCalled()
  })

  it('disconnects the tunnel client when the integration is deleted', async () => {
    const { strategy, tunnelBroker } = createStrategy()

    await strategy.onDelete({
      id: 'integration-1',
      options: {
        connectionMode: 'reverse_tunnel',
        tunnelClientId: 'client-1'
      }
    } as any)

    expect(tunnelBroker.disconnectClient).toHaveBeenCalledWith(
      'client-1',
      'wechat integration integration-1 deleted'
    )
  })
})
