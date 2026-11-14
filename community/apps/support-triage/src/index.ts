import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { SupportTriagePlugin } from './plugin.module.js'
import { FEATURE, MIDDLEWARE_NAME, PLUGIN_NAME, PLUGIN_NAMESPACE, PROVIDER_KEY, VIEW_KEY, TEMPLATE_KEY, TEMPLATE_PROVIDER } from './constants.js'
import { templates } from './templates.js'

const version = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))).version
const app = {
  type: 'app', name: 'support-triage',
  displayName: { en_US: 'Support Triage', zh_Hans: '客服工单审核台' },
  description: { en_US: 'AI triage with exact source evidence and human-reviewed replies.', zh_Hans: 'AI 工单分流、原文证据与人工回复审核。' },
  icon: { type: 'font', value: 'ri-customer-service-2-line' },
  appConfig: {
    scope: 'organization', assistantTemplateKey: TEMPLATE_KEY,
    workspace: { mode: 'dedicated', name: { en_US: 'Support Review', zh_Hans: '客服审核工作空间' }, sharing: 'organization' },
    knowledgebases: [], modelRequirements: { primary: true },
    presentation: {
      tagline: { en_US: 'Review every AI reply with its source evidence.', zh_Hans: '带着原文证据审核每一条 AI 回复。' },
      developer: 'Interview candidate',
      features: [
        { key: 'triage', title: { en_US: 'Structured triage', zh_Hans: '结构化分流' }, description: { en_US: 'Summary, category, priority and missing information.', zh_Hans: '摘要、分类、优先级与缺失信息。' } },
        { key: 'review', title: { en_US: 'Human review', zh_Hans: '人工审核' }, description: { en_US: 'Edit and confirm a reply with an audit trail.', zh_Hans: '修改并确认回复，保留审核记录。' } },
        { key: 'recovery', title: { en_US: 'Recoverable attempts', zh_Hans: '失败可恢复' }, description: { en_US: 'Persisted attempts, timeout recovery and safe retries.', zh_Hans: '持久化分析批次、超时恢复与安全重试。' } }
      ],
      dataScope: { en_US: 'Private to the current user and Assistant within the tenant, organization and workspace.', zh_Hans: '工单按租户、组织、工作空间、用户和 Assistant 隔离。' },
      initializationSummary: { en_US: 'Xpert prepares a dedicated workspace and publishes the support Assistant.', zh_Hans: 'Xpert 创建专用工作空间并发布客服分流助手。' }
    }, entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution
const configSchema = z.object({}).strict()
export const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME, version, level: 'tenant', artifactNamespace: PLUGIN_NAMESPACE,
    displayName: '客服工单审核台', description: 'AI-assisted support ticket triage and human reply review.',
    author: 'Interview candidate', category: 'middleware', targetApps: ['xpert'],
    targetAppMeta: { xpert: {
      types: ['business-app', 'assistant-template', 'workbench-view'], capabilities: [FEATURE],
      marketplace: { contents: [app,
        { type: 'assistant-template', name: TEMPLATE_KEY, displayName: { en_US: 'Support Triage Assistant', zh_Hans: '客服工单分流助手' } },
        { type: 'view', name: VIEW_KEY, displayName: { en_US: 'Support Review', zh_Hans: '客服工单审核台' } }] },
      runtime: { middlewareProviders: [MIDDLEWARE_NAME], viewProviders: [PROVIDER_KEY], templateProviders: [TEMPLATE_PROVIDER] }
    } }
  }, config: { schema: configSchema }, templates,
  register() { return { module: SupportTriagePlugin, global: true } }
}
export default plugin
