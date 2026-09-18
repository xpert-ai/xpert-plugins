import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod/v3'
import type {
  XpertExtensionViewManifest,
  XpertResolvedViewHostContext,
  XpertViewQuery,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertRemoteComponentViewSchema,
  XpertRemoteComponentEntry,
} from '@xpert-ai/contracts'
import {
  ViewExtensionProvider,
  renderRemoteReactIframeHtml,
  type IXpertViewExtensionProvider,
  type XpertViewFileActionFile,
} from '@xpert-ai/plugin-sdk'
import { StudioJobs } from './jobs.js'
import { StudioService, safeError } from './studio.service.js'
import {
  artifactSchema,
  changeSchema,
  objectSchema,
  querySchema,
  targetSchema,
  policySchema,
  valueSchema,
  type StudioScope,
} from './types.js'
import {
  ENTRY,
  FEATURES,
  ICON,
  PLUGIN,
  PROVIDER,
  VIEW,
  READ_TOOLS,
  CHANGE_TOOLS,
  TRANSFER_TOOLS,
  text,
} from './constants.js'
import { parseImport } from './transfer.js'
const require = createRequire(import.meta.url),
  moduleDir = dirname(fileURLToPath(import.meta.url))
const id = z.object({ id: z.string().uuid() }).strict()
const targetObject = z.object({ target: targetSchema, object: objectSchema }).strict()
export function viewScope(context: XpertResolvedViewHostContext): StudioScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? '',
    workspaceId: context.workspaceId ?? '',
    userId: context.userId,
    xpertId: context.hostId,
  }
}
function requireFeature(context: XpertResolvedViewHostContext, feature: string) {
  if (!context.capabilities?.features?.includes(feature)) throw new Error('feature_not_enabled')
}
@Injectable()
@ViewExtensionProvider(PROVIDER)
export class StudioViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: StudioService, private readonly jobs: StudioJobs) {}
  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    const actions = [
      'run_query',
      'explain',
      'cancel',
      'save_artifact',
      'snapshot',
      'export_result',
      'propose_change',
      'row_update',
      'set_policy',
      'transaction',
    ].map((key) => ({ key, label: text(key, key), actionType: 'invoke' as const }))
    return [
      {
        key: VIEW,
        title: text('DB Studio', 'DB Studio 数据库工作台'),
        icon: { type: 'svg', value: ICON },
        hostType: 'agent',
        slot,
        order: 45,
        refreshable: true,
        activation: { requiredFeatures: [FEATURES.explore] },
        source: { provider: PROVIDER, plugin: PLUGIN },
        workbench: slot.endsWith('fixed')
          ? {
              fixed: true,
              menu: {
                enabled: true,
                label: text('DB Studio', 'DB Studio'),
                order: 45,
                icon: { type: 'svg', value: ICON },
              },
            }
          : undefined,
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
            supportsSearch: true,
            supportsParameters: true,
            defaultPageSize: 100,
          },
          cache: { enabled: false },
        },
        clientCommands: [
          { key: 'assistant.context.set', label: text('Select database context', '选择数据库上下文') },
          { key: 'assistant.chat.send_message', label: text('Ask Agent', '询问智能体') },
          { key: 'db-studio.connections.manage', label: text('Manage connections', '管理连接') },
        ],
        hostEvents: {
          subscriptions: [
            {
              key: 'db-studio-tools',
              event: 'assistant.tool.completed',
              filter: { sources: ['chatkit'], toolNames: [...READ_TOOLS, ...CHANGE_TOOLS, ...TRANSFER_TOOLS] },
              action: { type: 'forward', debounceMs: 200 },
            },
          ],
        },
        actions: [
          ...actions,
          { key: 'import_file', label: text('Import file', '导入文件'), actionType: 'invoke', transport: 'file' },
        ],
      },
    ]
  }
  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== VIEW || component.entry !== ENTRY) throw new Error('view_not_found')
    const readPackage = (pkg: string, path: string) =>
      readFile(join(dirname(require.resolve(`${pkg}/package.json`)), path), 'utf8')
    const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
      readFile(join(moduleDir, 'remote', 'app.js'), 'utf8'),
      readFile(join(moduleDir, 'remote', 'app.css'), 'utf8'),
      readPackage('react', 'umd/react.production.min.js'),
      readPackage('react-dom', 'umd/react-dom.production.min.js'),
    ])
    return {
      html: renderRemoteReactIframeHtml({
        title: 'DB Studio',
        lang: 'zh-Hans',
        appScript,
        appCss,
        reactUmd,
        reactDomUmd,
      }),
      contentType: 'text/html; charset=utf-8',
    }
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery) {
    if (viewKey !== VIEW) throw new Error('view_not_found')
    requireFeature(context, FEATURES.explore)
    const scope = await this.service.scope(viewScope(context)),
      kind = query.parameters?.kind ?? 'bootstrap',
      input = typeof query.parameters?.input === 'string' ? JSON.parse(query.parameters.input) : {}
    if (kind === 'bootstrap')
      return {
        summary: {
          ...(await this.service.connections(scope)),
          features: context.capabilities?.features ?? [],
          drafts: await this.service.list(scope, 'draft'),
        },
      }
    if (kind === 'capabilities' || kind === 'locations' || kind === 'objects') {
      const target = targetSchema.parse(input)
      return { item: await this.service.inspect(scope, target, kind, undefined, query.page, query.search) }
    }
    if (kind === 'describe') {
      const { target, object } = targetObject.parse(input)
      return { item: await this.service.inspect(scope, target, 'describe', object) }
    }
    if (kind === 'record') return { item: await this.service.record(scope, id.parse(input).id) }
    if (kind === 'policy') return { item: await this.service.policy(scope, targetSchema.parse(input).dataSourceId) }
    if (kind === 'result') {
      const parsed = z
        .object({
          id: z.string().uuid(),
          offset: z.number().int().min(0).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .strict()
        .parse(input)
      return { item: await this.service.page(scope, parsed.id, parsed.offset, parsed.limit) }
    }
    const recordKind = z
      .enum(['favorite', 'chart', 'dashboard', 'snapshot', 'execution', 'plan', 'transfer'])
      .parse(kind)
    return this.service.listPage(scope, recordKind, query.page)
  }
  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== VIEW) throw new Error('view_not_found')
      requireFeature(context, FEATURES.explore)
      const scope = await this.service.scope(viewScope(context)),
        input = request.input ?? {}
      let data: unknown
      if (
        ['propose_change', 'approve_plan', 'execute_plan', 'row_update', 'set_policy', 'transaction'].includes(
          actionKey
        )
      )
        requireFeature(context, FEATURES.changes)
      if (actionKey === 'run_query' || actionKey === 'explain')
        data = await this.service.read(scope, querySchema.parse(input), actionKey === 'explain')
      else if (actionKey === 'cancel') data = await this.service.cancel(scope, id.parse(input).id)
      else if (actionKey === 'save_artifact') data = await this.service.saveArtifact(scope, artifactSchema.parse(input))
      else if (actionKey === 'snapshot') {
        const parsed = z
          .object({ target: targetSchema, title: z.string().min(1).max(200) })
          .strict()
          .parse(input)
        data = await this.jobs.snapshot(scope, parsed.target, parsed.title)
      } else if (actionKey === 'propose_change') data = await this.service.propose(scope, changeSchema.parse(input))
      else if (actionKey === 'approve_plan' || actionKey === 'execute_plan') {
        throw new Error('plan_review_in_chat_required')
      } else if (actionKey === 'transaction') {
        const parsed = z
          .object({ target: targetSchema, action: z.enum(['begin', 'commit', 'rollback']) })
          .strict()
          .parse(input)
        data = await this.service.transaction(scope, parsed.target, parsed.action)
      } else if (actionKey === 'set_policy') data = await this.service.setPolicy(scope, policySchema.parse(input))
      else if (actionKey === 'row_update') {
        const parsed = z
          .object({
            executionId: z.string().uuid(),
            object: objectSchema,
            rowIndex: z.number().int().min(0).max(999),
            columnIndex: z.number().int().min(0).max(999),
            value: valueSchema,
            operationId: z.string().uuid(),
          })
          .strict()
          .parse(input)
        data = await this.service.editResultRow(
          scope,
          parsed.executionId,
          parsed.object,
          parsed.rowIndex,
          parsed.columnIndex,
          parsed.value,
          parsed.operationId
        )
      } else if (actionKey === 'export_result') {
        requireFeature(context, FEATURES.transfer)
        const parsed = id
          .extend({ format: z.enum(['csv', 'json']) })
          .strict()
          .parse(input)
        data = await this.service.export(scope, parsed.id, parsed.format)
      } else throw new Error('action_not_found')
      return { success: true, data, refresh: false }
    } catch (error) {
      console.error('[db-studio] view action failed:', actionKey, error)
      return { success: false, message: text(safeError(error), safeError(error)) }
    }
  }
  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== VIEW || actionKey !== 'import_file') throw new Error('file_action_not_found')
      requireFeature(context, FEATURES.transfer)
      if (file.buffer.length > 8 * 1024 * 1024) throw new Error('file_too_large')
      const input = z
        .object({
          target: targetSchema,
          table: z.string().min(1).max(256),
          format: z.enum(['csv', 'json']),
          operationId: z.string().uuid(),
        })
        .strict()
        .parse(request.input)
      return {
        success: true,
        data: await this.service.proposeImport(await this.service.scope(viewScope(context)), {
          ...input.target,
          table: input.table,
          operationId: input.operationId,
          ...parseImport(file.buffer.toString('utf8'), input.format),
        }),
      }
    } catch (error) {
      return { success: false, message: text(safeError(error), safeError(error)) }
    }
  }
}
