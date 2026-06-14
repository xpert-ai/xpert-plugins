import { readFileSync } from 'fs'
import { join } from 'path'

function readStrategySource() {
  return readFileSync(join(process.cwd(), 'src/lib/wechat-personal-integration.strategy.ts'), 'utf8')
}

describe('WechatPersonalIntegrationStrategy', () => {
  it('declares the integration detail extension view in provider metadata', () => {
    const source = readStrategySource()

    expect(source).toContain('@IntegrationStrategyKey(WECHAT_PERSONAL_PROVIDER_KEY)')
    expect(source).toContain("targetApps: ['data-xpert']")
    expect(source).toContain(`WECHAT_PERSONAL_PROVIDER_KEY`)
    expect(source).toContain(`WECHAT_PERSONAL_VIEW_KEY`)
    expect(source).toContain(`WECHAT_PERSONAL_VIEW_PROVIDER_KEY`)
    expect(source).toContain(`WECHAT_PERSONAL_REMOTE_ENTRY_KEY`)
    expect(source).toContain(`WECHAT_PERSONAL_PLUGIN_NAME`)
    expect(source).toContain(`WECHAT_PERSONAL_FEATURE`)
    expect(source).toContain(`WECHAT_PERSONAL_RUNTIME_FEATURE`)
    expect(source).toContain(`WECHAT_PERSONAL_WORKBENCH_FEATURE`)
    expect(source).toContain("hostType: 'integration'")
    expect(source).toContain("slot: 'detail.main_tabs'")
    expect(source).toContain("viewType: 'remote_component'")
    expect(source).toContain("runtime: 'react'")
    expect(source).toContain('viewProviders: [WECHAT_PERSONAL_VIEW_PROVIDER_KEY]')
    expect(source).toContain('extensions: {')
    expect(source).toContain('extensionViews: [WECHAT_PERSONAL_INTEGRATION_VIEW_EXTENSION]')
  })
})
