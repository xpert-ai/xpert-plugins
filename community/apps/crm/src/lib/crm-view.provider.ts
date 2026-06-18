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
  CRM_FEATURE,
  CRM_ICON,
  CRM_MIDDLEWARE_TOOL_NAMES,
  CRM_PLUGIN_NAME,
  CRM_PROVIDER_KEY,
  CRM_REMOTE_ENTRY_KEY,
  CRM_WORKBENCH_VIEW_KEY
} from './constants'
import { CrmService } from './crm.service'
import type { CrmScope } from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const CRM_VIEW_ICON = {
  type: 'svg',
  value: CRM_ICON,
  alt: 'CRM'
} satisfies IconDefinition

const createRecordInputSchema = {
  type: 'object',
  properties: {
    objectKey: { type: 'string', title: text('Object', '对象') },
    values: { type: 'object', title: text('Values', '字段值') }
  },
  required: ['objectKey', 'values']
} satisfies JsonSchemaObjectType

const updateRecordInputSchema = {
  type: 'object',
  properties: {
    recordId: { type: 'string', title: text('Record', '记录') },
    objectKey: { type: 'string', title: text('Object', '对象') },
    values: { type: 'object', title: text('Values', '字段值') }
  },
  required: ['recordId', 'values']
} satisfies JsonSchemaObjectType

const updateViewColumnsInputSchema = {
  type: 'object',
  properties: {
    objectKey: { type: 'string', title: text('Object', '对象') },
    viewKey: { type: 'string', title: text('View', '视图') },
    columns: {
      type: 'array',
      title: text('Columns', '列'),
      items: { type: 'string' }
    }
  },
  required: ['objectKey', 'columns']
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(CRM_PROVIDER_KEY)
export class CrmViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: CrmService) {}

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
        key: CRM_WORKBENCH_VIEW_KEY,
        title: text('CRM Workbench', 'CRM 工作台'),
        description: text(
          'Native CRM workspace for objects, records, search, details, creation, and editing.',
          '用于对象、记录、搜索、详情、新建和编辑的原生 CRM 工作台。'
        ),
        icon: CRM_VIEW_ICON,
        hostType: 'agent',
        slot,
        order: fixed ? 30 : 25,
        refreshable: true,
        activation: {
          requiredFeatures: [CRM_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('CRM', 'CRM'),
                  order: 30,
                  icon: CRM_VIEW_ICON
                }
              }
            }
          : {}),
        source: {
          provider: CRM_PROVIDER_KEY,
          plugin: CRM_PLUGIN_NAME
        },
        parameters: [
          {
            key: 'objectKey',
            label: text('Object', '对象'),
            type: 'string'
          },
          {
            key: 'recordId',
            label: text('Record', '记录'),
            type: 'string'
          }
        ],
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: CRM_REMOTE_ENTRY_KEY
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
            supportsSort: true,
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
              key: 'crm-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...CRM_MIDDLEWARE_TOOL_NAMES]
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
            key: 'create_record',
            label: text('Create Record', '新建记录'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: createRecordInputSchema
          },
          {
            key: 'update_record',
            label: text('Save Record', '保存记录'),
            icon: 'ri-save-3-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: updateRecordInputSchema
          },
          {
            key: 'update_view_columns',
            label: text('Update View Columns', '更新视图列'),
            icon: 'ri-layout-column-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: updateViewColumnsInputSchema
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
    if (viewKey !== CRM_WORKBENCH_VIEW_KEY || component.entry !== CRM_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported CRM component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appPath = join(__dirname, 'remote-components', CRM_REMOTE_ENTRY_KEY, 'app.js')
    const appScript = await readFile(appPath, 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'CRM Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
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
    if (viewKey !== CRM_WORKBENCH_VIEW_KEY) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context), {
      objectKey: getStringParameter(query.parameters, 'objectKey'),
      recordId: getStringParameter(query.parameters, 'recordId'),
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== CRM_WORKBENCH_VIEW_KEY) {
        return failure('Unsupported CRM view action', '不支持的 CRM 视图操作')
      }
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('CRM view refreshed', 'CRM 视图已刷新')
      }
      if (actionKey === 'create_record') {
        const objectKey = getStringInput(request.input, 'objectKey')
        if (!objectKey) {
          return failure('Object key is required', '缺少对象 key')
        }
        const values = getRecordValues(request.input)
        const record = await this.service.createRecord(scope, {
          objectKey,
          values,
          source: 'workbench'
        })
        return {
          success: true,
          message: text('CRM record created', 'CRM 记录已创建'),
          refresh: true,
          data: record
        }
      }
      if (actionKey === 'update_record') {
        const recordId = request.targetId ?? getStringInput(request.input, 'recordId')
        if (!recordId) {
          return failure('Record id is required', '缺少记录 id')
        }
        const record = await this.service.updateRecord(scope, {
          recordId,
          objectKey: getStringInput(request.input, 'objectKey'),
          values: getRecordValues(request.input),
          source: 'workbench'
        })
        return {
          success: true,
          message: text('CRM record saved', 'CRM 记录已保存'),
          refresh: true,
          data: record
        }
      }
      if (actionKey === 'update_view_columns') {
        const objectKey = getStringInput(request.input, 'objectKey')
        if (!objectKey) {
          return failure('Object key is required', '缺少对象 key')
        }
        const view = await this.service.updateViewColumns(scope, {
          objectKey,
          viewKey: getStringInput(request.input, 'viewKey'),
          columns: getStringArrayInput(request.input, 'columns')
        })
        return {
          success: true,
          message: text('CRM view columns updated', 'CRM 视图列已更新'),
          refresh: true,
          data: view
        }
      }
      return failure('Unsupported CRM action', '不支持的 CRM 操作')
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'CRM action failed'
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): CrmScope {
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

function getRecordValues(input: Record<string, unknown> | null | undefined) {
  const value = input?.values
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function getStringArrayInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
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
