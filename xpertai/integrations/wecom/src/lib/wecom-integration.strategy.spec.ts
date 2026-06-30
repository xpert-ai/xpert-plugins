import { WeComIntegrationStrategy } from './wecom-integration.strategy.js'

describe('WeComIntegrationStrategy', () => {
  it('does not expose xpertId in the webhook integration schema', () => {
    const strategy = new WeComIntegrationStrategy()

    expect((strategy.meta.schema?.properties as Record<string, unknown>)?.xpertId).toBeUndefined()
  })

  it('exposes a callback credential help button for the host integration form', () => {
    const strategy = new WeComIntegrationStrategy()

    expect(strategy.meta.helpUrl).toBe('https://developer.work.weixin.qq.com/document/path/101463')
    expect((strategy.meta as any).helpLabel).toEqual({
      en_US: 'Get Callback Config',
      zh_Hans: '获取回调配置'
    })
  })
})
