import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  EXCALIDRAW_AGENT_DRAWING_CAPABILITY,
  EXCALIDRAW_ARTIFACT_SHARING_CAPABILITY,
  EXCALIDRAW_ARTIFACT_TEMPLATE_CAPABILITY,
  EXCALIDRAW_DIAGRAM_IR_CAPABILITY,
  EXCALIDRAW_DIAGRAM_QUALITY_CAPABILITY,
  EXCALIDRAW_COLLABORATION_CAPABILITY,
  EXCALIDRAW_FEATURE,
  EXCALIDRAW_ICON,
  EXCALIDRAW_MIDDLEWARE_NAME,
  EXCALIDRAW_PLUGIN_NAME,
  EXCALIDRAW_PROVIDER_KEY,
  EXCALIDRAW_TEMPLATE_CAPABILITY,
  EXCALIDRAW_TEMPLATE_PROVIDER_KEY,
  EXCALIDRAW_WORKBENCH_CAPABILITY,
  EXCALIDRAW_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { ExcalidrawPlugin } from './lib/excalidraw.plugin.js'
import { excalidrawTemplates } from './lib/excalidraw.templates.js'
import { EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME } from './lib/diagram-engine/diagram.middleware.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

const capabilities = [
  EXCALIDRAW_FEATURE,
  EXCALIDRAW_WORKBENCH_CAPABILITY,
  EXCALIDRAW_AGENT_DRAWING_CAPABILITY,
  EXCALIDRAW_TEMPLATE_CAPABILITY,
  EXCALIDRAW_ARTIFACT_TEMPLATE_CAPABILITY,
  EXCALIDRAW_DIAGRAM_IR_CAPABILITY,
  EXCALIDRAW_DIAGRAM_QUALITY_CAPABILITY,
  EXCALIDRAW_COLLABORATION_CAPABILITY,
  EXCALIDRAW_ARTIFACT_SHARING_CAPABILITY
]

type ExcalidrawXpertPlugin = Omit<XpertPlugin<z.infer<typeof ConfigSchema>>, 'templates'> & {
  templates: typeof excalidrawTemplates
}

const plugin: ExcalidrawXpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    artifactNamespace: 'excalidraw',
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities,
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'excalidraw',
              displayName: 'Excalidraw',
              description: text(
                'Create, update, version, review, import, export, and convert Agent-generated Excalidraw diagrams.',
                '创建、更新、版本化、审核、导入导出并转换 Agent 生成的 Excalidraw 图形。'
              ),
              icon: {
                type: 'svg',
                value: EXCALIDRAW_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'create-excalidraw-drawings',
                  displayName: 'Create Excalidraw drawings',
                  description: text(
                    'Create reviewable diagrams from Agent-generated Excalidraw JSON or Mermaid drafts.',
                    '从 Agent 生成的 Excalidraw JSON 或 Mermaid 草稿创建可审核图形。'
                  ),
                  access: 'write'
                },
                {
                  name: 'save-excalidraw-versions',
                  displayName: 'Save drawing versions',
                  description: text(
                    'Persist complete scenes, patches, and Mermaid conversions as versioned drawing records.',
                    '将完整场景、补丁和 Mermaid 转换保存为带版本的图形记录。'
                  ),
                  access: 'write'
                },
                {
                  name: 'review-excalidraw-workbench',
                  displayName: 'Review drawing workbench',
                  description: text(
                    'Open Excalidraw to inspect, manually edit, restore, import, and export drawings.',
                    '打开 Excalidraw 工作台以检查、手动编辑、恢复、导入和导出图形。'
                  ),
                  access: 'read'
                },
                {
                  name: 'collaborate-excalidraw-drawings',
                  displayName: 'Collaborate on drawings',
                  description: text(
                    'Edit the same drawing with live Yjs synchronization and collaborator presence.',
                    '通过 Yjs 实时同步和协作者状态共同编辑同一图形。'
                  ),
                  access: 'write'
                },
                {
                  name: 'share-excalidraw-artifacts',
                  displayName: 'Share drawing Artifacts',
                  description: text(
                    'Publish a safe, self-contained read-only Excalidraw HTML Artifact with controlled access and revocation.',
                    '发布可控制访问并可撤销的安全、自包含只读 Excalidraw HTML Artifact。'
                  ),
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: EXCALIDRAW_WORKBENCH_VIEW_KEY,
              displayName: 'Excalidraw Workbench',
              description: text(
                'Workbench view for drawing lists, Excalidraw editing, Mermaid conversion, and version history.',
                '用于图形列表、Excalidraw 编辑、Mermaid 转换和版本历史的工作台视图。'
              )
            },
            {
              type: 'tool',
              name: EXCALIDRAW_MIDDLEWARE_NAME,
              displayName: 'Excalidraw Agent Tools',
              description: text(
                'Assistant middleware tools for creating drawings, saving scenes, patching elements, saving Mermaid drafts, searching drawings, and reporting failures.',
                '用于创建图形、保存场景、修补元素、保存 Mermaid 草稿、检索图形和上报失败的助手中间件工具。'
              )
            },
            {
              type: 'tool',
              name: EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
              displayName: 'Excalidraw Technical Diagram Engine',
              description: text(
                'Select trusted templates, author and render DiagramIR, validate diagrams, create previews, and record bounded visual reviews.',
                '选择受信任模板、建模并渲染 DiagramIR、校验图表、创建预览并记录有次数上限的视觉审核。'
              )
            },
            {
              type: 'assistant-template',
              name: 'excalidraw-assistant',
              displayName: 'Excalidraw Drawing Assistant Template',
              description: text(
                'Prebuilt assistant template for Agent-managed diagram creation and Excalidraw review workflows.',
                '面向 Agent 管理图表创建和 Excalidraw 审阅工作流的预置助手模板。'
              )
            },
            {
              type: 'assistant-template',
              name: 'excalidraw-technical-diagram-assistant',
              displayName: 'Excalidraw Technical Diagram Assistant',
              description: text(
                'Template-driven technical diagrams with DiagramIR, deterministic rendering, validation, and visual review.',
                '通过 DiagramIR、确定性渲染、校验和视觉审核生成模板化技术图。'
              )
            }
          ]
        },
        runtime: {
          middlewareProviders: [
            EXCALIDRAW_MIDDLEWARE_NAME,
            EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME
          ],
          viewProviders: [EXCALIDRAW_PROVIDER_KEY],
          templateProviders: [EXCALIDRAW_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities,
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'excalidraw-agent-skill',
              displayName: 'Excalidraw Agent Skill',
              description: text(
                'Skill for using Excalidraw middleware tools, Workbench selection context, scene inspection, patching, versioning, and recovery.',
                '使用 Excalidraw 中间件工具、工作台选择上下文、场景检查、修补、版本管理和恢复的技能。'
              ),
              tags: ['skill', 'excalidraw', 'agent-drawing', 'middleware-tools']
            },
            {
              type: 'assistant-template',
              name: 'excalidraw-assistant',
              displayName: 'Excalidraw Drawing Assistant',
              description: text(
                'Assistant template for Excalidraw drawing workflows.',
                '面向 Excalidraw 绘图工作流的助手模板。'
              )
            },
            {
              type: 'skill',
              name: 'technical-diagram',
              displayName: 'Technical Diagram Engineering',
              description: text(
                'Template selection, semantic DiagramIR modeling, deterministic validation, preview inspection, and bounded visual correction.',
                '模板选择、DiagramIR 语义建模、确定性校验、预览检查和有界视觉修正。'
              ),
              tags: ['skill', 'diagram-ir', 'technical-diagram', 'templates', 'diagram-quality', 'visual-review']
            },
            {
              type: 'assistant-template',
              name: 'excalidraw-technical-diagram-assistant',
              displayName: 'Excalidraw Technical Diagram Assistant',
              description: text(
                'Assistant template for the full template-to-DiagramIR quality workflow.',
                '执行从模板到 DiagramIR 再到质量闭环的助手模板。'
              )
            },
            {
              type: 'app',
              name: 'excalidraw',
              displayName: 'Excalidraw',
              description: text(
                'Workbench and Agent middleware tools for Excalidraw diagrams.',
                '用于 Excalidraw 图形的工作台和 Agent 中间件工具。'
              )
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: EXCALIDRAW_ICON,
      color: '#2563eb'
    },
    displayName: 'Excalidraw',
    description: 'Collaborative Excalidraw workspace for structured diagram generation, live editing, Artifact sharing, versioning, review, and Mermaid conversion.',
    keywords: ['excalidraw', 'diagram', 'whiteboard', 'mermaid', 'yjs', 'collaboration', 'artifacts', 'sharing', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: excalidrawTemplates,
  register(ctx) {
    ctx.logger.log('register excalidraw plugin')
    return { module: ExcalidrawPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('excalidraw plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('excalidraw plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/excalidraw.plugin.js'
export * from './lib/excalidraw.service.js'
export * from './lib/excalidraw-artifact-viewer.service.js'
export * from './lib/excalidraw.middleware.js'
export * from './lib/excalidraw-view.provider.js'
export * from './lib/excalidraw.templates.js'
export * from './lib/excalidraw-core.module.js'
export * from './lib/excalidraw-collaboration.provider.js'
export * from './lib/excalidraw-yjs.js'
export * from './lib/diagram-engine/diagram-engine.module.js'
export * from './lib/diagram-engine/diagram.types.js'
export * from './lib/diagram-engine/diagram.schema.js'
export * from './lib/diagram-engine/artifact-template-catalog.service.js'
export * from './lib/diagram-engine/diagram-layout.service.js'
export * from './lib/diagram-engine/diagram-rendering.service.js'
export * from './lib/diagram-engine/diagram-ir.service.js'
export * from './lib/diagram-engine/diagram.middleware.js'
export * from './lib/diagram-engine/entities/index.js'
