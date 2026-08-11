import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { BaiduCloudParserClient } from './baidu-cloud.client.js'
import { BaiduOcrIntegrationStrategy } from './integration.strategy.js'
import { BaiduPaddleOcrVlTransformerStrategy } from './paddleocr-vl-transformer.strategy.js'
import { BaiduOcrTransformService } from './transform.service.js'
import { BaiduUnlimitedOcrTransformerStrategy } from './unlimited-ocr-transformer.strategy.js'

@XpertServerPlugin({
  providers: [
    BaiduCloudParserClient,
    BaiduOcrTransformService,
    BaiduOcrIntegrationStrategy,
    BaiduPaddleOcrVlTransformerStrategy,
    BaiduUnlimitedOcrTransformerStrategy
  ]
})
export class BaiduOcrPlugin {}
