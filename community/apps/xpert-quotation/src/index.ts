import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  XPERT_QUOTATION_ARTIFACT_NAMESPACE,
  XPERT_QUOTATION_ASSISTANT_TEMPLATE_KEY,
  XPERT_QUOTATION_FEATURE,
  XPERT_QUOTATION_ICON,
  XPERT_QUOTATION_MIDDLEWARE_NAME,
  XPERT_QUOTATION_MIDDLEWARE_PROVIDER_NAMES,
  XPERT_QUOTATION_PATCH_CAPABILITY,
  XPERT_QUOTATION_PLUGIN_NAME,
  XPERT_QUOTATION_PROVIDER_KEY,
  XPERT_QUOTATION_TEMPLATE_PROVIDER_KEY,
  XPERT_QUOTATION_VIEW_KEY,
  XPERT_QUOTATION_WORKBENCH_CAPABILITY,
  WEB_TOOLS_PLUGIN_NAME
} from './lib/constants.js'
import { XpertQuotationPlugin } from './lib/xpert-quotation.plugin.js'
import { xpertQuotationTemplates } from './lib/xpert-quotation.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as { name: string; version: string }
const ConfigSchema = z.object({})
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || XPERT_QUOTATION_PLUGIN_NAME,
    version: packageJson.version,
    artifactNamespace: XPERT_QUOTATION_ARTIFACT_NAMESPACE,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [XPERT_QUOTATION_FEATURE, XPERT_QUOTATION_WORKBENCH_CAPABILITY, XPERT_QUOTATION_PATCH_CAPABILITY],
        requiredPlugins: [WEB_TOOLS_PLUGIN_NAME],
        marketplace: { contents: [
          { type: 'app', name: 'xpert-quotation', displayName: 'Xpert报价', description: text('Price Xpert Software XLSX workbooks from traceable authoritative knowledge without changing workbook formatting.', '基于当前 Agent 已连接的权威价格知识库为Xpert XLSX 报价，且不修改工作簿格式。'), icon: { type: 'svg', value: XPERT_QUOTATION_ICON, color: '#176b45' }, operations: [
            { name: 'match-xpert-quotation', displayName: '识别并匹配', description: '由千问动态识别工作表、项目特征规格和列结构，并生成带知识片段证据的价格推荐。', access: 'write' },
            { name: 'apply-xpert-quotation', displayName: '保格式写入', description: '只向空白目标单元格写入已批准价格和公式。', access: 'write' }
          ] },
          { type: 'view', name: XPERT_QUOTATION_VIEW_KEY, displayName: 'Xpert报价工作台', description: '报价导入、知识库检索、匹配复核、写回和导出工作台。' },
          { type: 'tool', name: XPERT_QUOTATION_MIDDLEWARE_NAME, displayName: 'Xpert报价工具', description: '用于知识库检索、规格感知推荐、证据复核和联网回退的 Assistant 工具。' },
          { type: 'assistant-template', name: XPERT_QUOTATION_ASSISTANT_TEMPLATE_KEY, displayName: 'Xpert报价助手', description: '千问辅助的报价流程 Assistant 模板。' }
        ] },
        runtime: { middlewareProviders: [...XPERT_QUOTATION_MIDDLEWARE_PROVIDER_NAMES], viewProviders: [XPERT_QUOTATION_PROVIDER_KEY], templateProviders: [XPERT_QUOTATION_TEMPLATE_PROVIDER_KEY] }
      },
      xpert: {
        types: ['assistant-template', 'app', 'xpertai-bundle'],
        capabilities: [XPERT_QUOTATION_FEATURE, XPERT_QUOTATION_WORKBENCH_CAPABILITY, XPERT_QUOTATION_PATCH_CAPABILITY],
        requiredPlugins: [WEB_TOOLS_PLUGIN_NAME],
        marketplace: { contents: [
          { type: 'assistant-template', name: XPERT_QUOTATION_ASSISTANT_TEMPLATE_KEY, displayName: 'Xpert报价助手', description: '报价识别、价格复核和保格式写回助手。' },
          { type: 'app', name: 'xpert-quotation', displayName: 'Xpert报价', description: 'Xpert报价 Workbench 与 Agent 工具。' }
        ] }
      }
    },
    category: 'integration',
    icon: { type: 'svg', value: XPERT_QUOTATION_ICON, color: '#176b45' },
    displayName: 'Xpert报价',
    description: '千问辅助的南京Xpert XLSX 识别、权威知识库价格推荐、证据追溯、联网回退、确定性计价与保格式写回。',
    keywords: ['quotation', 'xlsx', '南京Xpert', '工程造价', 'qwen', 'knowledge-base', 'workbench'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  templates: xpertQuotationTemplates,
  register(ctx) {
    ctx.logger.log('register xpert quotation plugin')
    return { module: XpertQuotationPlugin, global: true }
  },
  async onStart(ctx) { ctx.logger.log('xpert quotation plugin started') },
  async onStop(ctx) { ctx.logger.log('xpert quotation plugin stopped') }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/xpert-quotation.plugin.js'
export * from './lib/xpert-quotation.service.js'
export * from './lib/xpert-quotation-history.service.js'
export * from './lib/xpert-quotation-review.service.js'
export * from './lib/xpert-quotation-workbook.service.js'
export * from './lib/xpert-quotation.middleware.js'
export * from './lib/xpert-quotation-view.provider.js'
export * from './lib/xpert-workbook.parser.js'
export * from './lib/pricing.js'
export * from './lib/xpert-quotation-knowledge.js'
export * from './lib/xpert-quotation-knowledgebase.adapter.js'
export * from './lib/xpert-quotation-resource-pricing.js'
export * from './lib/xpert-quotation-resource-pricing.service.js'
export * from './lib/xpert-quotation-web-fallback.js'
export * from './lib/xpert-quotation-web-fallback.service.js'
export * from './lib/xpert-quotation.templates.js'
export * from './lib/ai-review-prompt.js'
export * from './lib/knowledge-ingestion/xpert-quota-knowledge.service.js'
export * from './lib/knowledge-ingestion/xpert-quota-ingestion.processor.js'
export * from './lib/knowledge-ingestion/xpert-quota-knowledge-sync.service.js'
export * from './lib/knowledge-ingestion/xpert-quota-knowledge-sync.processor.js'
