import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { z } from 'zod'
import { ComplaintTriagePlugin } from './lib/complaint-triage.plugin.js'
import { complaintTriageTemplates } from './lib/templates.js'
import {
  COMPLAINT_TRIAGE_ARTIFACT_NAMESPACE,
  COMPLAINT_TRIAGE_FEATURE,
  COMPLAINT_TRIAGE_MIDDLEWARE,
  COMPLAINT_TRIAGE_RUNTIME_PROBE_VIEW_KEY,
  COMPLAINT_TRIAGE_TEMPLATE_KEY,
  COMPLAINT_TRIAGE_TEMPLATE_PROVIDER_KEY,
  COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY,
  COMPLAINT_TRIAGE_VIEW_PROVIDER_KEY
} from './lib/constants.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const { name, version } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})
const applicationContribution = <T extends { type: 'app'; name: string; appConfig: object }>(
  value: T
): PluginMarketplaceContribution => value as unknown as PluginMarketplaceContribution
const capabilities = [COMPLAINT_TRIAGE_FEATURE, 'complaint-triage-assistant-template']
const assistantTemplateContribution = {
  type: 'assistant-template' as const,
  name: COMPLAINT_TRIAGE_TEMPLATE_KEY,
  displayName: { en_US: 'Complaint Triage Assistant', zh_Hans: '客诉分诊助手' },
  description: {
    en_US: 'Analyze persisted complaints and submit structured recommendations for human review.',
    zh_Hans: '分析已保存的投诉，并提交结构化建议供人工审核。'
  }
}
const viewContribution = {
  type: 'view' as const,
  name: COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY,
  displayName: 'Complaint Triage Workbench',
  description: 'Create, analyze, review, and confirm persisted complaint cases.'
}
const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name,
    version,
    level: 'system',
    artifactNamespace: COMPLAINT_TRIAGE_ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'assistant-template', 'workbench-view'],
        capabilities,
        requiredPlugins: [name],
        marketplace: {
          contents: [
            viewContribution,
            assistantTemplateContribution,
            {
              type: 'view',
              name: COMPLAINT_TRIAGE_RUNTIME_PROBE_VIEW_KEY,
              displayName: 'Complaint Runtime Probe',
              description: 'Temporary Assistant Task runtime verification view.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [COMPLAINT_TRIAGE_MIDDLEWARE],
          viewProviders: [COMPLAINT_TRIAGE_VIEW_PROVIDER_KEY],
          templateProviders: [COMPLAINT_TRIAGE_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['business-app', 'assistant-template', 'workbench-view'],
        capabilities,
        requiredPlugins: [name],
        marketplace: {
          contents: [
            applicationContribution({
              type: 'app',
              name: 'complaint-triage-workbench',
              displayName: { en_US: 'Complaint Triage Workbench', zh_Hans: '客诉分诊工作台' },
              description: {
                en_US: 'Human-reviewed AI triage for customer complaints.',
                zh_Hans: '由人工审核 AI 分诊建议的客诉业务应用。'
              },
              color: '#0F766E',
              tags: ['customer-service', 'complaint', 'business-app'],
              appConfig: {
                scope: 'organization' as const,
                assistantTemplateKey: COMPLAINT_TRIAGE_TEMPLATE_KEY,
                workspace: {
                  mode: 'dedicated' as const,
                  name: { en_US: 'Complaint Triage', zh_Hans: '客诉分诊' },
                  sharing: 'organization' as const
                },
                modelRequirements: { primary: true },
                presentation: {
                  tagline: {
                    en_US: 'Triage complaints with AI, confirm decisions with people.',
                    zh_Hans: 'AI 分诊，人工确认。'
                  },
                  developer: 'XpertAI Community',
                  features: [
                    {
                      key: 'persisted-cases',
                      title: { en_US: 'Persisted complaint cases', zh_Hans: '持久化投诉工单' },
                      description: {
                        en_US: 'Create, recover, and review organization-scoped complaint records.',
                        zh_Hans: '创建、恢复并审核组织范围内的投诉记录。'
                      }
                    },
                    {
                      key: 'human-review',
                      title: { en_US: 'Human confirmation', zh_Hans: '人工确认' },
                      description: {
                        en_US: 'Keep the AI original separate from the final human-confirmed result.',
                        zh_Hans: 'AI 原始结果与人工最终确认结果分别保存。'
                      }
                    }
                  ],
                  dataScope: {
                    en_US: 'Complaint cases are isolated to the current tenant and organization.',
                    zh_Hans: '投诉工单按当前租户和组织隔离。'
                  }
                },
                entry: { type: 'assistant-chat' as const }
              }
            }),
            assistantTemplateContribution,
            viewContribution
          ]
        },
        runtime: {
          middlewareProviders: [COMPLAINT_TRIAGE_MIDDLEWARE],
          viewProviders: [COMPLAINT_TRIAGE_VIEW_PROVIDER_KEY],
          templateProviders: [COMPLAINT_TRIAGE_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    displayName: { en_US: 'Complaint Triage Workbench', zh_Hans: '客诉分诊工作台' },
    description: {
      en_US: 'Human-reviewed AI triage for customer complaints.',
      zh_Hans: '由人工审核 AI 分诊建议的客诉业务应用。'
    },
    keywords: ['complaint', 'triage', 'business-app'],
    author: 'XpertAI Community'
  },
  config: { schema: ConfigSchema },
  templates: complaintTriageTemplates,
  register(ctx) {
    ctx.logger.log('register complaint triage workbench plugin')
    return { module: ComplaintTriagePlugin, global: true }
  },
  onStart(ctx) {
    ctx.logger.log('complaint triage workbench plugin started')
  },
  onStop(ctx) {
    ctx.logger.log('complaint triage workbench plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/artifact-namespace.js'
export * from './lib/complaint-assistant-task.service.js'
export * from './lib/complaint-case.service.js'
export * from './lib/complaint-tools.js'
export * from './lib/complaint-triage-view.provider.js'
export * from './lib/domain/complaint.schemas.js'
export * from './lib/domain/complaint.types.js'
export * from './lib/entities/index.js'
export * from './lib/templates.js'
