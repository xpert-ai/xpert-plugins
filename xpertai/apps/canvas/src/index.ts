import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  CANVAS_AGENT_CAPABILITY,
  CANVAS_ARTIFACT_NAMESPACE,
  CANVAS_FEATURE,
  CANVAS_ICON,
  CANVAS_MIDDLEWARE_NAME,
  CANVAS_PLUGIN_NAME,
  CANVAS_PROVIDER_KEY,
  CANVAS_TEMPLATE_CAPABILITY,
  CANVAS_TEMPLATE_PROVIDER_KEY,
  CANVAS_WORKBENCH_CAPABILITY,
  CANVAS_WORKBENCH_VIEW_KEY
} from './lib/constants.js'
import { CanvasPlugin } from './lib/canvas.plugin.js'
import { canvasTemplates } from './lib/canvas.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({
  tldrawLicenseKey: z.string().optional()
})
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

const canvasMarketplaceOperations = [
  {
    name: 'create-canvas-documents',
    displayName: 'Create Canvas documents',
    description: text(
      'Create reviewable infinite canvases and visual planning boards.',
      '创建可审核的无限画布和可视化规划看板。'
    ),
    access: 'write' as const
  },
  {
    name: 'save-canvas-versions',
    displayName: 'Save Canvas versions',
    description: text(
      'Checkpoint authoritative Canvas state, staged record patches, image insertions, and Workbench edits.',
      '保存权威 Canvas 状态检查点、阶段记录补丁、图片插入和工作台编辑。'
    ),
    access: 'write' as const
  },
  {
    name: 'review-canvas-workbench',
    displayName: 'Review Canvas Workbench',
    description: text(
      'Open the Canvas Workbench to inspect, annotate, import, export, and manually edit canvases.',
      '打开 Canvas 工作台，检查、标注、导入导出并手动编辑画布。'
    ),
    access: 'read' as const
  },
  {
    name: 'share-canvas-artifacts',
    displayName: 'Share Canvas Artifacts',
    description: text(
      'Publish, copy, update, and revoke read-only Canvas Artifact links from the human Workbench.',
      '在人工工作台中发布、复制、更新和撤销只读 Canvas Artifact 链接。'
    ),
    access: 'write' as const
  }
]

type CanvasXpertPlugin = Omit<XpertPlugin<z.infer<typeof ConfigSchema>>, 'templates'> & {
  templates: typeof canvasTemplates
}

const plugin: CanvasXpertPlugin = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'system',
    artifactNamespace: CANVAS_ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [CANVAS_FEATURE, CANVAS_WORKBENCH_CAPABILITY, CANVAS_AGENT_CAPABILITY, CANVAS_TEMPLATE_CAPABILITY],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'canvas',
              displayName: 'Canvas',
              description: text(
                'Use Canvas Assistant to create, review, annotate, share, import, export, and version Agent-managed tldraw canvases.',
                '使用 Canvas Assistant 创建、审核、标注、分享、导入导出并版本化 Agent 管理的 tldraw 画布。'
              ),
              icon: {
                type: 'svg',
                value: CANVAS_ICON,
                color: '#0f766e'
              },
              operations: canvasMarketplaceOperations
            },
            {
              type: 'view',
              name: CANVAS_WORKBENCH_VIEW_KEY,
              displayName: 'Canvas Workbench',
              description: text(
                'Workbench view for tldraw canvas editing, AI image holders, annotations, Artifact sharing, versions, and logs.',
                '用于编辑 tldraw 画布、AI 图片占位、标注、Artifact 分享、版本和日志的工作台视图。'
              ),
              metadata: {
                app: 'canvas'
              }
            },
            {
              type: 'middleware',
              name: CANVAS_MIDDLEWARE_NAME,
              displayName: 'Canvas Agent Tools',
              description: text(
                'Assistant middleware tools for metadata-only creation, simplified staged shape creation, targeted record patches, progressive reads, image insertion, and failure reporting. Versions remain human-controlled.',
                '用于仅创建元数据、简化 Shape 分阶段创建、定向记录补丁、渐进查询、图片插入和失败上报的助手中间件工具；版本仅由人工创建。'
              ),
              metadata: {
                app: 'canvas'
              }
            },
            {
              type: 'assistant-template',
              name: 'canvas-assistant',
              displayName: 'Canvas Assistant Template',
              description: text(
                'Prebuilt assistant template for Agent-managed canvas creation, image holder, and annotation workflows.',
                '面向 Agent 管理画布创建、图片占位和标注工作流的预置助手模板。'
              ),
              metadata: {
                app: 'canvas'
              }
            }
          ]
        },
        runtime: {
          middlewareProviders: [CANVAS_MIDDLEWARE_NAME],
          viewProviders: [CANVAS_PROVIDER_KEY],
          templateProviders: [CANVAS_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [CANVAS_FEATURE, CANVAS_WORKBENCH_CAPABILITY, CANVAS_AGENT_CAPABILITY, CANVAS_TEMPLATE_CAPABILITY],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'canvas-agent-skill',
              displayName: 'Canvas Agent Skill',
              description: text(
                'Skill for using Canvas middleware tools, Workbench selection context, tldraw snapshot inspection, record patching, image insertion, versioning, and recovery.',
                '使用 Canvas 中间件工具、工作台选择上下文、tldraw 快照检查、记录修补、图片插入、版本管理和恢复的技能。'
              ),
              tags: ['skill', 'canvas', 'tldraw', 'agent-canvas', 'middleware-tools']
            },
            {
              type: 'assistant-template',
              name: 'canvas-assistant',
              displayName: 'Canvas Assistant',
              description: text(
                'Assistant template for Canvas visual workflows.',
                '面向 Canvas 可视化工作流的助手模板。'
              ),
              metadata: {
                app: 'canvas'
              }
            },
            {
              type: 'app',
              name: 'canvas',
              displayName: 'Canvas',
              description: text(
                'Use Canvas Assistant with Workbench and Agent middleware tools for tldraw canvases.',
                '结合工作台和 Agent 中间件工具使用 Canvas Assistant 管理 tldraw 画布。'
              ),
              operations: canvasMarketplaceOperations
            },
            {
              type: 'view',
              name: CANVAS_WORKBENCH_VIEW_KEY,
              displayName: 'Canvas Workbench',
              description: text(
                'Workbench view for tldraw canvas editing, AI image holders, annotations, Artifact sharing, versions, and logs.',
                '用于编辑 tldraw 画布、AI 图片占位、标注、Artifact 分享、版本和日志的工作台视图。'
              ),
              metadata: {
                app: 'canvas'
              }
            },
            {
              type: 'middleware',
              name: CANVAS_MIDDLEWARE_NAME,
              displayName: 'Canvas Agent Tools',
              description: text(
                'Assistant middleware tools for metadata-only creation, simplified staged shape creation, targeted record patches, progressive reads, image insertion, and failure reporting. Versions remain human-controlled.',
                '用于仅创建元数据、简化 Shape 分阶段创建、定向记录补丁、渐进查询、图片插入和失败上报的助手中间件工具；版本仅由人工创建。'
              ),
              metadata: {
                app: 'canvas'
              }
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: CANVAS_ICON,
      color: '#0f766e'
    },
    displayName: 'Canvas',
    description: 'Agentic Canvas plugin for tldraw whiteboards, AI image holders, annotation workflows, versioning, and review.',
    keywords: ['canvas', 'tldraw', 'whiteboard', 'image-generation', 'annotation', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: canvasTemplates,
  register(ctx) {
    ctx.logger.log('register canvas plugin')
    return { module: CanvasPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('canvas plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('canvas plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/canvas.plugin.js'
export * from './lib/canvas.service.js'
export * from './lib/canvas.middleware.js'
export * from './lib/canvas-view.provider.js'
export * from './lib/canvas.templates.js'
export * from './lib/canvas-snapshot.validation.js'
export * from './lib/canvas-yjs.js'
export * from './lib/canvas-collaboration.provider.js'
export * from './lib/canvas-artifact.service.js'
export * from './lib/canvas-artifact-export.service.js'
export * from './lib/canvas-artifact-export.processor.js'
