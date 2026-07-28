import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  OFFICE_EDITOR_AGENT_REVIEW_CAPABILITY,
  OFFICE_EDITOR_ARTIFACT_NAMESPACE,
  OFFICE_EDITOR_ASSISTANT_TEMPLATE_KEY,
  OFFICE_EDITOR_COLLABORATION_CAPABILITY,
  OFFICE_EDITOR_FEATURE,
  OFFICE_EDITOR_ICON,
  OFFICE_EDITOR_MIDDLEWARE_NAME,
  OFFICE_EDITOR_PLUGIN_NAME,
  OFFICE_EDITOR_PROVIDER_KEY,
  OFFICE_EDITOR_TEMPLATE_CAPABILITY,
  OFFICE_EDITOR_TEMPLATE_PROVIDER_KEY,
  OFFICE_EDITOR_VIEW_KEY,
  OFFICE_EDITOR_WORKBENCH_CAPABILITY
} from './lib/constants.js'
import { OfficeEditorPlugin } from './lib/office-editor.plugin.js'
import { officeEditorTemplates } from './lib/office-editor.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || OFFICE_EDITOR_PLUGIN_NAME,
    version: packageJson.version,
    artifactNamespace: OFFICE_EDITOR_ARTIFACT_NAMESPACE,
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          OFFICE_EDITOR_FEATURE,
          OFFICE_EDITOR_WORKBENCH_CAPABILITY,
          OFFICE_EDITOR_AGENT_REVIEW_CAPABILITY,
          OFFICE_EDITOR_TEMPLATE_CAPABILITY,
          OFFICE_EDITOR_COLLABORATION_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'office-editor',
              displayName: 'Office Editor',
              description: 'Automatically edit versioned XLSX files and collaborate on Univer-native Office documents.',
              icon: {
                type: 'svg',
                value: OFFICE_EDITOR_ICON,
                color: '#0f766e'
              },
              operations: [
                {
                  name: 'edit-office-document',
                  displayName: 'Edit Office Document',
                  description: 'Open Office documents and download versioned XLSX files in the Workbench.',
                  access: 'write'
                },
                {
                  name: 'queue-agent-edits',
                  displayName: 'Queue Agent Edits',
                  description: 'Let Agents automatically edit XLSX files or queue document and presentation edits for review.',
                  access: 'write'
                },
                {
                  name: 'collaborate-office-document',
                  displayName: 'Collaborate',
                  description: 'Synchronize Office Editor sessions through plugin-owned Yjs rooms.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: OFFICE_EDITOR_VIEW_KEY,
              displayName: 'Office Editor Workbench',
              description: 'Workbench view for Univer-native spreadsheets, documents, presentations, Agent review, and Yjs collaboration.'
            },
            {
              type: 'tool',
              name: OFFICE_EDITOR_MIDDLEWARE_NAME,
              displayName: 'Office Editor Agent Tools',
              description: 'Assistant middleware tools for server-side XLSX automation, file versions, queued edits, and review.'
            },
            {
              type: 'assistant-template',
              name: OFFICE_EDITOR_ASSISTANT_TEMPLATE_KEY,
              displayName: 'Office Editor Assistant Template',
              description: 'Prebuilt assistant template for human and Agent Office editing workflows.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [OFFICE_EDITOR_MIDDLEWARE_NAME],
          viewProviders: [OFFICE_EDITOR_PROVIDER_KEY],
          templateProviders: [OFFICE_EDITOR_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities: [
          OFFICE_EDITOR_FEATURE,
          OFFICE_EDITOR_WORKBENCH_CAPABILITY,
          OFFICE_EDITOR_AGENT_REVIEW_CAPABILITY,
          OFFICE_EDITOR_TEMPLATE_CAPABILITY,
          OFFICE_EDITOR_COLLABORATION_CAPABILITY
        ],
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'office-editor',
              displayName: 'Office Editor Skill',
              description: 'Workflow skill for Univer-native Office document creation, queued edits, and human review.',
              tags: ['skill', 'office', 'univer', 'collaboration']
            },
            {
              type: 'assistant-template',
              name: OFFICE_EDITOR_ASSISTANT_TEMPLATE_KEY,
              displayName: 'Office Editor Assistant',
              description: 'Assistant template for spreadsheets, documents, and presentations.'
            },
            {
              type: 'app',
              name: 'office-editor',
              displayName: 'Office Editor',
              description: 'Workbench and Agent middleware tools for Univer-native Office documents.'
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: OFFICE_EDITOR_ICON,
      color: '#0f766e'
    },
    displayName: 'Office Editor',
    description: 'Agentic Office editor with server-side XLSX automation, file versioning, Univer editing, Yjs collaboration, and human review.',
    keywords: ['office', 'univer', 'spreadsheet', 'document', 'presentation', 'yjs', 'collaboration', 'middleware', 'view-extension', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: officeEditorTemplates,
  register(ctx) {
    ctx.logger.log('register office editor plugin')
    return { module: OfficeEditorPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('office editor plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('office editor plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/office-editor.plugin.js'
export * from './lib/office-editor.service.js'
export * from './lib/excel-automation.service.js'
export * from './lib/office-editor.middleware.js'
export * from './lib/office-editor-view.provider.js'
export * from './lib/office-editor-collab.gateway.js'
export * from './lib/office-editor.templates.js'
