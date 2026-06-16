import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
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
              description: 'Upload, edit, version, comment, and review .docx files in a Workbench.',
              icon: {
                type: 'svg',
                value: DOCX_EDITOR_ICON,
                color: '#2563eb'
              },
              operations: [
                {
                  name: 'edit-docx',
                  displayName: 'Edit DOCX',
                  description: 'Open and edit .docx documents in the browser.',
                  access: 'write'
                },
                {
                  name: 'review-docx',
                  displayName: 'Review DOCX',
                  description: 'Use Agent tools to add comments and tracked changes.',
                  access: 'write'
                },
                {
                  name: 'version-docx',
                  displayName: 'Version DOCX',
                  description: 'Save and restore DOCX document versions.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: DOCX_EDITOR_VIEW_KEY,
              displayName: 'DOCX Editor Workbench',
              description: 'Workbench view for DOCX editing, comments, tracked changes, snapshots, and version history.'
            },
            {
              type: 'tool',
              name: DOCX_EDITOR_MIDDLEWARE_NAME,
              displayName: 'DOCX Editor Agent Tools',
              description: 'Assistant middleware tools for DOCX reading, comments, tracked changes, formatting, and live Workbench actions.'
            },
            {
              type: 'assistant-template',
              name: 'docx-editor-assistant',
              displayName: 'DOCX Editor Assistant Template',
              description: 'Prebuilt assistant template for DOCX document editing and review workflows.'
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
              description: 'Workflow skill for DOCX reading, paraId selection, comments, tracked changes, formatting, and version confirmation.',
              tags: ['skill', 'docx', 'document-review']
            },
            {
              type: 'assistant-template',
              name: 'docx-editor-assistant',
              displayName: 'DOCX Editor Assistant',
              description: 'Assistant template for DOCX editing and review workflows.'
            },
            {
              type: 'app',
              name: 'docx-editor',
              displayName: 'DOCX Editor',
              description: 'Workbench and Agent middleware tools for DOCX documents.'
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
