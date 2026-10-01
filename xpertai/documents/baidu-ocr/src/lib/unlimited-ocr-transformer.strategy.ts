import type { IconType, IKnowledgeDocument } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  type ChunkMetadata,
  DocumentTransformerStrategy,
  type FileSystemPermission,
  type IDocumentTransformerStrategy,
  type IntegrationPermission
} from '@xpert-ai/plugin-sdk'
import { BAIDU_OCR, BAIDU_UNLIMITED_OCR, icon } from './constants.js'
import { BaiduOcrTransformService } from './transform.service.js'
import { resolveBaiduParseOptions, validateBaiduIntegration } from './parse-options.js'
import type { BaiduUnlimitedOcrTransformerConfig } from './types.js'

@Injectable()
@DocumentTransformerStrategy(BAIDU_UNLIMITED_OCR)
export class BaiduUnlimitedOcrTransformerStrategy
  implements IDocumentTransformerStrategy<BaiduUnlimitedOcrTransformerConfig>
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
    name: BAIDU_UNLIMITED_OCR,
    label: { en_US: 'Baidu Unlimited-OCR', zh_Hans: '百度 Unlimited-OCR' },
    description: {
      en_US: 'Parse long documents with the Baidu Cloud Unlimited-OCR service and feed Markdown into the existing pipeline.',
      zh_Hans: '使用百度智能云 Unlimited-OCR 解析长文档，并将 Markdown 接入现有文档处理链路。'
    },
    icon: { type: 'svg' as IconType, value: icon, color: '#2563eb' },
    helpUrl: 'https://cloud.baidu.com/doc/OCR/s/fmr1p39gb',
    configScope: 'integration' as const,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly service: BaiduOcrTransformService) {}

  async validateConfig(config: BaiduUnlimitedOcrTransformerConfig): Promise<void> {
    const options = config.permissions?.integration?.options
    resolveBaiduParseOptions(config, options ?? {})
    if (options) validateBaiduIntegration(options, 'unlimited-ocr')
  }

  transformDocuments(
    files: Partial<IKnowledgeDocument>[],
    config: BaiduUnlimitedOcrTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]> {
    return this.service.transform('unlimited-ocr', files, config)
  }
}
