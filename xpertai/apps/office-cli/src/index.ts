import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  OFFICE_CLI_AGENT_CAPABILITY,
  OFFICE_CLI_ARTIFACT_NAMESPACE,
  OFFICE_CLI_ASSISTANT_TEMPLATE_KEY,
  OFFICE_CLI_FEATURE,
  OFFICE_CLI_ICON,
  OFFICE_CLI_MIDDLEWARE_NAME,
  OFFICE_CLI_PLUGIN_NAME,
  OFFICE_CLI_PROVIDER_KEY,
  OFFICE_CLI_RENDERING_CAPABILITY,
  OFFICE_CLI_TEMPLATE_PROVIDER_KEY,
  OFFICE_CLI_VERSIONING_CAPABILITY,
  OFFICE_CLI_VIEW_KEY,
  OFFICE_CLI_WORKBENCH_CAPABILITY
} from './lib/constants.js'
import { OfficeCliPlugin } from './lib/office-cli.plugin.js'
import { officeCliTemplates } from './lib/office-cli.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}
const ConfigSchema = z.object({})
const capabilities = [
  OFFICE_CLI_FEATURE,
  OFFICE_CLI_WORKBENCH_CAPABILITY,
  OFFICE_CLI_AGENT_CAPABILITY,
  OFFICE_CLI_RENDERING_CAPABILITY,
  OFFICE_CLI_VERSIONING_CAPABILITY
]

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || OFFICE_CLI_PLUGIN_NAME,
    version: packageJson.version,
    artifactNamespace: OFFICE_CLI_ARTIFACT_NAMESPACE,
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
              name: 'office-cli',
              displayName: 'OfficeCLI',
              description: 'Visual native DOCX, XLSX, and PPTX automation powered by OfficeCLI.',
              icon: {
                type: 'svg',
                value: OFFICE_CLI_ICON,
                color: '#e5484d'
              },
              operations: [
                {
                  name: 'create-native-office-files',
                  displayName: 'Create native Office files',
                  description: 'Create DOCX, XLSX, and PPTX files without Microsoft Office.',
                  access: 'write'
                },
                {
                  name: 'inspect-and-edit-office-structures',
                  displayName: 'Inspect and edit Office structures',
                  description: 'Use semantic, DOM, batch, and raw OOXML operations through OfficeCLI.',
                  access: 'write'
                },
                {
                  name: 'render-and-review-office-files',
                  displayName: 'Render and review',
                  description: 'Render native Office files, select elements visually, validate output, and restore versions.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: OFFICE_CLI_VIEW_KEY,
              displayName: 'OfficeCLI Workbench',
              description: 'Native Office preview, command editing, versions, validation, and download.'
            },
            {
              type: 'tool',
              name: OFFICE_CLI_MIDDLEWARE_NAME,
              displayName: 'OfficeCLI Agent Tools',
              description: 'Agent tools for complete OfficeCLI document workflows.'
            },
            {
              type: 'assistant-template',
              name: OFFICE_CLI_ASSISTANT_TEMPLATE_KEY,
              displayName: 'OfficeCLI Assistant',
              description: 'Prebuilt Assistant for native OfficeCLI workflows.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [OFFICE_CLI_MIDDLEWARE_NAME],
          viewProviders: [OFFICE_CLI_PROVIDER_KEY],
          templateProviders: [OFFICE_CLI_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities,
        marketplace: {
          contents: [
            {
              type: 'skill',
              name: 'officecli',
              displayName: 'OfficeCLI Skill',
              description: 'Native DOCX, XLSX, and PPTX creation, inspection, editing, rendering, and validation.',
              tags: ['skill', 'officecli', 'docx', 'xlsx', 'pptx']
            },
            {
              type: 'assistant-template',
              name: OFFICE_CLI_ASSISTANT_TEMPLATE_KEY,
              displayName: 'OfficeCLI Assistant',
              description: 'Assistant template for OfficeCLI-native document work.'
            },
            {
              type: 'app',
              name: 'office-cli',
              displayName: 'OfficeCLI',
              description: 'Visual Workbench and Agent tools backed by the full OfficeCLI document engine.'
            }
          ]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: OFFICE_CLI_ICON,
      color: '#e5484d'
    },
    displayName: 'OfficeCLI',
    description: 'Visual AI-native Office automation with native rendering, deep document editing, immutable versions, and Agent tools.',
    keywords: ['officecli', 'docx', 'xlsx', 'pptx', 'office', 'rendering', 'versioning', 'agentic-app'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  templates: officeCliTemplates,
  register(ctx) {
    ctx.logger.log('register OfficeCLI app plugin')
    return { module: OfficeCliPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('OfficeCLI app plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('OfficeCLI app plugin stopped')
  }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/office-cli.plugin.js'
export * from './lib/office-cli-runtime.service.js'
export * from './lib/office-cli.service.js'
export * from './lib/office-cli.middleware.js'
export * from './lib/office-cli-view.provider.js'
export * from './lib/office-cli.templates.js'
