import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ComplaintTriagePlugin } from './lib/complaint-triage.plugin.js'
import {
  FEATURE,
  MIDDLEWARE_NAME,
  PLUGIN_NAME,
  PLUGIN_NAMESPACE,
  PROVIDER_KEY,
  TEMPLATE_KEY,
  TEMPLATE_PROVIDER_KEY,
  VIEW_KEY
} from './lib/constants.js'
import { templates } from './lib/templates.js'

// Single source of truth for the version: meta.version must equal package.json.version.
const { version } = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')))

const app = {
  type: 'app',
  name: 'complaint-triage',
  displayName: { en_US: 'Complaint Triage Desk', zh_Hans: '客诉分诊台' },
  description: {
    en_US: 'Paste a complaint; the Assistant extracts facts, grades severity and drafts a reply; a supervisor reviews and confirms.',
    zh_Hans: '粘贴客诉原文，助手抽取要素、按标准定级并起草回复，主管复核确认后存为工单。'
  },
  icon: { type: 'font', value: 'ri-customer-service-2-line' },
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: TEMPLATE_KEY,
    workspace: {
      mode: 'dedicated',
      name: { en_US: 'Complaint Triage', zh_Hans: '客诉分诊工作空间' },
      sharing: 'organization'
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: { en_US: 'AI suggests, a human confirms.', zh_Hans: 'AI 给建议，人来拍板。' },
      developer: 'wanghanwei1014',
      features: [
        {
          key: 'evidence',
          title: { en_US: 'Evidence-backed triage', zh_Hans: '带原文证据的分诊' },
          description: {
            en_US: 'Every extracted fact and the severity grade cite sentences of the original complaint.',
            zh_Hans: '每条关键事实和定级理由都引用客诉原文中的句子。'
          }
        },
        {
          key: 'review',
          title: { en_US: 'Human review and retry', zh_Hans: '人工确认与失败重试' },
          description: {
            en_US: 'Nothing is final until a supervisor confirms; a failed analysis can be retried without duplicating the ticket.',
            zh_Hans: '主管确认前结果不生效；分析失败可重试，且不会重复生成工单或结果。'
          }
        }
      ],
      dataScope: {
        en_US: 'Tickets are shared inside the current organization and isolated from other organizations and tenants.',
        zh_Hans: '工单在当前组织内共享，与其他组织和租户隔离。'
      },
      initializationSummary: {
        en_US: 'Xpert prepares a dedicated workspace and the Complaint Triage Assistant.',
        zh_Hans: 'Xpert 创建专用工作空间并初始化客诉分诊助手。'
      }
    },
    entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution

const configSchema = z.object({}).strict()

const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME,
    version,
    // Registers TypeORM entities, so it is a system-level plugin; `tenant` keeps it installable
    // outside the Default tenant.
    level: 'tenant',
    artifactNamespace: PLUGIN_NAMESPACE,
    displayName: 'Complaint Triage Desk',
    description: 'AI-assisted triage of customer complaints with evidence, human confirmation and retry.',
    author: 'wanghanwei1014',
    category: 'middleware',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'assistant-template', 'workbench-view'],
        capabilities: [FEATURE],
        marketplace: {
          contents: [
            app,
            {
              type: 'assistant-template',
              name: TEMPLATE_KEY,
              displayName: { en_US: 'Complaint Triage Assistant', zh_Hans: '客诉分诊助手' },
              description: { en_US: 'Triage Assistant with the triage workbench.', zh_Hans: '带分诊工作台的客诉分诊助手。' }
            },
            { type: 'view', name: VIEW_KEY, displayName: { en_US: 'Complaint Triage', zh_Hans: '客诉分诊台' } }
          ]
        },
        runtime: { middlewareProviders: [MIDDLEWARE_NAME], viewProviders: [PROVIDER_KEY], templateProviders: [TEMPLATE_PROVIDER_KEY] }
      }
    }
  },
  config: { schema: configSchema },
  templates,
  register() {
    return { module: ComplaintTriagePlugin, global: true }
  }
}

export default plugin
export { plugin }
