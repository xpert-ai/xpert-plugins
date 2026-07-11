import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  LUCIDCHART_AGENT_DRAWING_CAPABILITY,
  LUCIDCHART_FEATURE,
  LUCIDCHART_ICON,
  LUCIDCHART_MIDDLEWARE_NAME,
  LUCIDCHART_PLUGIN_NAME,
  LUCIDCHART_PROVIDER_KEY,
  LUCIDCHART_TEMPLATE_CAPABILITY,
  LUCIDCHART_TEMPLATE_PROVIDER_KEY,
  LUCIDCHART_WORKBENCH_CAPABILITY,
  LUCIDCHART_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { LucidchartPlugin } from './lib/lucidchart.plugin.js'
import { lucidchartTemplates } from './lib/lucidchart.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

type LucidchartXpertPlugin = Omit<XpertPlugin<z.infer<typeof ConfigSchema>>, 'templates'> & {
  templates: typeof lucidchartTemplates
}

const plugin: LucidchartXpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          LUCIDCHART_FEATURE,
          LUCIDCHART_WORKBENCH_CAPABILITY,
          LUCIDCHART_AGENT_DRAWING_CAPABILITY,
          LUCIDCHART_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'lucidchart',
              displayName: 'Lucidchart',
              description: text(
                'Create, version, review, import, export, and register Agent-generated Lucidchart Standard Import drafts.',
                '创建、版本化、审核、导入导出并登记 Agent 生成的 Lucidchart Standard Import 草稿。'
              ),
              icon: {
                type: 'svg',
                value: LUCIDCHART_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'create-lucidchart-drawings',
                  displayName: 'Create Lucidchart documents',
                  description: text(
                    'Create reviewable documents from Agent-generated Lucid Standard Import JSON, Mermaid drafts, or external Lucid links.',
                    '从 Agent 生成的 Lucid Standard Import JSON、Mermaid 草稿或外部 Lucid 链接创建可审核文档。'
                  ),
                  access: 'write'
                },
                {
                  name: 'save-lucidchart-versions',
                  displayName: 'Save document versions',
                  description: text(
                    'Persist Standard Import drafts, Mermaid sources, and Lucid document references as versioned records.',
                    '将 Standard Import 草稿、Mermaid 源和 Lucid 文档引用保存为带版本的记录。'
                  ),
                  access: 'write'
                },
                {
                  name: 'review-lucidchart-workbench',
                  displayName: 'Review Lucidchart workbench',
                  description: text(
                    'Open the Workbench to inspect, restore, import, export, and register Lucidchart documents.',
                    '打开工作台以检查、恢复、导入导出并登记 Lucidchart 文档。'
                  ),
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: LUCIDCHART_WORKBENCH_VIEW_KEY,
              displayName: 'Lucidchart Workbench',
              description: text(
                'Workbench view for Standard Import drafts, Mermaid sources, Lucid embeds, and version history.',
                '用于 Standard Import 草稿、Mermaid 源、Lucid 嵌入和版本历史的工作台视图。'
              )
            },
            {
              type: 'tool',
              name: LUCIDCHART_MIDDLEWARE_NAME,
              displayName: 'Lucidchart Agent Tools',
              description: text(
                'Assistant middleware tools for creating documents, saving Standard Import versions, saving Mermaid drafts, registering Lucid links, searching documents, and reporting failures.',
                '用于创建文档、保存 Standard Import 版本、保存 Mermaid 草稿、登记 Lucid 链接、检索文档和上报失败的助手中间件工具。'
              )
            },
            {
              type: 'assistant-template',
              name: 'lucidchart-assistant',
              displayName: 'Lucidchart Drawing Assistant Template',
              description: text(
                'Prebuilt assistant template for Agent-managed Lucidchart draft creation and review workflows.',
                '面向 Agent 管理 Lucidchart 草稿创建和审阅工作流的预置助手模板。'
              )
            }
          ]
        },
        runtime: {
          middlewareProviders: [LUCIDCHART_MIDDLEWARE_NAME],
          viewProviders: [LUCIDCHART_PROVIDER_KEY],
          templateProviders: [LUCIDCHART_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [
          LUCIDCHART_FEATURE,
          LUCIDCHART_WORKBENCH_CAPABILITY,
          LUCIDCHART_AGENT_DRAWING_CAPABILITY,
          LUCIDCHART_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'index',
              displayName: 'Lucidchart Agent Drawing',
              description: text(
                'Workflow skill for Agent-managed Lucidchart Standard Import drafts, Mermaid drafts, Lucid links, and Workbench review.',
                '用于 Agent 管理 Lucidchart Standard Import 草稿、Mermaid 草稿、Lucid 链接和工作台审阅的工作流技能。'
              ),
              tags: ['skill', 'lucidchart', 'agent-drawing']
            },
            {
              type: 'assistant-template',
              name: 'lucidchart-assistant',
              displayName: 'Lucidchart Drawing Assistant',
              description: text(
                'Assistant template for Lucidchart draft workflows.',
                '面向 Lucidchart 草稿工作流的助手模板。'
              )
            },
            {
              type: 'app',
              name: 'lucidchart',
              displayName: 'Lucidchart',
              description: text(
                'Workbench and Agent middleware tools for Lucidchart drafts.',
                '用于 Lucidchart 草稿的工作台和 Agent 中间件工具。'
              )
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: LUCIDCHART_ICON,
      color: '#2563eb'
    },
    displayName: 'Lucidchart',
    description: 'Agentic Lucidchart plugin for Standard Import draft generation, versioning, review, and Lucid document registration.',
    keywords: ['lucidchart', 'diagram', 'whiteboard', 'mermaid', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: lucidchartTemplates,
  register(ctx) {
    ctx.logger.log('register lucidchart plugin')
    return { module: LucidchartPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('lucidchart plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('lucidchart plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/lucidchart.plugin.js'
export * from './lib/lucidchart.service.js'
export * from './lib/lucidchart.middleware.js'
export * from './lib/lucidchart-view.provider.js'
export * from './lib/lucidchart.templates.js'
