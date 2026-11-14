import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { FEATURE, MIDDLEWARE, PLUGIN_NAME, VIEW_KEY, VIEW_PROVIDER } from './contracts.js'
import { ManufacturingQuotationPlugin } from './plugin.module.js'
import { templates } from './template.js'

const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string; version: string; xpert: { plugin: { level: 'system'; artifactNamespace: string } }
}
const plugin: XpertPlugin = {
  meta: {
    name: metadata.name, version: metadata.version, level: metadata.xpert.plugin.level, artifactNamespace: metadata.xpert.plugin.artifactNamespace,
    targetApps: ['data-xpert'], category: 'middleware', displayName: '针对管件铸造企业的报价助手',
    description: 'AI prepares inquiry candidates; humans confirm; the backend validates and prices synthetic products.', author: 'Manufacturing quotation project',
    icon: { type: 'font', value: 'ri-file-list-3-line' },
    targetAppMeta: { 'data-xpert': {
      types: ['workbench-view', 'assistant-tool', 'business-app'], capabilities: [FEATURE],
      runtime: { middlewareProviders: [MIDDLEWARE], viewProviders: [VIEW_PROVIDER] },
      marketplace: { contents: [
        { type: 'view', name: VIEW_KEY, displayName: '针对管件铸造企业的报价助手' },
        { type: 'tool', name: MIDDLEWARE, displayName: '管件铸造企业询价候选工具' },
        { type: 'assistant-template', name: templates[0].key, displayName: '针对管件铸造企业的报价助手' }
      ] }
    } }
  },
  config: { schema: z.object({}).strict() }, templates,
  register() { return { module: ManufacturingQuotationPlugin, global: true } }
}
if (metadata.name !== PLUGIN_NAME) throw new Error('Manufacturing quotation plugin package name mismatch')
export default plugin
