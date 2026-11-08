import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
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
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  WEEKLY_RADAR_FEATURE,
  WEEKLY_RADAR_ICON,
  WEEKLY_RADAR_PLUGIN_NAME,
  WEEKLY_RADAR_PROVIDER_KEY,
  WEEKLY_RADAR_REMOTE_ENTRY_KEY,
  WEEKLY_RADAR_TOOL_NAME_LIST,
  WEEKLY_RADAR_VIEW_KEY
} from './constants'
import type { WeeklyRadarEntryStatus, WeeklyRadarScope } from './types'
import { WeeklyRadarService } from './weekly-radar.service'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const WEEKLY_RADAR_VIEW_ICON = {
  type: 'svg',
  value: WEEKLY_RADAR_ICON,
  alt: 'Weekly Radar'
} satisfies IconDefinition

const createEntryInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', title: text('Title', '标题') },
    status: { type: 'string', title: text('Status', '状态') },
    owner: { type: 'string', title: text('Owner', '负责人') },
    dueDate: { type: 'string', title: text('Due date', '截止日期') },
    weekKey: { type: 'string', title: text('Week', '周次') },
    evidenceRef: { type: 'string', title: text('Evidence', '证据来源') },
    note: { type: 'string', title: text('Note', '备注') },
    operationId: { type: 'string', title: text('Operation id', '幂等键') }
  },
  required: ['title']
} satisfies JsonSchemaObjectType

const updateEntryInputSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', title: text('Status', '状态') },
    owner: { type: 'string', title: text('Owner', '负责人') },
    dueDate: { type: 'string', title: text('Due date', '截止日期') },
    note: { type: 'string', title: text('Note', '备注') }
  },
  required: []
} satisfies JsonSchemaObjectType

const weekInputSchema = {
  type: 'object',
  properties: {
    weekKey: { type: 'string', title: text('Week', '周次') }
  },
  required: ['weekKey']
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(WEEKLY_RADAR_PROVIDER_KEY)
export class WeeklyRadarViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: WeeklyRadarService) {}

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
        key: WEEKLY_RADAR_VIEW_KEY,
        title: text('Weekly Radar', '周报风险雷达'),
        description: text(
          'Capture work entries, scan unclosed-state risks with reproducible rules, and review the weekly report.',
          '沉淀工作条目，用可复算规则扫描未闭环风险，并复核周报。'
        ),
        icon: WEEKLY_RADAR_VIEW_ICON,
        hostType: 'agent',
        slot,
        order: fixed ? 32 : 27,
        refreshable: true,
        activation: {
          requiredFeatures: [WEEKLY_RADAR_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Weekly Radar', '周报风险雷达'),
                  order: 32,
                  icon: WEEKLY_RADAR_VIEW_ICON
                }
              }
            }
          : {}),
        source: {
          provider: WEEKLY_RADAR_PROVIDER_KEY,
          plugin: WEEKLY_RADAR_PLUGIN_NAME
        },
        parameters: [
          {
            key: 'weekKey',
            label: text('Week', '周次'),
            type: 'string'
          }
        ],
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: WEEKLY_RADAR_REMOTE_ENTRY_KEY
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
            supportsSort: false,
            supportsSelection: true,
            supportsParameters: true,
            defaultPageSize: 25
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'weekly-radar-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...WEEKLY_RADAR_TOOL_NAME_LIST]
              },
              action: {
                type: 'forward',
                debounceMs: 800
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
            key: 'create_entry',
            label: text('Add entry', '新增条目'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: createEntryInputSchema
          },
          {
            key: 'update_entry',
            label: text('Update entry', '更新条目'),
            icon: 'ri-save-3-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: updateEntryInputSchema
          },
          {
            key: 'generate_weekly',
            label: text('Generate report', '生成周报'),
            icon: 'ri-file-list-3-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: weekInputSchema
          },
          {
            key: 'confirm_weekly',
            label: text('Confirm report', '确认归档周报'),
            icon: 'ri-shield-check-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: weekInputSchema
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
    if (viewKey !== WEEKLY_RADAR_VIEW_KEY || component.entry !== WEEKLY_RADAR_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Weekly Radar component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appPath = join(__dirname, 'remote-components', WEEKLY_RADAR_REMOTE_ENTRY_KEY, 'app.js')
    const appScript = await readFile(appPath, 'utf8')
    const appCss = await readFile(join(__dirname, 'remote-components', WEEKLY_RADAR_REMOTE_ENTRY_KEY, 'app.css'), 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Weekly Radar',
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
    if (viewKey !== WEEKLY_RADAR_VIEW_KEY) {
      return {}
    }
    const scope = scopeFromContext(context)
    const weekKey = getStringParameter(query.parameters, 'weekKey')
    const scan = await this.service.scanRisks(scope, weekKey)
    const entries = await this.service.listEntries(scope, {
      weekKey: scan.weekKey,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
    const weekly = await this.service.getWeekly(scope, scan.weekKey)
    const weeklies = await this.service.listWeeklies(scope, 12)
    return {
      items: entries.items,
      total: entries.total,
      summary: {
        weekKey: scan.weekKey,
        metrics: scan.metrics,
        risks: scan.risks,
        weekly,
        weeklies
      }
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== WEEKLY_RADAR_VIEW_KEY) {
        return failure('Unsupported Weekly Radar action', '不支持的周报风险雷达操作')
      }
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Weekly Radar refreshed', '周报风险雷达已刷新')
      }
      if (actionKey === 'create_entry') {
        const title = getStringInput(request.input, 'title')
        if (!title) {
          return failure('Title is required', '缺少标题')
        }
        const entry = await this.service.upsertEntry(scope, {
          operationId: getStringInput(request.input, 'operationId') ?? `workbench:${Date.now()}`,
          weekKey: getStringInput(request.input, 'weekKey'),
          title,
          status: (getStringInput(request.input, 'status') as WeeklyRadarEntryStatus) ?? 'planned',
          owner: getStringInput(request.input, 'owner') ?? null,
          dueDate: getStringInput(request.input, 'dueDate') ?? null,
          evidenceRef: getStringInput(request.input, 'evidenceRef') ?? null,
          note: getStringInput(request.input, 'note') ?? null
        })
        return {
          success: true,
          message: text('Work entry created', '工作条目已创建'),
          refresh: true,
          data: entry
        }
      }
      if (actionKey === 'update_entry') {
        const entryId = request.targetId ?? getStringInput(request.input, 'entryId')
        if (!entryId) {
          return failure('Entry id is required', '缺少条目 id')
        }
        const entry = await this.service.upsertEntry(scope, {
          operationId: `workbench-update:${entryId}:${Date.now()}`,
          entryId,
          status: (getStringInput(request.input, 'status') as WeeklyRadarEntryStatus) ?? undefined,
          owner: getStringInput(request.input, 'owner'),
          dueDate: getStringInput(request.input, 'dueDate'),
          note: getStringInput(request.input, 'note')
        })
        return {
          success: true,
          message: text('Work entry updated', '工作条目已更新'),
          refresh: true,
          data: entry
        }
      }
      if (actionKey === 'generate_weekly') {
        const weekKey = getStringInput(request.input, 'weekKey')
        if (!weekKey) {
          return failure('Week key is required', '缺少周次')
        }
        const weekly = await this.service.generateWeekly(scope, { weekKey })
        return {
          success: true,
          message: text('Weekly report draft generated', '周报草稿已生成'),
          refresh: true,
          data: weekly
        }
      }
      if (actionKey === 'confirm_weekly') {
        const weekKey = getStringInput(request.input, 'weekKey')
        if (!weekKey) {
          return failure('Week key is required', '缺少周次')
        }
        const weekly = await this.service.confirmWeekly(scope, weekKey)
        return {
          success: true,
          message: text('Weekly report confirmed', '周报已确认归档'),
          refresh: true,
          data: weekly
        }
      }
      return failure('Unsupported Weekly Radar action', '不支持的周报风险雷达操作')
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Weekly Radar action failed'
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): WeeklyRadarScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
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

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
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
