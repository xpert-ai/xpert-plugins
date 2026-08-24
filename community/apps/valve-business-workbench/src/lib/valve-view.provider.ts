import { Inject, Injectable, Optional } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type {
  I18nObject,
  IconDefinition,
  JsonSchemaObjectType,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import {
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  ASSISTANT_CONTEXT_SET_COMMAND,
  ActorTokenRuntimeCapability,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  VALVE_FEATURE,
  VALVE_ICON,
  VALVE_MUTATION_TOOL_NAMES,
  VALVE_PLUGIN_NAME,
  VALVE_PROVIDER_KEY,
  VALVE_REMOTE_ENTRY_KEY,
  VALVE_VIEW_KEY
} from './constants'
import type { ValveActorScope, ValveProposalStatus } from './types'
import { ValveBusinessService } from './valve-business.service'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const viewIcon = { type: 'svg', value: VALVE_ICON, color: '#0f766e', alt: 'Valve' } satisfies IconDefinition

const reviewInputSchema = {
  type: 'object',
  properties: { comment: { type: 'string', title: text('Comment', '备注') } }
} satisfies JsonSchemaObjectType

const completionInputSchema = {
  type: 'object',
  properties: {
    comment: { type: 'string', title: text('Execution note', '执行说明') },
    demoOutcome: {
      type: 'string',
      title: text('Demo result', 'Demo 结果'),
      enum: ['success', 'failure'],
      default: 'success'
    }
  }
} satisfies JsonSchemaObjectType

const createDemoProposalInputSchema = {
  type: 'object',
  properties: {
    resourceId: { type: 'string', title: text('Resource', '本体资源') },
    entityTypeCode: { type: 'string', title: text('Entity type', '实体类型') },
    externalKey: { type: 'string', title: text('External key', '外部编号') },
    partitionKey: { type: 'string', title: text('Partition', '分区') },
    actionTypeCode: { type: 'string', title: text('Action code', 'Action 代码') }
  },
  required: ['resourceId', 'entityTypeCode', 'externalKey', 'actionTypeCode']
} satisfies JsonSchemaObjectType

const initializeOntologyInputSchema = {
  type: 'object',
  properties: {
    confirmOverwrite: {
      type: 'boolean',
      title: text('Confirm overwrite of unpublished draft', '确认覆盖未发布草稿'),
      default: false
    }
  }
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(VALVE_PROVIDER_KEY)
export class ValveViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly service: ValveBusinessService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) return []
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: VALVE_VIEW_KEY,
        title: text('Valve Business Workbench', '阀门业务工作台'),
        description: text(
          'Inspect valve engineering objects, relationships, evidence, constraints, proposals, and audit history.',
          '查看阀门工程对象、关系、证据、约束、动作草案和审计历史。'
        ),
        icon: viewIcon,
        hostType: 'agent',
        slot,
        order: fixed ? 18 : 16,
        refreshable: true,
        activation: { requiredFeatures: [VALVE_FEATURE] },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: { enabled: true, label: text('Valve Workbench', '阀门工作台'), order: 18, icon: viewIcon }
              }
            }
          : {}),
        source: { provider: VALVE_PROVIDER_KEY, plugin: VALVE_PLUGIN_NAME },
        parameters: [
          { key: 'resourceId', label: text('Resource', '本体资源'), type: 'string' },
          { key: 'entityTypeCode', label: text('Entity type', '实体类型'), type: 'string' },
          { key: 'entityId', label: text('Object', '对象'), type: 'string' },
          { key: 'partitionKey', label: text('Partition', '分区'), type: 'string' }
        ],
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: VALVE_REMOTE_ENTRY_KEY },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            // The remote view uses pageSize as a bounded result limit. Declaring
            // pagination support keeps the host query validator aligned with the
            // request while the provider still caps every query at 100 items.
            supportsPagination: true,
            supportsSearch: true,
            supportsSelection: true,
            supportsParameters: true,
            defaultPageSize: 30
          },
          cache: { enabled: false }
        },
        clientCommands: [
          { key: ASSISTANT_CONTEXT_SET_COMMAND, label: text('Set Assistant context', '设置 Assistant 上下文') },
          { key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, label: text('Send chat message', '发送到 Assistant 对话') }
        ],
        hostEvents: {
          subscriptions: [
            {
              key: 'valve-proposal-created',
              event: 'assistant.tool.completed',
              filter: { sources: ['chatkit'], toolNames: [...VALVE_MUTATION_TOOL_NAMES] },
              action: { type: 'forward', debounceMs: 600 }
            }
          ]
        },
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          {
            key: 'initialize_valve_ontology',
            label: text('Initialize valve ontology', '初始化阀门本体'),
            icon: 'ri-database-2-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: initializeOntologyInputSchema
          },
          {
            key: 'approve_proposal',
            label: text('Approve', '批准'),
            icon: 'ri-check-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: reviewInputSchema
          },
          {
            key: 'reject_proposal',
            label: text('Reject', '拒绝'),
            icon: 'ri-close-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: reviewInputSchema
          },
          {
            key: 'create_demo_proposal',
            label: text('Create Demo proposal', '创建 Demo 草案'),
            icon: 'ri-add-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: createDemoProposalInputSchema
          },
          {
            key: 'execute_demo_action',
            label: text('Execute Demo adapter', '执行 Demo 适配器'),
            icon: 'ri-play-circle-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: completionInputSchema
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
    if (viewKey !== VALVE_VIEW_KEY || component.entry !== VALVE_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Valve component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const componentRoot = join(__dirname, 'remote-components', VALVE_REMOTE_ENTRY_KEY)
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(join(componentRoot, 'app.js'), 'utf8'),
      readFile(join(componentRoot, 'app.css'), 'utf8'),
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Valve Business Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== VALVE_VIEW_KEY) return {}
    const scope = this.scopeFromContext(context)
    const mode = getStringParameter(query.parameters, 'mode') ?? 'workspace'
    const resourceId = getStringParameter(query.parameters, 'resourceId')
    const entityId = getStringParameter(query.parameters, 'entityId') ?? query.selectionId
    if (mode === 'resources') return { meta: { mode, items: await this.service.listResources(scope) } }
    if (mode === 'ontology_status') {
      return { meta: { mode, status: await this.service.getOntologyInitializationStatus(scope) } }
    }
    if (!resourceId) {
      const resources = await this.service.listResources(scope)
      return { meta: { mode: 'workspace', resources } }
    }
    if (mode === 'schema') return { meta: { mode, schema: await this.service.getSchema(scope, resourceId) } }
    if (mode === 'objects') {
      return {
        meta: {
          mode,
          ...(await this.service.searchObjects(scope, {
          resourceId,
          entityTypeCode: getStringParameter(query.parameters, 'entityTypeCode'),
          partitionKey: getStringParameter(query.parameters, 'partitionKey'),
          query: query.search ?? getStringParameter(query.parameters, 'search'),
          limit: Math.min(query.pageSize ?? 30, 100)
          }))
        }
      }
    }
    if (mode === 'proposals') {
      return {
        meta: {
          mode,
          items: await this.service.listActionProposals(scope, {
            resourceId,
            entityId,
            status: getProposalStatus(query.parameters),
            limit: 100
          })
        }
      }
    }
    if (mode === 'actions' && entityId) {
      return {
        meta: {
          mode,
          ...(await this.service.getAvailableActions(scope, {
            resourceId,
            partitionKey: getStringParameter(query.parameters, 'partitionKey'),
            target: {
              entityId,
              entityTypeCode: getStringParameter(query.parameters, 'entityTypeCode'),
              entityRef: getStringParameter(query.parameters, 'externalKey')
            }
          }))
        }
      }
    }
    if (mode === 'audit') {
      return {
        meta: {
          mode,
          items: await this.service.getAuditTrace(scope, {
            proposalId: getStringParameter(query.parameters, 'proposalId'),
            taskId: getStringParameter(query.parameters, 'taskId')
          })
        }
      }
    }
    if (mode === 'object360' && entityId) {
      return {
        meta: {
          mode,
          object: await this.service.getObject360(scope, {
            resourceId,
            partitionKey: getStringParameter(query.parameters, 'partitionKey'),
            target: {
              entityId,
              entityTypeCode: getStringParameter(query.parameters, 'entityTypeCode'),
              entityRef: getStringParameter(query.parameters, 'externalKey')
            }
          })
        }
      }
    }
    return { meta: { mode: 'workspace', resources: await this.service.listResources(scope) } }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== VALVE_VIEW_KEY) return failure('Unsupported view', '不支持的视图')
    if (actionKey === 'refresh') return success('Workbench refreshed', '工作台已刷新')
    if (actionKey === 'initialize_valve_ontology') {
      try {
        const result = await this.service.initializeOntology(this.scopeFromContext(context), {
          confirmOverwrite: request.input?.['confirmOverwrite'] === true
        })
        return {
          ...success('Valve ontology initialized and published', '阀门本体已初始化并发布'),
          data: result
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Valve ontology initialization failed'
        return failure(message, message)
      }
    }
    const targetId = request.targetId?.trim()
    if (!targetId) return failure('Target is required', '缺少操作目标')
    try {
      if (actionKey === 'create_demo_proposal') {
        const resourceId = getStringInput(request.input, 'resourceId')
        const entityTypeCode = getStringInput(request.input, 'entityTypeCode')
        const externalKey = getStringInput(request.input, 'externalKey')
        const actionTypeCode = getStringInput(request.input, 'actionTypeCode')
        if (!resourceId || !entityTypeCode || !externalKey || !actionTypeCode) {
          return failure('Demo proposal input is incomplete', 'Demo 草案参数不完整')
        }
        const proposal = await this.service.createDemoActionProposal(this.scopeFromContext(context), {
          resourceId,
          partitionKey: getStringInput(request.input, 'partitionKey'),
          target: { entityId: targetId, entityTypeCode, entityRef: externalKey },
          actionTypeCode
        })
        return { ...success('Demo proposal created for review', '已创建待审核 Demo 草案'), data: proposal }
      }
      if (actionKey === 'execute_demo_action') {
        const result = await this.service.executeDemoAction(this.scopeFromContext(context), targetId, {
          comment: getStringInput(request.input, 'comment'),
          demoOutcome: getDemoOutcome(request.input)
        })
        return {
          ...success('Demo execution receipt recorded', 'Demo 执行回执已记录'),
          data: result
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Demo action failed'
      return failure(message, message)
    }
    const transition = actionStatus(actionKey)
    if (!transition) return failure('Unsupported action', '不支持的操作')
    try {
      const proposal = await this.service.transitionProposal(this.scopeFromContext(context), targetId, transition, {
        comment: getStringInput(request.input, 'comment'),
        outcome: getStringInput(request.input, 'outcome')
      })
      return { ...success('Proposal status updated', '动作草案状态已更新'), data: proposal }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Proposal update failed'
      return failure(message, message)
    }
  }

  private scopeFromContext(context: XpertResolvedViewHostContext): ValveActorScope {
    if (!context.tenantId || !context.organizationId) throw new Error('TENANT_OR_ORGANIZATION_REQUIRED')
    const actorTokenApi = this.runtimeCapabilities?.get(ActorTokenRuntimeCapability)
    return {
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId,
      assistantId: context.hostId,
      actorTokenProvider: async () => {
        if (!actorTokenApi) throw new Error('ACTOR_TOKEN_REQUIRED')
        return (await actorTokenApi.getToken({ act: { sub: 'valve_business_workbench', view: VALVE_VIEW_KEY } })).token
      }
    }
  }
}

function getStringParameter(
  parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined,
  key: string
) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getProposalStatus(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined) {
  const value = getStringParameter(parameters, 'status')
  return ['pending_review', 'approved', 'rejected', 'completed', 'failed'].includes(value ?? '')
    ? (value as ValveProposalStatus)
    : undefined
}

function actionStatus(actionKey: string): Exclude<ValveProposalStatus, 'pending_review'> | undefined {
  if (actionKey === 'approve_proposal') return 'approved'
  if (actionKey === 'reject_proposal') return 'rejected'
  return undefined
}

function getDemoOutcome(input: Record<string, unknown> | null | undefined) {
  return input?.['demoOutcome'] === 'failure' ? 'failure' : 'success'
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: true, message: text(en_US, zh_Hans), refresh: true }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans) }
}
