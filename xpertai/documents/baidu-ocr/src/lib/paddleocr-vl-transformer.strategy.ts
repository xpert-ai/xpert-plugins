import type { IconType, IKnowledgeDocument } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  type ChunkMetadata,
  DocumentTransformerStrategy,
  type FileSystemPermission,
  type IDocumentTransformerStrategy,
  type IntegrationPermission
} from '@xpert-ai/plugin-sdk'
import { BAIDU_IMAGE_EXTENSIONS, BAIDU_OCR, BAIDU_PADDLE_OCR_VL, icon } from './constants.js'
import { BaiduOcrTransformService } from './transform.service.js'
import { resolveBaiduParseOptions, validateBaiduIntegration } from './parse-options.js'
import type { BaiduPaddleOcrVlTransformerConfig } from './types.js'

@Injectable()
@DocumentTransformerStrategy(BAIDU_PADDLE_OCR_VL)
export class BaiduPaddleOcrVlTransformerStrategy
  implements IDocumentTransformerStrategy<BaiduPaddleOcrVlTransformerConfig>
{
  readonly permissions = [
    {
      type: 'integration',
      service: BAIDU_OCR,
      description: 'Access a Baidu OCR connection'
    } as IntegrationPermission,
    {
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: []
    } as FileSystemPermission
  ]

  readonly meta = {
    providesImageText: true,
    // Knowledgebase parser choices are narrower than the cloud API's accepted formats.
    supportedFileTypes: ['pdf', ...BAIDU_IMAGE_EXTENSIONS],
    name: BAIDU_PADDLE_OCR_VL,
    label: { en_US: 'Baidu PaddleOCR-VL', zh_Hans: '百度 PaddleOCR-VL' },
    description: {
      en_US: 'Parse PDFs and images using the official or self-hosted PaddleOCR-VL service selected in the integration.',
      zh_Hans: '使用系统集成中配置的官方或自部署 PaddleOCR-VL 服务解析 PDF 和图片。'
    },
    icon: { type: 'svg' as IconType, value: icon, color: '#2563eb' },
    helpUrl: 'https://cloud.baidu.com/doc/OCR/s/7mh8u7ruk',
    configScope: 'integration' as const,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly service: BaiduOcrTransformService) {}

  async validateConfig(config: BaiduPaddleOcrVlTransformerConfig): Promise<void> {
    const options = config.permissions?.integration?.options
    resolveBaiduParseOptions(config, options ?? {})
    if (options) validateBaiduIntegration(options, 'paddleocr-vl')
  }

  transformDocuments(
    files: Partial<IKnowledgeDocument>[],
    config: BaiduPaddleOcrVlTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]> {
    return this.service.transform('paddleocr-vl', files, config)
  }
}
