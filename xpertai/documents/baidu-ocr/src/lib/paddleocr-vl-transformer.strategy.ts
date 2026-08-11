import type { IconType, IKnowledgeDocument } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  type ChunkMetadata,
  DocumentTransformerStrategy,
  type FileSystemPermission,
  type IDocumentTransformerStrategy,
  type IntegrationPermission
} from '@xpert-ai/plugin-sdk'
import { BAIDU_OCR, BAIDU_PADDLE_OCR_VL, icon } from './constants.js'
import { BaiduOcrTransformService } from './transform.service.js'
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
    name: BAIDU_PADDLE_OCR_VL,
    label: { en_US: 'Baidu PaddleOCR-VL', zh_Hans: '百度 PaddleOCR-VL' },
    description: {
      en_US: 'Parse complex documents with Baidu Cloud PaddleOCR-VL and preserve pages, layouts, tables, images and coordinates.',
      zh_Hans: '使用百度智能云 PaddleOCR-VL 解析复杂文档，并保留页面、版式、表格、图片与坐标。'
    },
    icon: { type: 'svg' as IconType, value: icon, color: '#2563eb' },
    helpUrl: 'https://cloud.baidu.com/doc/OCR/s/7mh8u7ruk',
    configSchema: {
      type: 'object',
      properties: {
        analysisChart: {
          type: 'boolean',
          default: false,
          title: { en_US: 'Analyze Charts', zh_Hans: '解析统计图表' },
          description: {
            en_US: 'Ask PaddleOCR-VL to describe statistical charts.',
            zh_Hans: '调用 PaddleOCR-VL 对统计图表进行内容解析与描述。'
          }
        },
        mergeTables: {
          type: 'boolean',
          default: true,
          title: { en_US: 'Merge Cross-page Tables', zh_Hans: '合并跨页表格' }
        },
        relevelTitles: {
          type: 'boolean',
          default: true,
          title: { en_US: 'Infer Title Levels', zh_Hans: '识别标题层级' }
        },
        recognizeSeal: {
          type: 'boolean',
          default: false,
          title: { en_US: 'Recognize Seals', zh_Hans: '识别印章内容' }
        },
        returnSpanBoxes: {
          type: 'boolean',
          default: true,
          title: { en_US: 'Return Line Coordinates', zh_Hans: '返回行坐标' }
        },
        preserveRawOutput: {
          type: 'boolean',
          default: true,
          title: { en_US: 'Preserve Raw Output', zh_Hans: '保留原始结果' },
          description: {
            en_US: 'Store provider Markdown, structured JSON and task responses as scoped knowledge assets.',
            zh_Hans: '将服务返回的 Markdown、结构化 JSON 和任务响应保存为知识库作用域资产。'
          }
        },
        preserveImages: {
          type: 'boolean',
          default: true,
          title: { en_US: 'Preserve Parsed Images', zh_Hans: '保留解析图片' },
          description: {
            en_US: 'Download provider image-layout assets while their signed URLs are valid.',
            zh_Hans: '在服务返回的签名链接有效期内下载并保存图片版式资产。'
          }
        }
      },
      required: []
    }
  }

  constructor(private readonly service: BaiduOcrTransformService) {}

  validateConfig(config: BaiduPaddleOcrVlTransformerConfig): Promise<void> {
    void config
    return Promise.resolve()
  }

  transformDocuments(
    files: Partial<IKnowledgeDocument>[],
    config: BaiduPaddleOcrVlTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]> {
    return this.service.transform('paddleocr-vl', files, config)
  }
}
