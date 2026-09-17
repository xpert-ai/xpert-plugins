import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { JiebaIcon } from './lib/icon.js'
import { JiebaPlugin } from './lib/jieba.plugin.js'

const metadata = z
  .object({ name: z.string(), version: z.string() })
  .parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')))
const ConfigSchema = z.object({}).strict()

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    ...metadata,
    level: 'organization',
    category: 'integration',
    displayName: 'Jieba',
    icon: { type: 'svg', value: JiebaIcon },
    description: {
      en_US: 'Chinese keyword search segmentation with support for mixed English text.',
      zh_Hans:
        '\u4e2d\u6587\u5173\u952e\u8bcd\u68c0\u7d22\u5206\u8bcd\uff0c\u652f\u6301\u4e2d\u82f1\u6587\u6df7\u5408\u6587\u672c\u3002'
    },
    keywords: ['jieba', 'chinese', 'keyword', 'analyzer', 'knowledgebase'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  register() {
    return { module: JiebaPlugin }
  }
}

export default plugin
