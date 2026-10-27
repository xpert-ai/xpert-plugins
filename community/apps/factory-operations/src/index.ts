import { factoryOperationsApp } from './app-config.js'
import { FACTORY_PROFILE_FEATURE } from './lib/factory-profile.views.js'
import { z } from 'zod'
import type { I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { FACTORY_PACKAGE_METADATA } from './package-metadata.js'
import {
  FACTORY_ARTIFACT_NAMESPACE,
  FACTORY_FEATURE,
  FACTORY_ICON,
  FACTORY_INSIGHTS_MCP_CAPABILITY,
  FACTORY_INSIGHTS_TOOLSET_PROVIDER_KEY,
  FACTORY_MANAGEMENT_DASHBOARD_FEATURE,
  FACTORY_MCP_CAPABILITY,
  FACTORY_MIDDLEWARE,
  FACTORY_PLUGIN_LEVEL,
  FACTORY_PLUGIN_NAME,
  FACTORY_TEMPLATE_PROVIDER_KEY,
  FACTORY_TOOLSET_PROVIDER_KEY,
  FACTORY_VIEW_PROVIDER_KEY,
  FACTORY_WORKBENCH_FEATURE
} from './lib/constants.js'
import { FACTORY_CONFIG, FactoryConfigSchema } from './lib/config.js'
import { FactoryOperationsPlugin } from './lib/factory-operations.plugin.js'
import { factoryOperationsTemplates } from './lib/factory-templates.js'

const text = (en_US: string, zh_Hans: string): I18nObject => ({
  en_US,
  zh_Hans
})
const capabilities = [
  FACTORY_PROFILE_FEATURE,
  ...Object.values(FACTORY_FEATURE),
  FACTORY_WORKBENCH_FEATURE,
  FACTORY_MANAGEMENT_DASHBOARD_FEATURE,
  'factory-operations-assistant-template'
]

const plugin: XpertPlugin<z.infer<typeof FactoryConfigSchema>> = {
  meta: {
    name: FACTORY_PACKAGE_METADATA.name,
    version: FACTORY_PACKAGE_METADATA.version,
    level: FACTORY_PACKAGE_METADATA.xpert.plugin.level,
    artifactNamespace: FACTORY_PACKAGE_METADATA.xpert.plugin.artifactNamespace,
    category: 'middleware',
    displayName: 'Factory Intelligent Operations and Anomaly Recovery Center',
    description:
      'Governed multi-Agent investigation, recovery planning, approval, execution, and verification for factory anomalies.',
    author: 'XpertAI',
    icon: FACTORY_ICON,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities,
        marketplace: {
          contents: [
            {
              ...factoryOperationsApp,
              operations: [
                {
                  name: 'investigate-anomalies',
                  displayName: 'Investigate anomalies',
                  description: text('Persist evidence-backed specialist findings.', '持久化带证据的专业研判结论。'),
                  access: 'write'
                },
                {
                  name: 'approve-recovery-plans',
                  displayName: 'Approve recovery plans',
                  description: text('Authorize a revision-bound recovery plan.', '审批与修订号绑定的恢复方案。'),
                  access: 'write'
                },
                {
                  name: 'review-recovery-evidence',
                  displayName: 'Review recovery evidence',
                  description: text(
                    'Inspect execution confirmations and recovery evidence.',
                    '检查执行确认和恢复证据。'
                  ),
                  access: 'read'
                }
              ]
            }
          ]
        },
        runtime: {
          middlewareProviders: Object.values(FACTORY_MIDDLEWARE),
          viewProviders: [FACTORY_VIEW_PROVIDER_KEY],
          templateProviders: [FACTORY_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['assistant-template', 'app', 'mcp'],
        capabilities: [...capabilities, FACTORY_MCP_CAPABILITY, FACTORY_INSIGHTS_MCP_CAPABILITY],
        requiredPlugins: [FACTORY_PLUGIN_NAME],
        marketplace: {
          contents: [
            factoryOperationsApp,
            {
              type: 'mcp',
              name: 'factory-operations',
              displayName: text('Factory Recovery MCP Capabilities', '工厂恢复 MCP 能力'),
              description: text(
                'Host-native, organization-scoped Factory Case recovery mutation tools backed by the Agent middleware implementation.',
                '宿主原生、组织级、由 Agent Middleware 实现支撑的 Factory Case 恢复写入工具。'
              ),
              metadata: {
                protocol: 'native',
                provider: FACTORY_TOOLSET_PROVIDER_KEY
              }
            },
            {
              type: 'mcp',
              name: 'factory-operations-insights',
              displayName: text('Factory Operations Insights MCP', '工厂运营洞察 MCP'),
              description: text(
                'Host-native, organization-scoped read-only Factory Case search, progress, dashboard, and execution tools.',
                '宿主原生、组织级、只读的 Factory Case 搜索、进度、看板与执行状态工具。'
              ),
              metadata: {
                protocol: 'native',
                provider: FACTORY_INSIGHTS_TOOLSET_PROVIDER_KEY
              }
            }
          ]
        }
      }
    }
  },
  config: {
    schema: FactoryConfigSchema,
    defaults: { mode: 'simulation', debug: false }
  },
  templates: factoryOperationsTemplates,
  register(ctx) {
    return {
      module: FactoryOperationsPlugin,
      global: true,
      providers: [{ provide: FACTORY_CONFIG, useValue: ctx.config }],
      exports: [FACTORY_CONFIG]
    }
  }
}

if (FACTORY_PACKAGE_METADATA.name !== FACTORY_PLUGIN_NAME) {
  throw new Error('Factory plugin package metadata name is inconsistent.')
}

export default plugin
export * from './lib/constants.js'
export * from './lib/domain/types.js'
export * from './lib/factory-templates.js'
export * from './lib/factory-mcp-apps.js'
export {
  FactoryOperationsInsightsTools,
  FactoryOperationsTools,
  type FactoryToolExecutionContext
} from './lib/factory-middlewares.js'
