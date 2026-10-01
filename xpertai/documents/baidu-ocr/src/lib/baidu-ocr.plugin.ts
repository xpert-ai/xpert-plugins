import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { BaiduCloudParserClient } from './baidu-cloud.client.js'
import { PaddleOcrSelfHostedClient } from './paddleocr-self-hosted.client.js'
import { BaiduOcrIntegrationStrategy } from './integration.strategy.js'
import { BaiduPaddleOcrVlTransformerStrategy } from './paddleocr-vl-transformer.strategy.js'
import { BaiduOcrTransformService } from './transform.service.js'
import { BaiduUnlimitedOcrTransformerStrategy } from './unlimited-ocr-transformer.strategy.js'

@XpertServerPlugin({
  providers: [
    BaiduCloudParserClient,
    PaddleOcrSelfHostedClient,
    BaiduOcrTransformService,
    BaiduOcrIntegrationStrategy,
    BaiduPaddleOcrVlTransformerStrategy,
    BaiduUnlimitedOcrTransformerStrategy
  ]
})
export class BaiduOcrPlugin {}
