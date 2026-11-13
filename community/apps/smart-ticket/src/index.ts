import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { SmartTicketPlugin } from './lib/smart-ticket.plugin.js'
import {
  FEATURE,
  MIDDLEWARE_NAME,
  PLUGIN_NAME,
  PLUGIN_NAMESPACE,
  PROVIDER_KEY,
  TEMPLATE_KEY,
  VIEW_KEY
} from './lib/constants.js'
import { templates } from './lib/templates.js'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string }

const app = {
  type: 'app',
  name: 'smart-ticket',
  displayName: {
    en_US: 'Smart Ticket Workbench',
    zh_Hans: '智能客诉工单工作台'
  },
  description: {
    en_US:
      'AI-assisted customer feedback classification, sentiment detection, reply drafting and confirmation workbench.',
    zh_Hans:
      '通过 AI 自动分析客户投诉与反馈，评估情绪与优先级，拟定安抚回复并在工作台中人工核验归档。'
  },
  icon: { type: 'font', value: 'ri-customer-service-2-line' },
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: TEMPLATE_KEY,
    workspace: {
      mode: 'dedicated',
      name: {
        en_US: 'Smart Ticket Workspace',
        zh_Hans: '智能工单工作空间'
      },
      sharing: 'organization'
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: {
        en_US: 'Turn raw customer complaints into structured, reviewed tickets and empathetic replies.',
        zh_Hans: '将凌乱的客诉反馈转化为结构化工单与专业安抚回复，支持全流程人工核验与持久化。'
      },
      developer: 'JustGG',
      features: [
        {
          key: 'ticket-workbench',
          title: {
            en_US: 'Interactive Workbench',
            zh_Hans: '交互式工单工作台'
          },
          description: {
            en_US: 'View, filter, edit and confirm tickets in a responsive dual-pane layout.',
            zh_Hans: '双栏响应式工作台，支持工单检索、分类调整、优先级评估与一键确认归档。'
          }
        },
        {
          key: 'ai-classification',
          title: {
            en_US: 'Intelligent AI Insights',
            zh_Hans: 'AI 意图与情绪判定'
          },
          description: {
            en_US: 'Extract core issues, priority levels (P0-P3), user sentiment, and draft empathetic solutions.',
            zh_Hans: '智能识别 P0-P3 紧急度，洞察客户情绪，自动化拟定高质量专业回复方案。'
          }
        }
      ],
      dataScope: {
        en_US: 'Tickets and reply records are isolated by tenant, organization and workspace.',
        zh_Hans: '工单数据严格按租户、组织与当前工作空间实现多租户隔离。'
      },
      initializationSummary: {
        en_US: 'Xpert sets up a dedicated customer service workspace and initializes the ticket assistant.',
        zh_Hans: 'Xpert 创建客户成功专用工作空间并初始化智能客诉工单助手。'
      }
    },
    entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution

const configSchema = z.object({}).strict()

const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME,
    version: packageJson.version,
    level: 'tenant',
    artifactNamespace: PLUGIN_NAMESPACE,
    displayName: 'Smart Ticket AI',
    description:
      'Smart customer feedback and ticket workbench with AI classification, response drafting, and human confirmation.',
    author: 'JustGG',
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
              displayName: {
                en_US: 'Smart Ticket Operations Assistant',
                zh_Hans: '智能客诉工单助手'
              },
              description: {
                en_US: 'Customer feedback analysis and response drafting assistant.',
                zh_Hans: '协助客服团队进行客诉分析、情绪判定、回复拟定与确认归档。'
              }
            },
            {
              type: 'view',
              name: VIEW_KEY,
              displayName: 'Smart Ticket'
            }
          ]
        },
        runtime: {
          middlewareProviders: [MIDDLEWARE_NAME],
          viewProviders: [PROVIDER_KEY],
          templateProviders: ['smart-ticket.templates']
        }
      }
    }
  },
  config: { schema: configSchema },
  templates,
  register() {
    return {
      module: SmartTicketPlugin,
      global: true
    }
  }
}

export default plugin
export { plugin }
