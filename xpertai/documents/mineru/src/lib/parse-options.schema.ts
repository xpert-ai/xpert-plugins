import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

const official = { name: 'serverType', value: 'official' }
const selfHosted = { name: 'serverType', value: 'self-hosted' }

export const minerUParseOptionsSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    modelVersion: {
      type: 'string',
      title: { en_US: 'Model Version', zh_Hans: '模型版本' },
      enum: ['vlm', 'pipeline'],
      default: 'vlm',
      'x-ui': {
        span: 3,
        visibleWhen: official,
        enumLabels: {
          vlm: { en_US: 'VLM (Vision Language Model)', zh_Hans: 'vlm（视觉语言模型）' },
          pipeline: 'pipeline'
        }
      }
    },
    selfHostedBackend: {
      type: 'string',
      title: { en_US: 'Backend', zh_Hans: 'Backend' },
      enum: ['pipeline', 'hybrid-engine', 'vlm-engine', 'vlm-http-client', 'hybrid-http-client'],
      default: 'pipeline',
      'x-ui': { span: 3, visibleWhen: selfHosted }
    },
    selfHostedServerUrl: {
      type: 'string',
      title: { en_US: 'Model Server URL', zh_Hans: '模型服务地址' },
      description: {
        en_US: 'OpenAI-compatible model server used by the HTTP client backend.',
        zh_Hans: 'HTTP Client 后端连接的模型服务地址。'
      },
      'x-ui': {
        span: 3,
        visibleWhen: [selfHosted, { name: 'selfHostedBackend', values: ['vlm-http-client', 'hybrid-http-client'] }]
      }
    },
    parseMethod: {
      type: 'string',
      title: { en_US: 'PDF Parsing Method', zh_Hans: 'PDF 解析方式' },
      enum: ['auto', 'ocr', 'txt'],
      default: 'auto',
      'x-ui': {
        span: 3,
        visibleWhen: selfHosted,
        enumLabels: {
          auto: { en_US: 'Auto (Recommended)', zh_Hans: '自动识别（推荐）' },
          ocr: { en_US: 'Force OCR', zh_Hans: '强制 OCR' },
          txt: { en_US: 'Text Only', zh_Hans: '仅提取文本' }
        }
      }
    },
    enableFormula: {
      type: 'boolean',
      title: { en_US: 'Formulas', zh_Hans: '公式识别' },
      default: true,
      'x-ui': { component: 'checkbox', span: 1 }
    },
    enableTable: {
      type: 'boolean',
      title: { en_US: 'Tables', zh_Hans: '表格识别' },
      default: true,
      'x-ui': { component: 'checkbox', span: 1 }
    },
    isOcr: {
      type: 'boolean',
      title: { en_US: 'OCR', zh_Hans: 'OCR' },
      default: true,
      'x-ui': { component: 'checkbox', span: 1, visibleWhen: official }
    },
    language: {
      type: 'string',
      title: { en_US: 'Language', zh_Hans: '语言' },
      default: 'ch',
      enum: [
        'ch',
        'ch_server',
        'en',
        'japan',
        'korean',
        'chinese_cht',
        'ta',
        'te',
        'ka',
        'el',
        'th',
        'latin',
        'arabic',
        'cyrillic',
        'east_slavic',
        'devanagari'
      ],
      'x-ui': { span: 3 }
    }
  }
}
