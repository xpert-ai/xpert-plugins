import type { IIntegration, TIntegrationProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { IntegrationStrategyKey, type IntegrationStrategy, type TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { BaiduCloudParserClient } from './baidu-cloud.client.js'
import { BAIDU_OCR, icon } from './constants.js'
import { baiduOcrIntegrationSchema } from './integration.schema.js'
import { baiduOcrServerType, validateBaiduIntegration } from './parse-options.js'
import { PaddleOcrSelfHostedClient } from './paddleocr-self-hosted.client.js'
import type { BaiduOcrIntegrationOptions } from './types.js'

@Injectable()
@IntegrationStrategyKey(BAIDU_OCR)
export class BaiduOcrIntegrationStrategy implements IntegrationStrategy<BaiduOcrIntegrationOptions> {
  readonly meta: TIntegrationProvider = {
    name: BAIDU_OCR,
    label: { en_US: 'Baidu OCR', zh_Hans: '百度 OCR' },
    description: {
      en_US: 'Configure Baidu Cloud parsing or a self-hosted PaddleOCR-VL pipeline.',
      zh_Hans: '配置百度智能云解析服务或自部署 PaddleOCR-VL 产线。Unlimited-OCR 仅支持官方服务。'
    },
    icon: { type: 'svg', value: icon, color: '#2563eb' },
    schema: baiduOcrIntegrationSchema,
    features: [],
    helpUrl: 'https://cloud.baidu.com/doc/OCR/s/7mh8u7ruk'
  }

  constructor(
    private readonly client: BaiduCloudParserClient,
    private readonly selfHosted: PaddleOcrSelfHostedClient = new PaddleOcrSelfHostedClient()
  ) {}

  execute(integration: IIntegration<BaiduOcrIntegrationOptions>, payload: TIntegrationStrategyParams): Promise<never> {
    void integration
    void payload
    return Promise.reject(new Error('Baidu OCR integration does not expose executable actions'))
  }

  async validateConfig(config: BaiduOcrIntegrationOptions): Promise<void> {
    validateBaiduIntegration(config)
    return baiduOcrServerType(config) === 'self-hosted'
      ? this.selfHosted.validate(config)
      : this.client.validate(config)
  }
}
