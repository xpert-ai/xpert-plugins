jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => () => undefined
}))

import type { TIntegrationProvider } from '@xpert-ai/contracts'
import { BaiduOcrIntegrationStrategy } from './integration.strategy.js'

describe('BaiduOcrIntegrationStrategy', () => {
  it('declares shared credentials as secrets and does not expose a provider discriminator', () => {
    const client = { validate: jest.fn(async () => undefined) }
    const strategy = new BaiduOcrIntegrationStrategy(client as never)
    const schema = strategy.meta.schema as TIntegrationProvider['schema'] & {
      secret?: string[]
      properties?: Record<string, unknown>
    }

    expect(strategy.meta.name).toBe('baidu-ocr')
    expect(schema.secret).toEqual(['apiKey', 'secretKey'])
    expect(Object.keys(schema.properties ?? {})).toEqual([
      'apiKey',
      'secretKey',
      'uploadMode',
      'pollIntervalSeconds',
      'taskTimeoutSeconds'
    ])
    expect(schema.properties).not.toHaveProperty('provider')
  })
})
