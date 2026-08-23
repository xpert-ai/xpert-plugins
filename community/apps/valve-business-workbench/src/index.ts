import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  ValvePluginConfigFormSchema,
  ValvePluginConfigSchema,
  readValvePluginEnvDefaults,
  type ValvePluginConfig
} from './lib/config'
import {
  VALVE_ARTIFACT_NAMESPACE,
  VALVE_FEATURE,
  VALVE_ICON,
  VALVE_MIDDLEWARE_NAME,
  VALVE_PLUGIN_NAME,
  VALVE_PROVIDER_KEY,
  VALVE_SKILL_KEY,
  VALVE_TEMPLATE_KEY,
  VALVE_TEMPLATE_PROVIDER_KEY,
  VALVE_VIEW_KEY
} from './lib/constants'
import { valveTemplates } from './lib/templates'
import { ValveBusinessWorkbenchPlugin } from './lib/valve.plugin'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const plugin: XpertPlugin<ValvePluginConfig> = {
  meta: {
    name: packageJson.name || VALVE_PLUGIN_NAME,
    version: packageJson.version,
    level: 'system',
    artifactNamespace: VALVE_ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool', 'skill'],
        capabilities: [VALVE_FEATURE, 'valve-object-360', 'valve-action-preflight', 'valve-demo-execution', 'valve-governed-proposals', 'valve-audit', 'valve-context-aware-operations'],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: VALVE_ARTIFACT_NAMESPACE,
              displayName: 'Valve Business Workbench',
              description: 'Review valve engineering objects, Action preflight, governed proposals, Demo execution receipts, and audit.',
              icon: { type: 'svg', value: VALVE_ICON, color: '#0f766e' },
              operations: [
                {
                  name: 'read-valve-ontology',
                  displayName: 'Read valve ontology',
                  description: 'Read ready published ontology snapshots through scoped data-xpert Agent Tools.',
                  access: 'read'
                },
                {
                  name: 'manage-valve-proposals',
                  displayName: 'Manage valve proposals',
                  description: 'Create and human-review governed engineering proposals without executing external actions.',
                  access: 'write'
                },
                {
                  name: 'execute-valve-demo-actions',
                  displayName: 'Execute valve Demo actions',
                  description: 'Generate simulated business receipts after explicit Workbench approval; never writes a real external system.',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: VALVE_VIEW_KEY,
              displayName: 'Valve Business Workbench',
              description: 'Studio-style object 360 and proposal review Workbench.'
            },
            {
              type: 'tool',
              name: VALVE_MIDDLEWARE_NAME,
              displayName: 'Valve Business Tools',
              description: 'Strict native middleware tools for published ontology reads and pending-review proposal creation.'
            },
            {
              type: 'skill',
              name: VALVE_SKILL_KEY,
              displayName: 'Valve Context-aware Operations',
              description: 'Guide the Agent through current-object resolution, evidence-based analysis, Action preflight, governed proposals, and audit.'
            },
            {
              type: 'assistant-template',
              name: VALVE_TEMPLATE_KEY,
              displayName: 'Valve Engineering Business Assistant',
              description: 'Assistant template for evidence-based valve analysis and governed recommendations.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [VALVE_MIDDLEWARE_NAME],
          viewProviders: [VALVE_PROVIDER_KEY],
          templateProviders: [VALVE_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: { type: 'svg', value: VALVE_ICON, color: '#0f766e' },
    displayName: { en_US: 'Valve Business Workbench', zh_Hans: '阀门业务工作台' },
    description: {
      en_US: 'Published valve ontology object 360, Assistant analysis, governed proposals, and audit.',
      zh_Hans: '已发布阀门本体对象 360、Assistant 分析、受控动作草案和审计。'
    },
    keywords: ['valve', 'ontology', 'engineering', 'workbench', 'governance', 'assistant'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ValvePluginConfigSchema,
    formSchema: ValvePluginConfigFormSchema,
    defaults: readValvePluginEnvDefaults()
  },
  templates: valveTemplates,
  register(ctx) {
    ctx.logger.log('register valve-business-workbench plugin')
    return { module: ValveBusinessWorkbenchPlugin, global: true }
  },
  onStart(ctx) {
    ctx.logger.log('valve-business-workbench plugin started')
  },
  onStop(ctx) {
    ctx.logger.log('valve-business-workbench plugin stopped')
  }
}

export default plugin
