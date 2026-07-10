import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  DRAWIO_AGENT_DRAWING_CAPABILITY,
  DRAWIO_FEATURE,
  DRAWIO_ICON,
  DRAWIO_MIDDLEWARE_NAME,
  DRAWIO_PLUGIN_NAME,
  DRAWIO_PROVIDER_KEY,
  DRAWIO_TEMPLATE_CAPABILITY,
  DRAWIO_TEMPLATE_PROVIDER_KEY,
  DRAWIO_WORKBENCH_CAPABILITY,
  DRAWIO_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { DrawioPlugin } from './lib/drawio.plugin.js'
import { drawioTemplates } from './lib/drawio.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

type DrawioXpertPlugin = Omit<XpertPlugin<z.infer<typeof ConfigSchema>>, 'templates'> & {
  templates: typeof drawioTemplates
}

const plugin: DrawioXpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          DRAWIO_FEATURE,
          DRAWIO_WORKBENCH_CAPABILITY,
          DRAWIO_AGENT_DRAWING_CAPABILITY,
          DRAWIO_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'drawio',
              displayName: 'draw.io',
              description: text(
                'Create, update, version, review, import, export, and convert Agent-generated draw.io diagrams.',
                '创建、更新、版本化、审核、导入导出并转换 Agent 生成的 draw.io 图表。'
              ),
              icon: {
                type: 'svg',
                value: DRAWIO_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'create-drawio-drawings',
                  displayName: 'Create draw.io diagrams',
                  description: text(
                    'Create reviewable diagrams from Agent-generated diagrams.net XML or Mermaid drafts.',
                    '从 Agent 生成的 diagrams.net XML 或 Mermaid 草稿创建可审核图表。'
                  ),
                  access: 'write'
                },
                {
                  name: 'save-drawio-versions',
                  displayName: 'Save diagram versions',
                  description: text(
                    'Persist XML scenes, metadata patches, and Mermaid conversions as versioned diagram records.',
                    '将 XML 场景、元数据补丁和 Mermaid 转换保存为带版本的图表记录。'
                  ),
                  access: 'write'
                },
                {
                  name: 'review-drawio-workbench',
                  displayName: 'Review draw.io workbench',
                  description: text(
                    'Open draw.io to inspect, manually edit, restore, import, and export diagrams.',
                    '打开 draw.io 工作台以检查、手动编辑、恢复、导入和导出图表。'
                  ),
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: DRAWIO_WORKBENCH_VIEW_KEY,
              displayName: 'draw.io Workbench',
              description: text(
                'Workbench view for diagram lists, embedded draw.io editing, Mermaid import, and version history.',
                '用于图表列表、嵌入式 draw.io 编辑、Mermaid 导入和版本历史的工作台视图。'
              )
            },
            {
              type: 'tool',
              name: DRAWIO_MIDDLEWARE_NAME,
              displayName: 'draw.io Agent Tools',
              description: text(
                'Assistant middleware tools for creating diagrams, saving XML versions, patching metadata, saving Mermaid drafts, searching diagrams, and reporting failures.',
                '用于创建图表、保存 XML 版本、修补元数据、保存 Mermaid 草稿、检索图表和上报失败的助手中间件工具。'
              )
            },
            {
              type: 'assistant-template',
              name: 'drawio-assistant',
              displayName: 'draw.io Drawing Assistant Template',
              description: text(
                'Prebuilt assistant template for Agent-managed diagram creation and draw.io review workflows.',
                '面向 Agent 管理图表创建和 draw.io 审阅工作流的预置助手模板。'
              )
            }
          ]
        },
        runtime: {
          middlewareProviders: [DRAWIO_MIDDLEWARE_NAME],
          viewProviders: [DRAWIO_PROVIDER_KEY],
          templateProviders: [DRAWIO_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [
          DRAWIO_FEATURE,
          DRAWIO_WORKBENCH_CAPABILITY,
          DRAWIO_AGENT_DRAWING_CAPABILITY,
          DRAWIO_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'index',
              displayName: 'draw.io Agent Drawing',
              description: text(
                'Workflow skill for Agent-managed draw.io diagrams, Mermaid drafts, XML versions, and Workbench review.',
                '用于 Agent 管理 draw.io 图表、Mermaid 草稿、XML 版本和工作台审阅的工作流技能。'
              ),
              tags: ['skill', 'drawio', 'agent-drawing']
            },
            {
              type: 'assistant-template',
              name: 'drawio-assistant',
              displayName: 'draw.io Drawing Assistant',
              description: text(
                'Assistant template for draw.io diagram workflows.',
                '面向 draw.io 图表工作流的助手模板。'
              )
            },
            {
              type: 'app',
              name: 'drawio',
              displayName: 'draw.io',
              description: text(
                'Workbench and Agent middleware tools for draw.io diagrams.',
                '用于 draw.io 图表的工作台和 Agent 中间件工具。'
              )
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: DRAWIO_ICON,
      color: '#2563eb'
    },
    displayName: 'draw.io',
    description: 'Agentic draw.io plugin for structured diagram generation, XML versioning, review, and Mermaid import.',
    keywords: ['drawio', 'diagram', 'whiteboard', 'mermaid', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: drawioTemplates,
  register(ctx) {
    ctx.logger.log('register drawio plugin')
    return { module: DrawioPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('drawio plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('drawio plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/drawio.plugin.js'
export * from './lib/drawio.service.js'
export * from './lib/drawio.middleware.js'
export * from './lib/drawio-view.provider.js'
export * from './lib/drawio.templates.js'
