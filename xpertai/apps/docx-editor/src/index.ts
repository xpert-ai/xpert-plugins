import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  DOCX_EDITOR_AGENT_REVIEW_CAPABILITY,
  DOCX_EDITOR_FEATURE,
  DOCX_EDITOR_ICON,
  DOCX_EDITOR_MIDDLEWARE_NAME,
  DOCX_EDITOR_PLUGIN_NAME,
  DOCX_EDITOR_PROVIDER_KEY,
  DOCX_EDITOR_TEMPLATE_CAPABILITY,
  DOCX_EDITOR_TEMPLATE_PROVIDER_KEY,
  DOCX_EDITOR_VIEW_KEY,
  DOCX_EDITOR_WORKBENCH_CAPABILITY
} from './lib/constants.js'
import { DocxEditorPlugin } from './lib/docx-editor.plugin.js'
import { docxEditorTemplates } from './lib/docx-editor.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || DOCX_EDITOR_PLUGIN_NAME,
    version: packageJson.version,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          DOCX_EDITOR_FEATURE,
          DOCX_EDITOR_WORKBENCH_CAPABILITY,
          DOCX_EDITOR_AGENT_REVIEW_CAPABILITY,
          DOCX_EDITOR_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'docx-editor',
              displayName: 'DOCX Editor',
              description: text(
                'Upload, edit, version, comment, and review .docx files in a Workbench.',
                '在工作台中上传、编辑、版本化、批注和审阅 .docx 文件。'
              ),
              icon: {
                type: 'svg',
                value: DOCX_EDITOR_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'edit-docx',
                  displayName: 'Edit DOCX',
                  description: text(
                    'Open and edit .docx documents in the browser.',
                    '在浏览器中打开和编辑 .docx 文档。'
                  ),
                  access: 'write'
                },
                {
                  name: 'review-docx',
                  displayName: 'Review DOCX',
                  description: text(
                    'Use Agent tools to add comments and tracked changes.',
                    '使用 Agent 工具添加批注和修订建议。'
                  ),
                  access: 'write'
                },
                {
                  name: 'version-docx',
                  displayName: 'Version DOCX',
                  description: text(
                    'Save and restore DOCX document versions.',
                    '保存和恢复 DOCX 文档版本。'
                  ),
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: DOCX_EDITOR_VIEW_KEY,
              displayName: 'DOCX Editor Workbench',
              description: text(
                'Workbench view for DOCX editing, comments, tracked changes, snapshots, and version history.',
                '用于 DOCX 编辑、批注、修订建议、快照和版本历史的工作台视图。'
              )
            },
            {
              type: 'tool',
              name: DOCX_EDITOR_MIDDLEWARE_NAME,
              displayName: 'DOCX Editor Agent Tools',
              description: text(
                'Assistant middleware tools for DOCX reading, comments, tracked changes, formatting, and live Workbench actions.',
                '用于 DOCX 读取、批注、修订建议、格式处理和实时工作台操作的助手中间件工具。'
              )
            },
            {
              type: 'assistant-template',
              name: 'docx-editor-assistant',
              displayName: 'DOCX Editor Assistant Template',
              description: text(
                'Prebuilt assistant template for DOCX document editing and review workflows.',
                '面向 DOCX 文档编辑和审阅工作流的预置助手模板。'
              )
            }
          ]
        },
        runtime: {
          middlewareProviders: [DOCX_EDITOR_MIDDLEWARE_NAME],
          viewProviders: [DOCX_EDITOR_PROVIDER_KEY],
          templateProviders: [DOCX_EDITOR_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [
          DOCX_EDITOR_FEATURE,
          DOCX_EDITOR_WORKBENCH_CAPABILITY,
          DOCX_EDITOR_AGENT_REVIEW_CAPABILITY,
          DOCX_EDITOR_TEMPLATE_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'docx-editor',
              displayName: 'DOCX Editor Review Skill',
              description: text(
                'Workflow skill for DOCX reading, paraId selection, comments, tracked changes, formatting, and version confirmation.',
                '用于 DOCX 读取、paraId 选择、批注、修订建议、格式处理和版本确认的工作流技能。'
              ),
              tags: ['skill', 'docx', 'document-review']
            },
            {
              type: 'assistant-template',
              name: 'docx-editor-assistant',
              displayName: 'DOCX Editor Assistant',
              description: text(
                'Assistant template for DOCX editing and review workflows.',
                '面向 DOCX 编辑和审阅工作流的助手模板。'
              )
            },
            {
              type: 'app',
              name: 'docx-editor',
              displayName: 'DOCX Editor',
              description: text(
                'Workbench and Agent middleware tools for DOCX documents.',
                '用于 DOCX 文档的工作台和 Agent 中间件工具。'
              )
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: DOCX_EDITOR_ICON,
      color: '#2563eb'
    },
    displayName: 'DOCX Editor',
    description: 'Agentic DOCX editor plugin for browser editing, versioning, comments, tracked changes, and AI-assisted review.',
    keywords: ['docx', 'word', 'document', 'editor', 'comments', 'tracked-changes', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: docxEditorTemplates,
  register(ctx) {
    ctx.logger.log('register docx editor plugin')
    return { module: DocxEditorPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('docx editor plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('docx editor plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/docx-editor.plugin.js'
export * from './lib/docx-editor.service.js'
export * from './lib/docx-editor.middleware.js'
export * from './lib/docx-editor-view.provider.js'
export * from './lib/docx-editor.templates.js'
