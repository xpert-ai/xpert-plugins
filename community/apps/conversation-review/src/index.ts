import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  CONVERSATION_REVIEW_ARTIFACT_NAMESPACE,
  CONVERSATION_REVIEW_FEATURE,
  CONVERSATION_REVIEW_ICON,
  CONVERSATION_REVIEW_MIDDLEWARE_NAME,
  CONVERSATION_REVIEW_PLUGIN_NAME,
  CONVERSATION_REVIEW_PROVIDER_KEY,
  CONVERSATION_REVIEW_TEMPLATE_KEY,
  CONVERSATION_REVIEW_TEMPLATE_PROVIDER_KEY,
  CONVERSATION_REVIEW_VIEW_KEY
} from './lib/constants'
import { ConversationReviewPlugin } from './lib/conversation-review.plugin'
import { conversationReviewTemplates } from './lib/conversation-review.templates'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const configSchema = z.object({}).strict()

const app = {
  type: 'app',
  name: 'conversation-review',
  displayName: {
    en_US: 'Conversation Review',
    zh_Hans: '客户沟通质检与跟进决策'
  },
  description: {
    en_US:
      'Ingest customer conversations in batch, let the assistant review each against that customer confirmed history, then edit and confirm the result.',
    zh_Hans: '批量摄入客户沟通记录，由助手对照该客户历史已确认记录逐条质检，销售修改并确认后保存。'
  },
  icon: { type: 'font', value: 'ri-chat-check-line' },
  appConfig: {
    scope: 'organization',
    // Links the marketplace app to the assistant template shipped by this same plugin.
    // Without this the template will not surface as an app entry.
    assistantTemplateKey: CONVERSATION_REVIEW_TEMPLATE_KEY,
    workspace: {
      mode: 'dedicated',
      name: { en_US: 'Conversation Review', zh_Hans: '客户沟通质检工作空间' },
      description: {
        en_US: 'Workspace holding filed customer conversations and their confirmed reviews.',
        zh_Hans: '存放已归档的客户沟通记录与确认后的质检结果。'
      },
      sharing: 'organization'
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: {
        en_US: 'Turn one sales conversation into a reviewable follow-up decision.',
        zh_Hans: '把一次客户沟通变成可确认、可追溯的跟进决策。'
      },
      features: [
        {
          key: 'structured-review',
          title: { en_US: 'Structured QC', zh_Hans: '结构化质检' },
          description: {
            en_US: 'Intent, requirements, concerns, risk reminders and unconfirmed information.',
            zh_Hans: '客户意向、需求、顾虑、风险提示与待确认信息。'
          }
        },
        {
          key: 'batch-ingestion',
          title: { en_US: 'Batch ingestion', zh_Hans: '批量会话摄入' },
          description: {
            en_US:
              'Conversations arrive from a JSON payload or a spreadsheet export, not from retyping. Re-importing the same export changes nothing.',
            zh_Hans: '会话从 JSON 或表格导出批量进入，不靠手工重录；同一份导出重复导入不会产生重复记录。'
          }
        },
        {
          key: 'cross-conversation',
          title: { en_US: 'Carried-over items', zh_Hans: '历史遗留事项' },
          description: {
            en_US:
              'Each review is checked against the customer earlier confirmed conversations, so a commitment that slipped twice is visible.',
            zh_Hans: '每次质检都对照该客户此前已确认的沟通，答应过两次仍未落实的事会被点出来。'
          }
        },
        {
          key: 'human-confirmation',
          title: { en_US: 'Human confirmation', zh_Hans: '人工确认' },
          description: {
            en_US: 'The AI result is a draft; the salesperson edits and confirms the result of record.',
            zh_Hans: 'AI 结果只是草稿，最终业务结果由销售修改并确认。'
          }
        }
      ],
      dataScope: {
        en_US: 'Conversation records and results are private to the salesperson who filed them.',
        zh_Hans: '沟通记录与结果按归档人隔离，销售之间互不可见。'
      }
    },
    entry: { type: 'assistant-chat' }
  }
} satisfies PluginMarketplaceContribution

const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    // Registers process-global TypeORM entities, so it must declare a tenant level and a
    // stable artifact namespace. Changes take effect after an API restart.
    level: 'tenant',
    artifactNamespace: CONVERSATION_REVIEW_ARTIFACT_NAMESPACE,
    displayName: 'Conversation Review',
    author: 'YangD1',
    description:
      'AI customer conversation QC and follow-up decision workbench for front-line sales, with human-in-the-loop confirmation.',
    category: 'middleware',
    icon: {
      type: 'svg',
      value: CONVERSATION_REVIEW_ICON,
      color: '#1d4ed8'
    },
    keywords: ['sales', 'conversation', 'quality-review', 'follow-up', 'workbench'],
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'assistant-template', 'workbench-view', 'assistant-tool'],
        capabilities: [CONVERSATION_REVIEW_FEATURE],
        marketplace: {
          contents: [
            app,
            {
              type: 'assistant-template',
              name: CONVERSATION_REVIEW_TEMPLATE_KEY,
              displayName: {
                en_US: 'Conversation Review Assistant',
                zh_Hans: '客户沟通质检助手'
              },
              description: {
                en_US: 'Prebuilt assistant that reads a filed conversation and drafts a structured review.',
                zh_Hans: '预置助手：读取归档的沟通记录并生成结构化质检与跟进建议草稿。'
              }
            },
            {
              type: 'view',
              name: CONVERSATION_REVIEW_VIEW_KEY,
              displayName: {
                en_US: 'Conversation Review Workbench',
                zh_Hans: '客户沟通质检工作台'
              },
              description: {
                en_US: 'Workbench view for filing conversations, reviewing AI results, confirming and retrying.',
                zh_Hans: '用于归档沟通、查看 AI 结果、人工确认与失败重试的工作台视图。'
              }
            },
            {
              type: 'tool',
              name: CONVERSATION_REVIEW_MIDDLEWARE_NAME,
              displayName: {
                en_US: 'Conversation Review Tools',
                zh_Hans: '客户沟通质检工具'
              },
              description: {
                en_US:
                  'Assistant middleware tools to read a conversation, look up the customer confirmed history, save an analysis and report a failure.',
                zh_Hans: '助手中间件工具：读取沟通记录、查询该客户历史已确认记录、保存分析结果、报告分析失败。'
              }
            }
          ]
        },
        runtime: {
          middlewareProviders: [CONVERSATION_REVIEW_MIDDLEWARE_NAME],
          viewProviders: [CONVERSATION_REVIEW_PROVIDER_KEY],
          templateProviders: [CONVERSATION_REVIEW_TEMPLATE_PROVIDER_KEY]
        }
      }
    }
  },
  config: { schema: configSchema },
  templates: conversationReviewTemplates,
  register() {
    return { module: ConversationReviewPlugin, global: true }
  }
}

export default plugin
export { plugin }
