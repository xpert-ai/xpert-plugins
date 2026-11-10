import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  OntoAgentPluginConfigFormSchema,
  OntoAgentPluginConfigSchema,
  readOntoAgentPluginEnvDefaults
} from './lib/ontoagent.config.js'
import {
  ONTOAGENT_FEATURE,
  ONTOAGENT_ICON,
  ONTOAGENT_MIDDLEWARE_NAME,
  ONTOAGENT_PROVIDER_KEY,
  ONTOAGENT_TEMPLATE_KEY,
  ONTOAGENT_TEMPLATE_PROVIDER_KEY,
  ONTOAGENT_VIEW_KEY
} from './lib/constants.js'
import { OntoAgentPlugin } from './lib/ontoagent.plugin.js'
import { ontoagentTemplates } from './lib/ontoagent.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
  xpert: {
    plugin: {
      level: 'system' | 'tenant'
      artifactNamespace: string
    }
  }
}

const ConfigSchema = OntoAgentPluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: packageJson.xpert.plugin.level,
    artifactNamespace: packageJson.xpert.plugin.artifactNamespace,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app', 'business-ontology'],
        capabilities: [
          ONTOAGENT_FEATURE,
          'ontoagent-versioned-mirror',
          ONTOAGENT_VIEW_KEY,
          ONTOAGENT_TEMPLATE_KEY
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'ontoagent',
              displayName: 'OntoAgent Governed Context App',
              description:
                'Versioned Auto-Ontology mirror, retrieval recall, prompt injection, and evidence-backed answer confirmation.',
              icon: {
                type: 'svg',
                value: ONTOAGENT_ICON,
                color: '#4f46e5'
              },
              operations: [
                {
                  name: 'read-governed-context',
                  displayName: 'Read governed ontology context',
                  description: 'Read certified terms, packets, mirror versions, and retrieval summaries.',
                  access: 'read'
                },
                {
                  name: 'sync-auto-ontology',
                  displayName: 'Sync Auto-Ontology snapshots',
                  description: 'Synchronize certified Auto-Ontology snapshots into the versioned read-only mirror.',
                  access: 'write'
                },
                {
                  name: 'review-answers',
                  displayName: 'Review evidence-backed answers',
                  description: 'Confirm or reject assistant answers with mirror version evidence.',
                  access: 'admin'
                }
              ]
            },
            {
              type: 'view',
              name: ONTOAGENT_VIEW_KEY,
              displayName: 'OntoAgent Governed Workbench',
              description: 'Workbench view for mirror status, certified term catalog, and answer review.'
            },
            {
              type: 'tool',
              name: ONTOAGENT_MIDDLEWARE_NAME,
              displayName: 'OntoAgent Governed Context Middleware',
              description:
                'Inject versioned certified term packets before model calls and provide read-only ontology tools.'
            },
            {
              type: 'assistant-template',
              name: ONTOAGENT_TEMPLATE_KEY,
              displayName: 'OntoAgent Governed Context Assistant Template',
              description: 'Prebuilt assistant workflow template for governed ontology context and answer review.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [ONTOAGENT_MIDDLEWARE_NAME],
          viewProviders: [ONTOAGENT_PROVIDER_KEY],
          templateProviders: [ONTOAGENT_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: ONTOAGENT_ICON,
      color: '#4f46e5'
    },
    displayName: 'OntoAgent Governed Context',
    description:
      'Versioned Auto-Ontology mirror, retrieval recall, prompt injection, and evidence-backed answer confirmation.',
    keywords: ['ontology', 'governance', 'middleware', 'view-extension', 'context-injection', 'read-only'],
    author: 'OntoAgent'
  },
  config: {
    schema: ConfigSchema,
    formSchema: OntoAgentPluginConfigFormSchema,
    defaults: readOntoAgentPluginEnvDefaults()
  },
  templates: ontoagentTemplates,
  register(ctx) {
    ctx.logger.log('register ontoagent plugin')
    return { module: OntoAgentPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('ontoagent plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('ontoagent plugin stopped')
  }
}

export default plugin
