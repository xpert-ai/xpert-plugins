import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PaymentPlugin } from './lib/payment.plugin'
import { templates } from './lib/templates'
import { FEATURE, ICON, MIDDLEWARE, PROVIDER, TEMPLATE, VIEW } from './lib/constants'
const pkg = z
  .object({
    name: z.string(),
    version: z.string(),
    xpert: z.object({
      plugin: z.object({ level: z.literal('tenant'), artifactNamespace: z.literal('payment_followup') })
    })
  })
  .parse(JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')))
const config = z.object({}).strict()
const plugin: XpertPlugin<z.infer<typeof config>> = {
  meta: {
    name: pkg.name,
    version: pkg.version,
    level: pkg.xpert.plugin.level,
    artifactNamespace: pkg.xpert.plugin.artifactNamespace,
    category: 'middleware',
    displayName: '回款承诺跟进',
    description: 'Evidence-backed payment promises and human-confirmed follow-up.',
    icon: ICON,
    author: 'GShLi',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities: [FEATURE],
        runtime: {
          middlewareProviders: [MIDDLEWARE],
          viewProviders: [PROVIDER],
          templateProviders: ['payment_followup.templates']
        },
        marketplace: {
          contents: [
            {
              type: 'view',
              name: VIEW,
              displayName: '回款承诺工作台',
              description: '原文、付款承诺、人工确认和跟进安排。'
            },
            {
              type: 'tool',
              name: MIDDLEWARE,
              displayName: '付款承诺提取工具',
              description: '读取原文、保存草稿、记录失败。'
            },
            {
              type: 'assistant-template',
              name: TEMPLATE,
              displayName: '回款承诺跟进助手',
              description: '使用平台模型提取承诺并保存待确认结果。'
            }
          ]
        }
      }
    }
  },
  config: { schema: config },
  templates,
  register: () => ({ module: PaymentPlugin, global: true })
}
export default plugin
