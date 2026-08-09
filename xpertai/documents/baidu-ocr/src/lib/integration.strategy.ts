import type { IIntegration, TIntegrationProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  IntegrationStrategyKey,
  type IntegrationStrategy,
  type TIntegrationStrategyParams
} from '@xpert-ai/plugin-sdk'
import { BaiduCloudParserClient } from './baidu-cloud.client.js'
import { BAIDU_OCR, icon } from './constants.js'
import type { BaiduOcrIntegrationOptions } from './types.js'

@Injectable()
@IntegrationStrategyKey(BAIDU_OCR)
export class BaiduOcrIntegrationStrategy implements IntegrationStrategy<BaiduOcrIntegrationOptions> {
  readonly meta: TIntegrationProvider = {
    name: BAIDU_OCR,
    label: { en_US: 'Baidu OCR', zh_Hans: '百度 OCR' },
    description: {
      en_US: 'Shared Baidu Cloud credentials for PaddleOCR-VL and Unlimited-OCR document parsing.',
      zh_Hans: '用于 PaddleOCR-VL 与 Unlimited-OCR 文档解析的百度智能云共享凭证。'
    },
    icon: { type: 'svg', value: icon, color: '#2563eb' },
    schema: {
      type: 'object',
      secret: ['apiKey', 'secretKey'],
      properties: {
        apiKey: {
          type: 'string',
          title: { en_US: 'Baidu API Key', zh_Hans: '百度 API Key' },
          'x-ui': { component: 'secretInput' }
        },
        secretKey: {
          type: 'string',
          title: { en_US: 'Baidu Secret Key', zh_Hans: '百度 Secret Key' },
          'x-ui': { component: 'secretInput' }
        },
        uploadMode: {
          type: 'string',
          title: { en_US: 'Upload Mode', zh_Hans: '上传方式' },
          description: {
            en_US: 'Auto uses Base64 when possible. PDFs over 500 pages are split into bounded Base64 tasks.',
            zh_Hans: '自动模式会优先使用 Base64；超过 500 页的 PDF 会拆分为受限的 Base64 任务。'
          },
          default: 'auto',
          enum: ['auto', 'base64', 'url'],
          'x-ui': {
            enumLabels: {
              auto: { en_US: 'Auto', zh_Hans: '自动' },
              base64: { en_US: 'Base64', zh_Hans: 'Base64' },
              url: { en_US: 'Public URL', zh_Hans: '公开 URL' }
            }
          }
        },
        pollIntervalSeconds: {
          type: 'number',
          title: { en_US: 'Polling Interval (seconds)', zh_Hans: '轮询间隔（秒）' },
          description: {
            en_US: 'Baidu recommends polling every 5–10 seconds.',
            zh_Hans: '百度官方建议每 5～10 秒轮询一次。'
          },
          default: 7,
          'x-ui': { component: 'numberInput' }
        },
        taskTimeoutSeconds: {
          type: 'number',
          title: { en_US: 'Task Timeout (seconds)', zh_Hans: '任务超时（秒）' },
          default: 1800,
          'x-ui': { component: 'numberInput' }
        }
      },
      required: ['apiKey', 'secretKey']
    },
    features: [],
    helpUrl: 'https://cloud.baidu.com/doc/OCR/s/7mh8u7ruk'
  }

  constructor(private readonly client: BaiduCloudParserClient) {}

  execute(integration: IIntegration<BaiduOcrIntegrationOptions>, payload: TIntegrationStrategyParams): Promise<never> {
    void integration
    void payload
    return Promise.reject(new Error('Baidu OCR integration does not expose executable actions'))
  }

  validateConfig(config: BaiduOcrIntegrationOptions): Promise<void> {
    return this.client.validate(config)
  }
}
