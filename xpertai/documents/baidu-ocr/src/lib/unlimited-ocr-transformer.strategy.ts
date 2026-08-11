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
    configSchema: {
      type: 'object',
      properties: {
        preserveRawOutput: {
          type: 'boolean',
          default: true,
          title: { en_US: 'Preserve Raw Output', zh_Hans: '保留原始结果' },
          description: {
            en_US: 'Store provider Markdown, available JSON and task responses as scoped knowledge assets.',
            zh_Hans: '将服务返回的 Markdown、可用 JSON 和任务响应保存为知识库作用域资产。'
          }
        }
      },
      required: []
    }
  }

  constructor(private readonly service: BaiduOcrTransformService) {}

  validateConfig(config: BaiduUnlimitedOcrTransformerConfig): Promise<void> {
    void config
    return Promise.resolve()
  }

  transformDocuments(
    files: Partial<IKnowledgeDocument>[],
    config: BaiduUnlimitedOcrTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]> {
    return this.service.transform('unlimited-ocr', files, config)
  }
}
