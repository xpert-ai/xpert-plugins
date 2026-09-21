import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { configSchema, type ContractReviewConfig } from './lib/config.js'
import { CONTRACT_REVIEW_CONFIG, FEATURE, MIDDLEWARE_NAME, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY, VIEW_KEY } from './lib/constants.js'
import { ContractReviewPlugin } from './lib/plugin.js'
import { templates } from './lib/templates.js'

const version: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const app = {
  type: 'app', name: 'contract-review', displayName: { en_US: 'Contract Information Assistant', zh_Hans: '合同资料整理助手' },
  description: { en_US: 'Extract contract fields, review evidence and confirm information.', zh_Hans: '合同文本提取、原文核对、人工确认和摘要复制。' },
  icon: { type: 'font', value: 'ri-file-text-line' },
  appConfig: {
    scope: 'organization', assistantTemplateKey: TEMPLATE_KEY,
    workspace: { mode: 'dedicated', name: { en_US: 'Contract Review', zh_Hans: '合同资料工作空间' }, sharing: 'organization' },
    knowledgebases: [], modelRequirements: { primary: true },
    presentation: {
      tagline: { en_US: 'Review contract information with source evidence.', zh_Hans: '让合同字段有据可查，确认结果由人决定。' },
      developer: 'jqdhm',
      features: [
        { key: 'extraction', title: { en_US: 'Evidence-backed extraction', zh_Hans: '原文依据提取' }, description: { en_US: 'Host-configured model extracts six candidate fields.', zh_Hans: '宿主配置的模型提取六类候选字段，缺失项留空。' } },
        { key: 'review', title: { en_US: 'Human review', zh_Hans: '人工核对确认' }, description: { en_US: 'Compare original text, revise fields and confirm.', zh_Hans: '对照原文修订字段，人工确认并复制摘要。' } }
      ],
      dataScope: { en_US: 'Records are isolated by tenant, organization, user and assistant.', zh_Hans: '合同按租户、组织、用户和助手四维隔离，存储在独立 Java 服务。' },
      initializationSummary: { en_US: 'Configure a model and the Java service before use.', zh_Hans: '使用前需配置宿主模型，并启动独立 Java 合同服务。' }
    },
    entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution

export const plugin: XpertPlugin<ContractReviewConfig> = {
  meta: {
    name: PLUGIN_NAME, version, level: 'tenant', artifactNamespace: 'contract-review',
    displayName: '合同资料整理助手', description: 'Contract candidate extraction and human information review, backed by Java.',
    author: 'jqdhm', category: 'middleware', targetApps: ['xpert'],
    targetAppMeta: { xpert: {
      types: ['business-app', 'assistant-template', 'workbench-view'], capabilities: [FEATURE],
      marketplace: { contents: [app,
        { type: 'middleware', name: MIDDLEWARE_NAME, displayName: '合同资料工具' },
        { type: 'view', name: VIEW_KEY, displayName: '合同资料核对' },
        { type: 'assistant-template', name: TEMPLATE_KEY, displayName: '合同资料整理助手' }
      ] },
      runtime: { middlewareProviders: [MIDDLEWARE_NAME], viewProviders: [PROVIDER_KEY], templateProviders: ['contract-review.templates'] }
    } }
  },
  config: { schema: configSchema }, templates,
  register(context) {
    return { module: ContractReviewPlugin, global: true, providers: [{ provide: CONTRACT_REVIEW_CONFIG, useValue: context.config }] }
  }
}
export default plugin
export { ContractServiceClient } from './lib/client.js'
export { ContractReviewViewProvider } from './lib/view-provider.js'
export { ContractReviewMiddleware } from './lib/middleware.js'
