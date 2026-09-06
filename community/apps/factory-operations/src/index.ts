import { FACTORY_PROFILE_FEATURE } from './lib/factory-profile.views.js'
import { z } from 'zod'
import type { I18nObject, PluginMarketplaceContribution } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { FACTORY_PACKAGE_METADATA } from './package-metadata.js'
import {
  FACTORY_ARTIFACT_NAMESPACE,
  FACTORY_FEATURE,
  FACTORY_ICON,
  FACTORY_INSIGHTS_MCP_CAPABILITY,
  FACTORY_INSIGHTS_TOOLSET_PROVIDER_KEY,
  FACTORY_MANAGEMENT_DASHBOARD_FEATURE,
  FACTORY_MANAGER_TEMPLATE_KEY,
  FACTORY_MCP_CAPABILITY,
  FACTORY_MIDDLEWARE,
  FACTORY_PLUGIN_LEVEL,
  FACTORY_PLUGIN_NAME,
  FACTORY_TEMPLATE_PROVIDER_KEY,
  FACTORY_TOOLSET_PROVIDER_KEY,
  FACTORY_VIEW_KEY,
  FACTORY_VIEW_PROVIDER_KEY,
  FACTORY_WORKBENCH_FEATURE
} from './lib/constants.js'
import { FACTORY_CONFIG, FACTORY_RUNTIME_SCOPE, FactoryConfigSchema } from './lib/config.js'
import { FactoryOperationsPlugin } from './lib/factory-operations.plugin.js'
import { factoryOperationsTemplates } from './lib/factory-templates.js'

const text = (en_US: string, zh_Hans: string): I18nObject => ({
  en_US,
  zh_Hans
})
// Keep this helper until the published 3.16 contracts package includes the host's
// newer appConfig field. The returned object remains structurally assignable to
// PluginMarketplaceContribution while preserving full appConfig inference.
const applicationContribution = <T extends { type: 'app'; name: string; appConfig: object }>(
  value: T
): PluginMarketplaceContribution => value as unknown as PluginMarketplaceContribution
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
    level: FACTORY_PLUGIN_LEVEL,
    artifactNamespace: FACTORY_ARTIFACT_NAMESPACE,
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
              type: 'app',
              name: 'factory-operations',
              displayName: 'Factory Operations Center',
              description: text('Coordinate governed factory anomaly recovery.', '协同完成受控的工厂异常恢复。'),
              icon: FACTORY_ICON,
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
            applicationContribution({
              type: 'app',
              name: 'factory-operations',
              displayName: text('Factory Intelligent Operations Center', '工厂智能运营与异常恢复中心'),
              description: text(
                'Initialize the management entry for the independent-Assistant factory recovery suite.',
                '初始化独立 Assistant 工厂异常恢复套件的管理入口。'
              ),
              icon: FACTORY_ICON,
              color: '#0F766E',
              tags: ['business-operations', 'factory', 'multi-agent'],
              appConfig: {
                scope: 'organization' as const,
                assistantTemplateKey: FACTORY_MANAGER_TEMPLATE_KEY,
                workspace: {
                  mode: 'dedicated',
                  name: text('Factory Intelligent Operations', '工厂智能运营与异常恢复'),
                  description: text(
                    'Organization-shared workspace for factory recovery monitoring and the independent Assistant suite.',
                    '用于工厂异常恢复监控与独立 Assistant 套件的组织共享工作空间。'
                  ),
                  sharing: 'organization'
                },
                modelRequirements: { primary: true },
                presentation: {
                  tagline: text(
                    'See the risk. Coordinate the recovery. Prove the result.',
                    '看清风险，协同恢复，验证结果。'
                  ),
                  longDescription: text(
                    'A governed factory anomaly recovery application with independent role Assistants, a human approval gate, an operational swimlane, and an ECharts management dashboard.',
                    '包含独立角色 Assistants、人工审批门、运营泳道和 ECharts 管理监控面板的受控工厂异常恢复应用。'
                  ),
                  developer: 'XpertAI',
                  screenshots: ['./assets/screenshot-01.jpg'],
                  features: [
                    {
                      key: 'independent-role-assistants',
                      title: text('Independent role Assistants', '独立角色 Assistants'),
                      description: text(
                        'Eight lane owners are installed independently and connected to one Orchestrator through direct required External Xperts.',
                        '八个泳道责任角色独立安装，并通过必需的 External Xpert 直连到一个 Orchestrator。'
                      )
                    },
                    {
                      key: 'governed-recovery-pipeline',
                      title: text('Governed recovery pipeline', '受控异常恢复流水线'),
                      description: text(
                        'Revision-bound evidence, human approval, execution confirmations, and recovery verification remain auditable.',
                        '修订绑定证据、人工审批、执行确认与恢复验证全程可审计。'
                      )
                    },
                    {
                      key: 'management-monitoring',
                      title: text('Management monitoring', '管理监控'),
                      description: text(
                        'ECharts trends and lane bottlenecks drill down to the exact Factory Case.',
                        'ECharts 趋势与泳道瓶颈可下钻到精确 Factory Case。'
                      )
                    }
                  ],
                  useCases: [
                    text('Severe equipment anomaly recovery', '严重设备异常恢复'),
                    text('Cross-role evidence reconciliation', '跨角色证据会诊'),
                    text('Recovery throughput and blocker monitoring', '恢复吞吐与阻塞监控')
                  ],
                  dataScope: text(
                    'All application resources are scoped to the current organization.',
                    '所有应用资源限定在当前组织范围内。'
                  ),
                  initializationSummary: text(
                    'Creates one organization-shared workspace and publishes the read-only management Assistant. Provision the operational role suite with the versioned assistant:suite:init profile.',
                    '创建一个组织共享工作空间并发布只读管理 Assistant；运营角色套件使用版本化 assistant:suite:init 配置进行部署。'
                  ),
                  initializationSteps: [
                    text('Verify an enabled primary model.', '检查可用的主模型。'),
                    text('Create the dedicated organization workspace.', '创建专用组织工作空间。'),
                    text('Install and publish the management Assistant.', '安装并发布管理 Assistant。')
                  ]
                },
                entry: { type: 'assistant-chat' }
              }
            }),
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
      providers: [
        { provide: FACTORY_CONFIG, useValue: ctx.config },
        {
          provide: FACTORY_RUNTIME_SCOPE,
          useValue: { scopeKey: ctx.scopeKey ?? 'global' }
        }
      ],
      exports: [FACTORY_CONFIG, FACTORY_RUNTIME_SCOPE]
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
