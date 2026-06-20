import { Inject, Injectable, Optional } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  I18nObject,
  JsonSchemaObjectType,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar,
  type IconDefinition
} from '@xpert-ai/contracts'
import {
  AgentMiddlewareRuntimeCapabilityRegistry,
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  SALES_ONTOLOGY_FEATURE,
  SALES_ONTOLOGY_MIDDLEWARE_TOOL_NAMES,
  SALES_ONTOLOGY_PLUGIN_NAME,
  SALES_ONTOLOGY_PROVIDER_KEY,
  SALES_ONTOLOGY_REMOTE_ENTRY_KEY,
  SALES_ONTOLOGY_VIEW_KEY
} from './constants.js'
import { SalesOntologyService } from './sales-ontology.service.js'
import type { SalesOntologyScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const VIEW_ICON = {
  type: 'font',
  value: 'ri-line-chart-line'
} satisfies IconDefinition

const reviewProposalInputSchema = {
  type: 'object',
  properties: {
    reviewComment: {
      type: 'string',
      title: text('Review Comment', '审核备注')
    }
  }
} satisfies JsonSchemaObjectType

const executeProposalInputSchema = {
  type: 'object',
  properties: {
    result: {
      type: 'object',
      title: text('Result', '执行结果')
    }
  }
} satisfies JsonSchemaObjectType

const seedDatabaseInputSchema = {
  type: 'object',
  properties: {
    resourceId: {
      type: 'string',
      title: text('Ontology Resource', '本体资源')
    },
    publishOntology: {
      type: 'boolean',
      title: text('Publish Ontology', '发布本体')
    },
    includeInternalRecords: {
      type: 'boolean',
      title: text('Seed Workbench Records', '写入 Workbench 记录')
    },
    syncMode: {
      type: 'string',
      title: text('Sync Mode', '同步模式')
    }
  }
} satisfies JsonSchemaObjectType

const runReasoningInputSchema = {
  type: 'object',
  properties: {
    reasoningType: {
      type: 'string',
      title: text('Reasoning Type', '推理类型')
    },
    keyword: {
      type: 'string',
      title: text('Keyword', '关键词')
    },
    observation: {
      type: 'string',
      title: text('Observation', '观察')
    }
  }
} satisfies JsonSchemaObjectType

const simulateScenarioInputSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: text('Scenario Name', '场景名称')
    },
    scenarioType: {
      type: 'string',
      title: text('Scenario Type', '场景类型')
    },
    category: {
      type: 'string',
      title: text('Category', '分类')
    },
    targetValue: {
      type: 'number',
      title: text('Target Value', '目标值')
    },
    forecastValue: {
      type: 'number',
      title: text('Forecast Value', '预测值')
    },
    delta: {
      type: 'number',
      title: text('Delta', '变化量')
    },
    params: {
      type: 'object',
      title: text('Parameters', '参数')
    }
  }
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(SALES_ONTOLOGY_PROVIDER_KEY)
export class SalesOntologyViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly service: SalesOntologyService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }

    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: SALES_ONTOLOGY_VIEW_KEY,
        title: text('Sales Ontology', 'Sales Ontology 决策台'),
        description: text(
          'Review Sales Ontology perceptions, suggestions, and governed action proposals.',
          '查看 Sales Ontology 感知、建议和受控动作草案。'
        ),
        icon: VIEW_ICON,
        hostType: 'agent',
        slot,
        order: fixed ? 30 : 20,
        refreshable: true,
        activation: {
          requiredFeatures: [SALES_ONTOLOGY_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Sales Ontology', 'Sales Ontology'),
                  order: 30,
                  icon: VIEW_ICON
                }
              }
            }
          : {}),
        source: {
          provider: SALES_ONTOLOGY_PROVIDER_KEY,
          plugin: SALES_ONTOLOGY_PLUGIN_NAME
        },
        parameters: [
          {
            key: 'resourceId',
            label: text('Ontology Resource', '本体资源'),
            type: 'string'
          }
        ],
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: SALES_ONTOLOGY_REMOTE_ENTRY_KEY
          },
          dataSource: {
            mode: 'platform'
          }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsSearch: true,
            supportsSelection: true,
            supportsParameters: true,
            defaultPageSize: 30
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'sales-ontology-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...SALES_ONTOLOGY_MIDDLEWARE_TOOL_NAMES]
              },
              action: {
                type: 'forward',
                debounceMs: 1000
              }
            }
          ]
        },
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'seed_database',
            label: text('Seed Demo Data', '初始化演示数据'),
            icon: 'ri-database-2-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: seedDatabaseInputSchema
          },
          {
            key: 'run_perception',
            label: text('Run Perception', '运行感知'),
            icon: 'ri-radar-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'generate_suggestions',
            label: text('Generate Suggestions', '生成建议'),
            icon: 'ri-lightbulb-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'run_reasoning',
            label: text('Run Reasoning', '运行推理'),
            icon: 'ri-brain-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: runReasoningInputSchema
          },
          {
            key: 'simulate_scenario',
            label: text('Simulate Scenario', '运行推演'),
            icon: 'ri-route-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: simulateScenarioInputSchema
          },
          {
            key: 'approve_proposal',
            label: text('Approve', '批准'),
            icon: 'ri-check-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: reviewProposalInputSchema
          },
          {
            key: 'reject_proposal',
            label: text('Reject', '拒绝'),
            icon: 'ri-close-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: reviewProposalInputSchema
          },
          {
            key: 'execute_proposal',
            label: text('Execute', '标记执行'),
            icon: 'ri-play-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: executeProposalInputSchema
          }
        ],
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== SALES_ONTOLOGY_VIEW_KEY || component.entry !== SALES_ONTOLOGY_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(join(__dirname, 'remote-components', SALES_ONTOLOGY_REMOTE_ENTRY_KEY, 'app.js'), 'utf8')
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Sales Ontology',
        lang: 'zh-Hans',
        reactUmd: react,
        reactDomUmd: reactDom,
        appScript
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== SALES_ONTOLOGY_VIEW_KEY) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context), {
      resourceId: getStringParameter(query.parameters, 'resourceId'),
      viewTab: getStringParameter(query.parameters, 'viewTab'),
      insightType: getStringParameter(query.parameters, 'insightType'),
      graphObjectType: getStringParameter(query.parameters, 'graphObjectType'),
      search: query.search,
      selectionId: query.selectionId,
      page: query.page,
      pageSize: query.pageSize,
      limit: query.pageSize
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== SALES_ONTOLOGY_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Sales Ontology view refreshed', 'Sales Ontology 视图已刷新')
      }
      if (actionKey === 'seed_database') {
        const data = await this.service.seedDatabase(scope, {
          ...(request.input ?? {}),
          resourceId: getStringInput(request.input, 'resourceId') ?? getStringParameter(request.parameters, 'resourceId')
        })
        return { ...success('Sales Ontology demo data seeded', 'Sales Ontology 演示数据已初始化'), data }
      }
      if (actionKey === 'run_perception') {
        const data = await this.service.runPerception(scope, {
          resourceId: getStringInput(request.input, 'resourceId') ?? getStringParameter(request.parameters, 'resourceId')
        })
        return { ...success('Sales Ontology perception completed', 'Sales Ontology 感知已完成'), data }
      }
      if (actionKey === 'generate_suggestions') {
        const data = await this.service.generateSuggestions(scope, {
          resourceId: getStringInput(request.input, 'resourceId') ?? getStringParameter(request.parameters, 'resourceId')
        })
        return { ...success('Sales Ontology suggestions generated', 'Sales Ontology 建议已生成'), data }
      }
      if (actionKey === 'run_reasoning') {
        const data = await this.service.runReasoning(scope, {
          ...(request.input ?? {}),
          resourceId: getStringInput(request.input, 'resourceId') ?? getStringParameter(request.parameters, 'resourceId'),
          reasoningType: getStringInput(request.input, 'reasoningType') ?? 'multi_step'
        })
        return { ...success('Sales Ontology reasoning completed', 'Sales Ontology 推理已完成'), data }
      }
      if (actionKey === 'simulate_scenario') {
        const data = await this.service.simulateScenario(scope, {
          ...(request.input ?? {}),
          resourceId: getStringInput(request.input, 'resourceId') ?? getStringParameter(request.parameters, 'resourceId')
        })
        return { ...success('Sales Ontology scenario simulated', 'Sales Ontology 场景推演已完成'), data }
      }
      if (actionKey === 'approve_proposal') {
        const data = await this.service.approveProposal(scope, requireTargetId(request), request.input ?? {})
        return { ...success('Sales Ontology proposal approved', 'Sales Ontology 动作草案已批准'), data }
      }
      if (actionKey === 'reject_proposal') {
        const data = await this.service.rejectProposal(scope, requireTargetId(request), request.input ?? {})
        return { ...success('Sales Ontology proposal rejected', 'Sales Ontology 动作草案已拒绝'), data }
      }
      if (actionKey === 'execute_proposal') {
        const data = await this.service.executeProposal(scope, requireTargetId(request), request.input ?? {})
        return { ...success('Sales Ontology proposal executed', 'Sales Ontology 动作草案已标记执行'), data }
      }
      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Sales Ontology action failed')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): SalesOntologyScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function requireTargetId(request: XpertViewActionRequest) {
  const targetId = request.targetId?.trim()
  if (!targetId) {
    throw new Error('Sales Ontology proposal is required')
  }
  return targetId
}

function getStringParameter(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans),
    refresh: true
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans)
  }
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}
