jest.mock('@xpert-ai/plugin-sdk', () => ({
  IntegrationStrategyKey: () => () => undefined
}))

import type { TIntegrationProvider } from '@xpert-ai/contracts'
import axios, { type InternalAxiosRequestConfig } from 'axios'
import { BaiduCloudParserClient, baiduCloudClientTestHelpers } from './baidu-cloud.client.js'
import { PaddleOcrSelfHostedClient } from './paddleocr-self-hosted.client.js'
import { BaiduOcrIntegrationStrategy } from './integration.strategy.js'

describe('BaiduOcrIntegrationStrategy', () => {
  it('tests historical official credentials and new self-hosted connections through the correct client', async () => {
    baiduCloudClientTestHelpers.tokenCache.clear()
    const officialRequests: InternalAxiosRequestConfig[] = []
    const selfHostedRequests: InternalAxiosRequestConfig[] = []
    const strategy = new BaiduOcrIntegrationStrategy(
      new BaiduCloudParserClient(
        axios.create({
          adapter: async (config) => {
            officialRequests.push(config)
            return {
              data: { access_token: 'test', expires_in: 3600 },
              status: 200,
              statusText: 'OK',
              headers: {},
              config
            }
          }
        })
      ),
      new PaddleOcrSelfHostedClient(
        axios.create({
          adapter: async (config) => {
            selfHostedRequests.push(config)
            return { data: {}, status: 405, statusText: '', headers: {}, config }
          }
        })
      )
    )
    await strategy.validateConfig({ apiKey: 'key', secretKey: 'secret' })
    expect(officialRequests).toHaveLength(1)
    expect(selfHostedRequests).toHaveLength(0)
    await strategy.validateConfig({ serverType: 'self-hosted', apiUrl: 'http://paddleocr:8080' })
    expect(officialRequests).toHaveLength(1)
    expect(selfHostedRequests).toHaveLength(1)
  })

  it('declares shared credentials as secrets and does not expose a provider discriminator', () => {
    const client = { validate: jest.fn(async () => undefined) }
    const strategy = new BaiduOcrIntegrationStrategy(client as never)
    const schema = strategy.meta.schema as TIntegrationProvider['schema'] & {
      secret?: string[]
      properties?: Record<string, unknown>
    }

    expect(strategy.meta.name).toBe('baidu-ocr')
    expect(schema.secret).toEqual(['apiKey', 'secretKey'])
    expect(schema.properties).toMatchObject({
      serverType: { default: 'official', enum: ['official', 'self-hosted'] },
      apiKey: { 'x-ui': { visibleWhen: { name: 'serverType', value: 'official' } } },
      apiUrl: { 'x-ui': { visibleWhen: { name: 'serverType', value: 'self-hosted' } } },
      analysisChart: { default: false, 'x-ui': { component: 'checkbox' } },
      recognizeSeal: { default: false, 'x-ui': { component: 'checkbox' } }
    })
    expect(schema.required ?? []).not.toContain('apiKey')
    expect(schema.properties).not.toHaveProperty('provider')
  })
})
