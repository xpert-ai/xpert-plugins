import { Injectable, HttpException, ForbiddenException } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type XpertExtensionViewManifest,
  type XpertResolvedViewHostContext,
  type XpertViewQuery,
  type XpertViewActionRequest,
  type XpertViewActionResult,
  type XpertRemoteComponentViewSchema,
  type XpertViewDataResult,
} from '@xpert-ai/contracts'
import {
  ViewExtensionProvider,
  renderRemoteReactIframeHtml,
  type IXpertViewExtensionProvider,
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  APP_ICON,
  PLUGIN_NAME,
  VIEW_KEYS,
  artifactKey,
} from '../artifact-namespace.js'
import { ROLES, WORKBENCH_FEATURE, toolName } from '../roles.js'
import { projectFlow } from '../flow-projector.js'
import type { WorkbenchData, Surface } from '../contracts.js'
import { MaterialCaseService } from './case.service.js'
import { MaterialTaskService } from './task.service.js'
import { viewScope } from './scope.js'
import { actionSchema } from './schemas.js'
const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed',
  AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
const PROVIDER = artifactKey('views'),
  ENTRY = 'governance-workbench'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const moduleDir = dirname(fileURLToPath(import.meta.url)),
  requireHere = createRequire(import.meta.url)
const selectionSchema = z.string().uuid()
const isCoordinatorHost = (context: XpertResolvedViewHostContext) =>
  z.object({ agent: z.object({ key: z.literal('Agent_coordinator') }) }).safeParse(context.hostSnapshot).success
const actions = [
  'create_case',
  'coordinate_next',
  'run_node',
  'decide_proposal',
  'retry_project',
] as const
const titles: Record<Surface, { en_US: string; zh_Hans: string }> = {
  dashboard: text('Material governance dashboard', '物料治理管理监控'),
  pipeline: text('Material governance pipeline', '多部门治理流水线'),
  workspace: text('Governance case workspace', '证据与治理审批'),
}
const surfaceFor = (key: string) =>
  Object.entries(VIEW_KEYS).find(([, v]) => v === key)?.[0] as
    | Surface
    | undefined
@Injectable()
@ViewExtensionProvider(PROVIDER)
export class MaterialViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly cases: MaterialCaseService,
    private readonly tasks: MaterialTaskService,
  ) {}
  supports(c: XpertResolvedViewHostContext) {
    return c.hostType === 'agent'
  }
  getViewManifests(
    c: XpertResolvedViewHostContext,
    slot: string,
  ): XpertExtensionViewManifest[] {
    if (
      c.hostType !== 'agent' ||
      ![AGENT_WORKBENCH_FIXED_SLOT, AGENT_WORKBENCH_MAIN_SLOT].includes(slot)
    )
      return []
    return (Object.keys(VIEW_KEYS) as Surface[]).map((surface, index) => ({
      key: VIEW_KEYS[surface],
      title: titles[surface],
      description: titles[surface],
      hostType: 'agent',
      slot,
      order: index * 10,
      icon: APP_ICON,
      refreshable: true,
      activation: { requiredFeatures: [WORKBENCH_FEATURE] },
      ...(slot === AGENT_WORKBENCH_FIXED_SLOT && surface !== 'workspace'
        ? {
            workbench: {
              fixed: true,
              menu: {
                enabled: true,
                label: titles[surface],
                order: index * 10,
                icon: APP_ICON,
              },
            },
          }
        : {}),
      source: { provider: PROVIDER, plugin: PLUGIN_NAME },
      view: {
        type: 'remote_component',
        runtime: 'react',
        protocolVersion: 1,
        component: { isolation: 'iframe', entry: ENTRY },
        dataSource: { mode: 'platform' },
      },
      dataSource: {
        mode: 'platform',
        querySchema: {
          supportsPagination: true,
          supportsSelection: true,
          supportsSearch: true,
          supportsParameters: true,
          defaultPageSize: 20,
        },
        cache: { enabled: false },
      },
      clientCommands: [
        {
          key: WORKBENCH_NAVIGATION_OPEN_COMMAND,
          label: text('Open case or execution', '打开案例或执行规划'),
        },
      ],
      hostEvents: {
        subscriptions: [
          {
            key: artifactKey('tool_completed'),
            event: 'assistant.tool.completed',
            filter: {
              sources: ['chatkit'],
              toolNames: ROLES.flatMap((r) => r.nodeKeys.map(toolName)).concat(
                'material_identity_dispatch_next',
              ),
            },
            action: { type: 'forward', debounceMs: 400 },
          },
        ],
      },
      actions: actions.map((key) => ({
        key,
        label: text(
          key,
          {
            create_case: '创建案例',
            coordinate_next: '协调治理',
            run_node: '执行角色任务',
            decide_proposal: '提交审批',
            retry_project: '重试项目同步',
          }[key],
        ),
        actionType: 'invoke',
      })),
    }))
  }
  async getRemoteComponentEntry(
    c: XpertResolvedViewHostContext,
    key: string,
    component: XpertRemoteComponentViewSchema['component'],
  ) {
    if (!surfaceFor(key) || component.entry !== ENTRY)
      throw new Error('unsupported_component')
    const readPackage = (name: string, file: string) =>
      readFile(
        join(dirname(requireHere.resolve(`${name}/package.json`)), file),
        'utf8',
      )
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(
        join(moduleDir, '..', 'remote-components', ENTRY, 'app.js'),
        'utf8',
      ),
      readFile(
        join(moduleDir, '..', 'remote-components', ENTRY, 'app.css'),
        'utf8',
      ),
      readPackage('react', 'umd/react.production.min.js'),
      readPackage('react-dom', 'umd/react-dom.production.min.js'),
    ])
    return {
      contentType: 'text/html; charset=utf-8' as const,
      html: renderRemoteReactIframeHtml({
        title: 'Material Identity Governance',
        lang: c.locale?.startsWith('zh') ? 'zh-Hans' : 'en-US',
        appScript,
        appCss,
        reactUmd,
        reactDomUmd,
      }),
    }
  }
  async getViewData(
    c: XpertResolvedViewHostContext,
    key: string,
    query: XpertViewQuery,
  ): Promise<WorkbenchData & XpertViewDataResult> {
    const surface = surfaceFor(key)
    if (!surface) throw new Error('unsupported_view')
    const s = viewScope(c),
      table = await this.cases.list(s, query),
      selectedId = query.selectionId
        ? selectionSchema.parse(query.selectionId)
        : table.items[0]?.id
    const e = selectedId ? await this.cases.requireCase(s, selectedId) : null
    const records = e ? await this.cases.records(s, e.id) : []
    const profiles = e ? await this.cases.profiles(s, e.coordinatorId) : {}
    let canManage = false
    if (e) {
      try {
        await this.cases.assertManage(s, e)
        canManage = true
      } catch {
        /* Readable project members remain read-only. */
      }
    }
    return {
      surface,
      table,
      selectedCase: e?.snapshot ?? null,
      flow: e ? projectFlow(e.snapshot, records, profiles) : null,
      dashboard: await this.cases.dashboard(s),
      canManage: e ? canManage : true,
      canApprove: canManage && e?.status === 'review_required',
      canCreate: isCoordinatorHost(c),
      simulation: true,
      projectStatus: e?.projectStatus ?? null,
      coordinatorExecutions: records.filter((r) => r.roleKey === 'coordinator'),
    }
  }
  async executeViewAction(
    c: XpertResolvedViewHostContext,
    key: string,
    actionKey: string,
    request: XpertViewActionRequest,
  ): Promise<XpertViewActionResult> {
    if (!surfaceFor(key))
      return { success: false, message: text('Unsupported view', '视图不支持') }
    try {
      const s = viewScope(c)
      // The UI never chooses tenant, organization, actor or Assistant identities.
      const input = actionSchema.parse({
        ...z.record(z.unknown()).parse(request.input),
        action: actionKey === 'coordinate_next' ? 'coordinate' : actionKey,
      })
      let receipt
      switch (input.action) {
        case 'create_case':
          if (!isCoordinatorHost(c)) throw new ForbiddenException('coordinator_entry_required')
          receipt = await this.cases.create(s, input)
          break
        case 'coordinate':
          receipt = await this.tasks.start(s, input, true)
          break
        case 'run_node':
          receipt = await this.tasks.start(s, input, false)
          break
        case 'decide_proposal':
          receipt = await this.cases.decide(s, input)
          break
        case 'retry_project': {
          const e = await this.cases.ensureProject(s, input.caseId)
          receipt = {
            success: true,
            code: 'project_ready',
            caseId: e.id,
            revision: e.revision,
          }
          break
        }
      }
      return {
        success: true,
        data: receipt,
        message: text('Action completed', '操作已完成'),
        refresh: true,
      }
    } catch (error) {
      const response =
        error instanceof HttpException ? error.getResponse() : null
      const detail = z
        .object({
          errorCode: z.string().optional(),
          message: z.string().optional(),
          currentRevision: z.number().optional(),
          caseId: z.string().optional(),
        })
        .passthrough()
        .safeParse(response)
      const code = detail.success
        ? (detail.data.errorCode ??
          (detail.data.message && /^[a-z][a-z0-9_]+$/.test(detail.data.message)
            ? detail.data.message
            : 'action_rejected'))
        : error instanceof z.ZodError
          ? 'invalid_action'
          : error instanceof Error
            ? error.message
            : 'action_failed'
      const message = detail.success ? (detail.data.message ?? code) : code
      return {
        success: false,
        message: text(message, message),
        data: {
          code,
          ...(detail.success
            ? {
                currentRevision: detail.data.currentRevision,
                caseId: detail.data.caseId,
              }
            : {}),
        },
        refresh: true,
      }
    }
  }
}
