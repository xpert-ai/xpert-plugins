import { WeComIntegrationStrategy } from './wecom-integration.strategy.js'

describe('WeComIntegrationStrategy', () => {
  it('does not expose xpertId in the webhook integration schema', () => {
    const strategy = new WeComIntegrationStrategy()

    expect((strategy.meta.schema?.properties as Record<string, unknown>)?.xpertId).toBeUndefined()
  })
})
