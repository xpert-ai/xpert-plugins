import { HttpException, Injectable } from '@nestjs/common'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type I18nObject,
  type XpertExtensionViewManifest,
  type XpertRemoteComponentEntry,
  type XpertRemoteComponentViewSchema,
  type XpertResolvedViewHostContext,
  type XpertViewActionRequest,
  type XpertViewActionResult,
  type XpertViewDataResult,
  type XpertViewQuery
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  FACTORY_ICON,
  FACTORY_CASE_WORKSPACE_REMOTE_ENTRY_KEY,
  FACTORY_CASE_WORKSPACE_VIEW_KEY,
  FACTORY_DASHBOARD_REMOTE_ENTRY_KEY,
  FACTORY_DASHBOARD_VIEW_KEY,
  FACTORY_MANAGEMENT_DASHBOARD_FEATURE,
  FACTORY_MUTATION_TOOL_NAMES,
  FACTORY_PLUGIN_NAME,
  FACTORY_REMOTE_ENTRY_KEY,
  FACTORY_VIEW_KEY,
  FACTORY_VIEW_PROVIDER_KEY,
  FACTORY_WORKBENCH_FEATURE
} from './constants.js'
import type { FactoryPipelineProjection, FactoryScope } from './domain/types.js'
import { FactoryOperationsService } from './factory-operations.service.js'
import { FactoryCaseProjectService } from './factory-case-project.service.js'
import { FactoryAssistantTaskService } from './factory-assistant-task.service.js'
import {
  approveRecoveryPlanSchema,
  createDemoIncidentSchema,
  executeRecoveryPlanSchema,
  rejectRecoveryPlanSchema,
  verifyRecoverySchema
} from './tool-schemas.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const requireFromHere = createRequire(import.meta.url)
const text = (en_US: string, zh_Hans: string): I18nObject => ({
  en_US,
  zh_Hans
})

type FactoryWorkbenchData = XpertViewDataResult & {
  tableKey: 'cases'
  table: {
    key: 'cases'
    items: Awaited<ReturnType<FactoryOperationsService['listCases']>>['items']
    total: number
    page: number
    pageSize: number
  }
  selectedCase: Awaited<ReturnType<FactoryOperationsService['getCaseSummary']>> | null
  projection: Awaited<ReturnType<FactoryOperationsService['getCaseProjection']>> | null
  selectedNodeKey: string | null
  runtimeProjectId: string | null
  simulation: boolean
}

type FactoryDashboardData = XpertViewDataResult &
  Awaited<ReturnType<FactoryOperationsService['getManagementDashboard']>>

@Injectable()
@ViewExtensionProvider(FACTORY_VIEW_PROVIDER_KEY)
export class FactoryOperationsViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly service: FactoryOperationsService,
    private readonly caseProjects: FactoryCaseProjectService,
    private readonly assistantTasks: FactoryAssistantTaskService
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(
    context: XpertResolvedViewHostContext,
    slot: string
  ): XpertExtensionViewManifest[] {
    if (
      context.hostType !== 'agent' ||
      (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT)
    ) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    if (fixed) {
      return [pipelineManifest(slot, true), workspaceManifest(slot), dashboardManifest(slot)]
    }
    return [pipelineManifest(slot, false), workspaceManifest(slot), dashboardManifest(slot, false)]
  }

  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    const supported =
      (viewKey === FACTORY_VIEW_KEY && component.entry === FACTORY_REMOTE_ENTRY_KEY) ||
      (viewKey === FACTORY_CASE_WORKSPACE_VIEW_KEY &&
        component.entry === FACTORY_CASE_WORKSPACE_REMOTE_ENTRY_KEY) ||
      (viewKey === FACTORY_DASHBOARD_VIEW_KEY &&
        component.entry === FACTORY_DASHBOARD_REMOTE_ENTRY_KEY)
    if (!supported) {
      return {
        html: '<!doctype html><html><body>Unsupported Factory Operations component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const componentDir = join(moduleDir, 'remote-components', component.entry)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const cssPath = join(componentDir, 'app.css')
    const appCss = existsSync(cssPath) ? await readFile(cssPath, 'utf8') : ''
    const [reactUmd, reactDomUmd] = await Promise.all([
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      html: renderRemoteReactIframeHtml({
        title:
          viewKey === FACTORY_DASHBOARD_VIEW_KEY
            ? 'Factory Operations Management Dashboard'
            : viewKey === FACTORY_CASE_WORKSPACE_VIEW_KEY
              ? 'Factory Case Workspace'
              : 'Factory Recovery Pipeline',
        lang: normalizeHtmlLang(context.locale),
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
  ): Promise<FactoryWorkbenchData | FactoryDashboardData | XpertViewDataResult> {
    if (viewKey === FACTORY_DASHBOARD_VIEW_KEY) {
      return this.service.getManagementDashboard(scopeFromContext(context))
    }
    if (viewKey !== FACTORY_VIEW_KEY && viewKey !== FACTORY_CASE_WORKSPACE_VIEW_KEY) return {}
    const scope = scopeFromContext(context)
    const cases = await this.service.listCases(scope, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search
    })
    const runtimeProjectId = readRuntimeProjectId(context)
    const requestedId = query.selectionId ?? readParameter(query.parameters, 'caseId')
    const runtimeCase = runtimeProjectId
      ? await this.service.findCaseSummaryByWorkspaceProject(scope, runtimeProjectId)
      : null
    const requestedCase =
      !runtimeProjectId && requestedId
        ? (cases.items.find((item) => item.id === requestedId) ??
          (await this.service.getCaseSummary(scope, { caseId: requestedId })))
        : null
    const selectedCase = runtimeProjectId ? runtimeCase : (requestedCase ?? cases.items[0] ?? null)
    const selectedId = selectedCase?.id
    if (selectedId) await this.assistantTasks.reconcile(scope, selectedId)
    const projection = selectedId
      ? withPlatformAssistantBindings(
          await this.service.getCaseProjection(scope, { caseId: selectedId }),
          context.hostState
        )
      : null
    const items =
      selectedCase && !cases.items.some((item) => item.id === selectedCase.id)
        ? [selectedCase, ...cases.items].slice(0, cases.pageSize)
        : cases.items
    return {
      tableKey: 'cases',
      table: {
        key: 'cases',
        items,
        total: cases.total,
        page: cases.page,
        pageSize: cases.pageSize
      },
      selectedCase,
      projection,
      selectedNodeKey: readParameter(query.parameters, 'nodeKey') ?? null,
      runtimeProjectId,
      simulation: this.service.runtimeMode === 'simulation'
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== FACTORY_VIEW_KEY && viewKey !== FACTORY_CASE_WORKSPACE_VIEW_KEY) {
      return failure('Unsupported Factory Operations View.')
    }
    const scope = scopeFromContext(context)
    try {
      if (actionKey === 'create_demo_incident') {
        const input = createDemoIncidentSchema.parse(request.input)
        const result = await this.service.createDemoIncident(scope, input)
        return actionSuccess('M-07 incident loaded', 'M-07 异常已载入', result)
      }
      if (actionKey === 'dispatch_assistant_task') {
        const input = dispatchAssistantTaskSchema.parse(request.input)
        const result = await this.assistantTasks.dispatch(scope, input)
        return {
          success: true,
          message: text('Assistant Task queued', 'Assistant Task 已排队'),
          data: {
            executionRecordId: result.executionRecord.id,
            status: result.executionRecord.status,
            duplicate: result.duplicate
          },
          refresh: true
        }
      }
      if (actionKey === 'cancel_assistant_task') {
        const input = cancelAssistantTaskSchema.parse(request.input)
        const result = await this.assistantTasks.cancel(scope, input.executionRecordId)
        return {
          success: true,
          message: text('Assistant Task cancelled', 'Assistant Task 已取消'),
          data: { executionRecordId: result.id, status: result.status },
          refresh: true
        }
      }
      if (actionKey === 'retry_case_project') {
        const input = retryCaseProjectSchema.parse(request.input)
        const entity = await this.caseProjects.retry(scope, input.caseId)
        return {
          success: true,
          message: text('Case Project synchronized', 'Case Project 已同步'),
          data: {
            caseId: entity.id,
            projectId: entity.workspaceProjectId,
            status: entity.workspaceProjectSyncStatus
          },
          refresh: true
        }
      }
      if (actionKey === 'approve_recovery_plan') {
        const input = approveRecoveryPlanSchema.parse(request.input)
        const result = await this.service.approveRecoveryPlan(scope, input)
        return actionSuccess('Plan B approved', '方案 B 已批准', result)
      }
      if (actionKey === 'reject_recovery_plan') {
        const input = rejectRecoveryPlanSchema.parse(request.input)
        const result = await this.service.rejectRecoveryPlan(scope, input)
        return actionSuccess('Recovery plan rejected', '恢复方案已拒绝', result)
      }
      if (actionKey === 'execute_recovery_plan') {
        const input = executeRecoveryPlanSchema.parse(request.input)
        const result = await this.service.executeRecoveryPlan(scope, input)
        return actionSuccess('Recovery actions confirmed', '恢复动作已确认', result)
      }
      if (actionKey === 'verify_recovery') {
        const input = verifyRecoverySchema.parse(request.input)
        const result = await this.service.verifyRecovery(scope, input)
        return actionSuccess('Production recovery verified', '生产恢复已验证', result)
      }
      return failure(`Unsupported Factory Operations action '${actionKey}'.`)
    } catch (error) {
      return actionFailure(error)
    }
  }
}

function pipelineManifest(slot: string, fixed: boolean): XpertExtensionViewManifest {
  return {
    key: FACTORY_VIEW_KEY,
    title: text('Factory Recovery Pipeline', '多 Agent 异常恢复流水线'),
    description: text(
      'Operate persisted Factory Cases through a server-projected multi-role DAG.',
      '通过服务端投影的多角色 DAG 推进持久化 Factory Case。'
    ),
    icon: FACTORY_ICON,
    hostType: 'agent',
    slot,
    order: 20,
    refreshable: true,
    activation: { requiredFeatures: [FACTORY_WORKBENCH_FEATURE] },
    ...(fixed
      ? {
          workbench: {
            fixed: true,
            menu: {
              enabled: true,
              label: text('Recovery pipeline', '异常恢复流水线'),
              order: 20,
              icon: FACTORY_ICON
            }
          }
        }
      : {}),
    source: {
      provider: FACTORY_VIEW_PROVIDER_KEY,
      plugin: FACTORY_PLUGIN_NAME
    },
    view: remoteView(FACTORY_REMOTE_ENTRY_KEY),
    dataSource: workbenchDataSource(),
    hostEvents: mutationHostEvents('factory-pipeline-tool-completed'),
    clientCommands: commonClientCommands(),
    actions: factoryActions()
  }
}

function workspaceManifest(slot: string): XpertExtensionViewManifest {
  return {
    key: FACTORY_CASE_WORKSPACE_VIEW_KEY,
    title: text('Factory Case Workspace', 'Factory Case 任务工作区'),
    description: text(
      'Inspect one authorized task, its evidence, decisions, and execution attempts.',
      '检查一个授权任务的证据、决策和执行尝试。'
    ),
    icon: FACTORY_ICON,
    hostType: 'agent',
    slot,
    order: 22,
    refreshable: true,
    activation: { requiredFeatures: [FACTORY_WORKBENCH_FEATURE] },
    source: {
      provider: FACTORY_VIEW_PROVIDER_KEY,
      plugin: FACTORY_PLUGIN_NAME
    },
    view: remoteView(FACTORY_CASE_WORKSPACE_REMOTE_ENTRY_KEY),
    dataSource: workbenchDataSource(),
    hostEvents: mutationHostEvents('factory-workspace-tool-completed'),
    clientCommands: commonClientCommands(),
    actions: factoryActions()
  }
}

function dashboardManifest(slot: string, fixed = true): XpertExtensionViewManifest {
  return {
    key: FACTORY_DASHBOARD_VIEW_KEY,
    title: text('Factory Operations Dashboard', '工厂运营管理监控'),
    description: text(
      'Monitor organization-scoped recovery throughput, risk, blockers, and Agent execution health.',
      '监控组织范围内的恢复吞吐、风险、阻塞和 Agent 执行健康度。'
    ),
    icon: FACTORY_ICON,
    hostType: 'agent',
    slot,
    order: 30,
    refreshable: true,
    activation: {
      requiredFeatures: [FACTORY_MANAGEMENT_DASHBOARD_FEATURE]
    },
    ...(fixed
      ? {
          workbench: {
            fixed: true,
            menu: {
              enabled: true,
              label: text('Operations dashboard', '管理监控 Dashboard'),
              order: 30,
              icon: FACTORY_ICON
            }
          }
        }
      : {}),
    source: {
      provider: FACTORY_VIEW_PROVIDER_KEY,
      plugin: FACTORY_PLUGIN_NAME
    },
    view: remoteView(FACTORY_DASHBOARD_REMOTE_ENTRY_KEY),
    dataSource: workbenchDataSource(),
    hostEvents: {
      subscriptions: [
        {
          key: 'factory-dashboard-tool-completed',
          event: 'assistant.tool.completed',
          filter: {
            sources: ['chatkit'],
            toolNames: [...FACTORY_MUTATION_TOOL_NAMES]
          },
          action: { type: 'refresh', debounceMs: 800 }
        }
      ]
    },
    clientCommands: commonClientCommands(),
    actions: [
      {
        key: 'refresh',
        label: text('Refresh', '刷新'),
        icon: 'ri-refresh-line',
        placement: 'toolbar',
        actionType: 'refresh'
      }
    ]
  }
}

function remoteView(entry: string): XpertExtensionViewManifest['view'] {
  return {
    type: 'remote_component',
    runtime: 'react',
    protocolVersion: 1,
    component: { isolation: 'iframe', entry },
    dataSource: { mode: 'platform' }
  }
}

function workbenchDataSource(): XpertExtensionViewManifest['dataSource'] {
  return {
    mode: 'platform',
    querySchema: {
      supportsPagination: true,
      supportsSearch: true,
      supportsSelection: true,
      supportsParameters: true,
      defaultPageSize: 20
    },
    cache: { enabled: false }
  }
}

function mutationHostEvents(key: string): NonNullable<XpertExtensionViewManifest['hostEvents']> {
  return {
    subscriptions: [
      {
        key,
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...FACTORY_MUTATION_TOOL_NAMES]
        },
        action: { type: 'forward', debounceMs: 500 }
      }
    ]
  }
}

function commonClientCommands() {
  return [
    {
      key: WORKBENCH_NAVIGATION_OPEN_COMMAND,
      label: text('Open execution record', '打开执行记录')
    }
  ]
}

function factoryActions(): NonNullable<XpertExtensionViewManifest['actions']> {
  return [
    {
      key: 'refresh',
      label: text('Refresh', '刷新'),
      icon: 'ri-refresh-line',
      placement: 'toolbar',
      actionType: 'refresh'
    },
    {
      key: 'create_demo_incident',
      label: text('Load M-07 incident', '载入 M-07 异常'),
      icon: 'ri-alarm-warning-line',
      placement: 'toolbar',
      actionType: 'invoke'
    },
    {
      key: 'dispatch_assistant_task',
      label: text('Dispatch Assistant Task', '派发 Assistant Task'),
      icon: 'ri-send-plane-line',
      actionType: 'invoke'
    },
    {
      key: 'cancel_assistant_task',
      label: text('Cancel Assistant Task', '取消 Assistant Task'),
      icon: 'ri-stop-circle-line',
      actionType: 'invoke'
    },
    {
      key: 'retry_case_project',
      label: text('Retry Case Project', '重试 Case Project'),
      icon: 'ri-folder-warning-line',
      actionType: 'invoke'
    },
    {
      key: 'approve_recovery_plan',
      label: text('Approve plan B', '批准方案 B'),
      icon: 'ri-checkbox-circle-line',
      actionType: 'invoke'
    },
    {
      key: 'reject_recovery_plan',
      label: text('Reject recovery plan', '拒绝恢复方案'),
      icon: 'ri-close-circle-line',
      actionType: 'invoke'
    },
    {
      key: 'execute_recovery_plan',
      label: text('Execute approved plan', '执行已批准方案'),
      icon: 'ri-play-circle-line',
      actionType: 'invoke'
    },
    {
      key: 'verify_recovery',
      label: text('Verify recovery', '验证恢复'),
      icon: 'ri-shield-check-line',
      actionType: 'invoke'
    }
  ]
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function scopeFromContext(context: XpertResolvedViewHostContext): FactoryScope {
  if (!context.tenantId) throw new Error('Tenant scope is required.')
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: readRuntimeProjectId(context),
    userId: context.userId ?? null,
    assistantId: context.hostType === 'agent' ? context.hostId : null,
    actorType: context.userId ? 'user' : 'system'
  }
}

function readRuntimeProjectId(context: XpertResolvedViewHostContext) {
  const runtimeScope = Reflect.get(context, 'runtimeScope')
  if (!runtimeScope || typeof runtimeScope !== 'object') return null
  const projectId = Reflect.get(runtimeScope, 'projectId')
  return typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null
}

function actionSuccess(
  en_US: string,
  zh_Hans: string,
  result: Awaited<ReturnType<FactoryOperationsService['createDemoIncident']>>
): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans),
    data: {
      caseId: result.receipt.caseId,
      revision: result.receipt.revision,
      status: result.receipt.status,
      nextAction: result.receipt.nextAction
    },
    refresh: true
  }
}

function failure(message: string): XpertViewActionResult {
  return { success: false, message: text(message, message) }
}

function actionFailure(error: unknown): XpertViewActionResult {
  if (error instanceof HttpException) {
    const response = error.getResponse()
    if (typeof response === 'string') return failure(response)
    if (response && typeof response === 'object') {
      const message = Reflect.get(response, 'message')
      const errorCode = Reflect.get(response, 'errorCode')
      const currentRevision = Reflect.get(response, 'currentRevision')
      return {
        success: false,
        message: text(
          typeof message === 'string' ? message : error.message,
          typeof message === 'string' ? message : error.message
        ),
        data: {
          ...(typeof errorCode === 'string' ? { errorCode } : {}),
          ...(typeof currentRevision === 'number' ? { currentRevision } : {})
        }
      }
    }
  }
  return failure(error instanceof Error ? error.message : 'Factory Operations action failed.')
}

function readParameter(parameters: XpertViewQuery['parameters'], key: string) {
  if (!parameters) return undefined
  const value = Reflect.get(parameters, key)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const dispatchAssistantTaskSchema = z.object({
  caseId: z.string().uuid(),
  nodeKey: z.string().trim().min(1).max(100),
  baseRevision: z.number().int().positive(),
  operationId: z.string().trim().min(1).max(128)
})

const cancelAssistantTaskSchema = z.object({
  executionRecordId: z.string().uuid()
})

const retryCaseProjectSchema = z.object({
  caseId: z.string().uuid()
})

function normalizeHtmlLang(locale?: string | null) {
  if (locale === 'zh_Hans' || locale === 'zh-CN') return 'zh-Hans'
  if (locale === 'zh_Hant' || locale === 'zh-TW') return 'zh-Hant'
  return 'en-US'
}

function withPlatformAssistantBindings(
  projection: FactoryPipelineProjection,
  hostState: XpertResolvedViewHostContext['hostState']
): FactoryPipelineProjection {
  const bindings = readExternalAssistantBindings(hostState)
  if (!bindings.length) return projection
  return {
    ...projection,
    lanes: projection.lanes.map((lane) => {
      const binding = bindings.find(
        (item) =>
          item.templateKey === lane.assistant.templateKey &&
          item.primaryAgentKey === lane.assistant.primaryAgentKey
      )
      if (!binding) return lane
      return {
        ...lane,
        assistant: {
          displayName: binding.title,
          name: binding.name,
          avatar: binding.avatar,
          avatarFallback: initials(binding.title),
          status: binding.status,
          templateKey: binding.templateKey,
          primaryAgentKey: binding.primaryAgentKey,
          publishedVersion: binding.publishedVersion
        }
      }
    })
  }
}

type SafeExternalAssistantBinding = {
  title: string
  name: string
  avatar: FactoryPipelineProjection['lanes'][number]['assistant']['avatar']
  templateKey: string
  primaryAgentKey: string
  publishedVersion: string | null
  status: FactoryPipelineProjection['lanes'][number]['assistant']['status']
}

function readExternalAssistantBindings(
  hostState: XpertResolvedViewHostContext['hostState']
): SafeExternalAssistantBinding[] {
  if (!isRecord(hostState)) return []
  const agent = Reflect.get(hostState, 'agent')
  if (!isRecord(agent)) return []
  const values = Reflect.get(agent, 'externalAssistants')
  if (!Array.isArray(values)) return []
  return values.flatMap((value) => {
    if (!isRecord(value)) return []
    const source = Reflect.get(value, 'templateSource')
    const title = readText(value, 'title')
    const name = readText(value, 'name')
    const primaryAgentKey = readText(value, 'primaryAgentKey')
    const templateKey = isRecord(source) ? readText(source, 'templateKey') : null
    const status = readBindingStatus(Reflect.get(value, 'status'))
    if (!title || !name || !primaryAgentKey || !templateKey || !status) return []
    return [
      {
        title,
        name,
        avatar: readAvatar(Reflect.get(value, 'avatar')),
        templateKey,
        primaryAgentKey,
        publishedVersion: readText(value, 'publishedVersion'),
        status
      }
    ]
  })
}

function readAvatar(
  value: unknown
): FactoryPipelineProjection['lanes'][number]['assistant']['avatar'] {
  if (!isRecord(value)) return null
  const emoji = Reflect.get(value, 'emoji')
  return {
    url: readText(value, 'url'),
    background: readText(value, 'background'),
    emoji: isRecord(emoji)
      ? {
          id: readText(emoji, 'id'),
          set: readText(emoji, 'set'),
          colons: readText(emoji, 'colons'),
          unified: readText(emoji, 'unified')
        }
      : null,
    useNotoColor: Reflect.get(value, 'useNotoColor') === true
  }
}

function readBindingStatus(
  value: unknown
): FactoryPipelineProjection['lanes'][number]['assistant']['status'] | null {
  return value === 'available' ||
    value === 'incompatible' ||
    value === 'unpublished' ||
    value === 'cross_organization'
    ? value
    : null
}

function readText(value: Record<string, unknown>, key: string) {
  const item = Reflect.get(value, key)
  return typeof item === 'string' && item.trim() ? item.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function initials(value: string) {
  return Array.from(value.trim()).slice(0, 2).join('').toUpperCase()
}
