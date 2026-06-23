import { readFileSync } from 'fs'
import { join } from 'path'

function readStrategySource() {
  return readFileSync(join(process.cwd(), 'src/lib/wechat-integration.strategy.ts'), 'utf8')
}

describe('WechatIntegrationStrategy', () => {
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
})
