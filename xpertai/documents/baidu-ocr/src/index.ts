import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { BaiduOcrPlugin } from './lib/baidu-ocr.plugin.js'
import { BAIDU_OCR_PLUGIN_NAME, BAIDU_OCR_PLUGIN_VERSION, icon } from './lib/constants.js'

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: BAIDU_OCR_PLUGIN_NAME,
    version: BAIDU_OCR_PLUGIN_VERSION,
    category: 'integration',
    icon: { type: 'svg', value: icon },
    displayName: 'Baidu OCR Document Transformers',
    description: 'Baidu Cloud PaddleOCR-VL and Unlimited-OCR document converters with shared credentials.',
    keywords: ['document', 'ocr', 'pdf', 'image', 'baidu', 'paddleocr-vl', 'unlimited-ocr', 'transformer'],
    author: 'XpertAI Team',
    homepage: 'https://cloud.baidu.com/product/OCR/doc_parser.html'
  },
  config: { schema: ConfigSchema },
  register(ctx) {
    ctx.logger.log('register Baidu OCR document transformer plugin')
    return { module: BaiduOcrPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('Baidu OCR document transformer plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Baidu OCR document transformer plugin stopped')
  }
}

export default plugin
export * from './lib/types.js'
