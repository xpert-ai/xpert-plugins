import type { JsonSchemaUIExtensions, TIntegrationProvider } from '@xpert-ai/contracts'
import type { ISchemaSecretField } from '@xpert-ai/plugin-sdk'

const official = { name: 'serverType', value: 'official' }
const selfHosted = { name: 'serverType', value: 'self-hosted' }
const secretInput = {
  component: 'secretInput',
  revealable: true,
  maskSymbol: '*',
  persist: true
} satisfies ISchemaSecretField

export const baiduOcrIntegrationSchema: TIntegrationProvider['schema'] & { 'x-ui': JsonSchemaUIExtensions } = {
  type: 'object',
  secret: ['apiKey', 'secretKey'],
  'x-ui': { cols: 2 },
  properties: {
    serverType: {
      type: 'string',
      title: { en_US: 'Service Type', zh_Hans: '服务类型' },
      default: 'official',
      enum: ['official', 'self-hosted'],
      'x-ui': {
        span: 2,
        enumLabels: {
          official: { en_US: 'Official Baidu Cloud API', zh_Hans: '官方 API（百度智能云）' },
          'self-hosted': { en_US: 'Self-hosted PaddleOCR-VL', zh_Hans: '自部署（PaddleOCR-VL）' }
        }
      }
    },
    apiKey: {
      type: 'string',
      title: { en_US: 'Baidu API Key', zh_Hans: '百度 API Key' },
      'x-ui': { ...secretInput, span: 2, visibleWhen: official }
    },
    secretKey: {
      type: 'string',
      title: { en_US: 'Baidu Secret Key', zh_Hans: '百度 Secret Key' },
      'x-ui': { ...secretInput, span: 2, visibleWhen: official }
    },
    apiUrl: {
      type: 'string',
      title: { en_US: 'Service URL', zh_Hans: '自建端点' },
      description: {
        en_US:
          'Required. Base URL of the full PaddleOCR-VL pipeline, for example http://your-paddleocr:8080. No /layout-parsing suffix needed.',
        zh_Hans:
          '必填。填写完整 PaddleOCR-VL 产线服务地址，例如 http://your-paddleocr:8080，无需 /layout-parsing 后缀。'
      },
      'x-ui': { component: 'textInput', span: 2, visibleWhen: selfHosted }
    },
    recognizeSeal: {
      type: 'boolean',
      title: { en_US: 'Recognize Seals', zh_Hans: '印章识别' },
      default: false,
      'x-ui': { component: 'checkbox', span: 1 }
    },
    analysisChart: {
      type: 'boolean',
      title: { en_US: 'Analyze Charts', zh_Hans: '图表识别' },
      default: false,
      'x-ui': { component: 'checkbox', span: 1 }
    },
    mergeTables: {
      type: 'boolean',
      title: { en_US: 'Merge Cross-page Tables', zh_Hans: '合并跨页表格' },
      default: true,
      'x-ui': { component: 'checkbox', span: 1 }
    },
    relevelTitles: {
      type: 'boolean',
      title: { en_US: 'Infer Title Levels', zh_Hans: '识别标题层级' },
      default: true,
      'x-ui': { component: 'checkbox', span: 1 }
    },
    returnSpanBoxes: {
      type: 'boolean',
      title: { en_US: 'Return Line Coordinates', zh_Hans: '返回行坐标' },
      default: true,
      'x-ui': { component: 'checkbox', span: 2, visibleWhen: official }
    },
    preserveRawOutput: {
      type: 'boolean',
      title: { en_US: 'Preserve Raw Output', zh_Hans: '保留原始结果' },
      default: true,
      'x-ui': { component: 'checkbox', span: 1 }
    },
    preserveImages: {
      type: 'boolean',
      title: { en_US: 'Preserve Parsed Images', zh_Hans: '保留解析图片' },
      default: true,
      'x-ui': { component: 'checkbox', span: 1 }
    },
    uploadMode: {
      type: 'string',
      title: { en_US: 'Upload Mode', zh_Hans: '上传方式' },
      default: 'auto',
      enum: ['auto', 'base64', 'url'],
      description: {
        en_US: 'Auto prefers Base64; PDFs over 500 pages are split into bounded tasks.',
        zh_Hans: '自动模式优先使用 Base64；超过 500 页的 PDF 会拆分为受限任务。'
      },
      'x-ui': {
        span: 2,
        visibleWhen: official,
        enumLabels: {
          auto: { en_US: 'Auto', zh_Hans: '自动' },
          base64: 'Base64',
          url: { en_US: 'Public URL', zh_Hans: '公开 URL' }
        }
      }
    },
    pollIntervalSeconds: {
      type: 'number',
      title: { en_US: 'Polling Interval (seconds)', zh_Hans: '轮询间隔（秒）' },
      default: 7,
      'x-ui': { component: 'numberInput', span: 2, visibleWhen: official }
    },
    taskTimeoutSeconds: {
      type: 'number',
      title: { en_US: 'Task Timeout (seconds)', zh_Hans: '任务超时（秒）' },
      default: 1800,
      'x-ui': { component: 'numberInput', span: 2 }
    }
  }
}
