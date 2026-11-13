import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  LISTING_ASSISTANT_FEATURE,
  LISTING_ASSISTANT_PLUGIN_NAME,
  LISTING_ASSISTANT_PROVIDER_KEY,
  LISTING_ASSISTANT_REMOTE_ENTRY_KEY,
  LISTING_ASSISTANT_VIEW_KEY
} from './constants.js'
import { ListingAssistantService } from './listing-assistant.service.js'
import { ListingError, type ListingDraftInput, type ListingScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const TOOL_NAMES = ['listing_create_task', 'listing_parse_task', 'listing_save_draft']

@Injectable()
@ViewExtensionProvider(LISTING_ASSISTANT_PROVIDER_KEY)
export class ListingAssistantViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ListingAssistantService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!isSupportedSlot(context, slot)) {
      return []
    }

    const isAgentFixedWorkbench = slot === AGENT_WORKBENCH_FIXED_SLOT

    return [
      {
        key: LISTING_ASSISTANT_VIEW_KEY,
        title: text('Bulk Listing Workbench', '批量上架工作台'),
        description: text(
          'Paste supplier copy, run AI extraction, review the structured draft, and save it.',
          '粘贴供货文案，执行 AI 抽取，人工核对结构化草稿后保存上架信息。'
        ),
        icon: {
          type: 'font',
          value: 'ri-file-list-3-line'
        },
        hostType: context.hostType,
        slot,
        order: 40,
        refreshable: true,
        activation: {
          requiredFeatures: [LISTING_ASSISTANT_FEATURE]
        },
        workbench: isAgentFixedWorkbench
          ? {
              fixed: true,
              menu: {
                enabled: true,
                label: text('Bulk Listing', '批量上架'),
                order: 40
              }
            }
          : undefined,
        source: {
          provider: LISTING_ASSISTANT_PROVIDER_KEY,
          plugin: LISTING_ASSISTANT_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: LISTING_ASSISTANT_REMOTE_ENTRY_KEY
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
            supportsParameters: true,
            defaultPageSize: 50
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'listing-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: TOOL_NAMES
              },
              action: {
                type: 'refresh-and-forward',
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
            key: 'create_task',
            label: text('New Task', '新建任务'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'create_task_batch',
            label: text('Create Batch', '批量创建'),
            icon: 'ri-file-copy-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'parse_task',
            label: text('Run AI Extraction', 'AI 解析'),
            icon: 'ri-sparkling-2-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'retry_parse',
            label: text('Retry', '重试'),
            icon: 'ri-restart-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'save_draft',
            label: text('Save Draft', '保存草稿'),
            icon: 'ri-save-3-line',
            placement: 'toolbar',
            actionType: 'invoke'
          }
        ]
      } as XpertExtensionViewManifest
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (!isListingViewKey(viewKey) || component.entry !== LISTING_ASSISTANT_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(
      join(__dirname, 'remote-components', LISTING_ASSISTANT_REMOTE_ENTRY_KEY, 'app.js'),
      'utf8'
    )
    const appCss = await readOptionalFile(
      join(__dirname, 'remote-components', LISTING_ASSISTANT_REMOTE_ENTRY_KEY, 'app.css')
    )
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Bulk Listing Workbench',
        lang: 'zh-Hans',
        reactUmd: react,
        reactDomUmd: reactDom,
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
    if (!isListingViewKey(viewKey)) {
      return {}
    }

    const data = await this.service.getWorkbenchData(scopeFromContext(context), {
      taskId: getStringParameter(query.parameters, 'taskId') ?? query.selectionId,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })

    return {
      items: data.tasks,
      item: data.selectedTask ?? undefined,
      total: data.tasks.length
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (!isListingViewKey(viewKey)) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context, getStringInput(request.input, 'xpertId'))

      if (actionKey === 'refresh') {
        return success('Listing workbench refreshed', '上架工作台已刷新')
      }

      if (actionKey === 'create_task') {
        const detail = await this.service.createTask(scope, {
          sourceText: requireSourceText(request)
        })
        return {
          ...success('Listing task created', '上架任务已创建'),
          data: { taskId: detail.id }
        }
      }

      if (actionKey === 'create_task_batch') {
        const result = await this.service.createTasksBatch(scope, {
          sourceText: requireSourceText(request)
        })
        return {
          ...success(`Listing batch created (${result.count})`, `已创建 ${result.count} 条上架任务`),
          data: { taskIds: result.taskIds, count: result.count }
        }
      }

      if (actionKey === 'parse_task' || actionKey === 'retry_parse') {
        const taskId = requireTaskId(request)
        const parse = actionKey === 'retry_parse' ? this.service.retryParse.bind(this.service) : this.service.parseTask.bind(this.service)
        try {
          const result = await parse(scope, taskId)
          return {
            ...success(
              result.outcome === 'already_parsed' ? 'Task already has a draft' : 'AI extraction completed',
              result.outcome === 'already_parsed' ? '该任务已有解析结果，未重复调用 AI' : 'AI 解析完成'
            ),
            data: { outcome: result.outcome, taskId }
          }
        } catch (error) {
          return {
            success: false,
            message: text('AI extraction failed. Retry on the same task.', 'AI 解析失败，可在同一任务内重试。'),
            refresh: true,
            data: { taskId, errorMessage: getActionErrorMessage(error), errorCode: (error as { code?: string }).code ?? 'AI_CALL_FAILED' }
          }
        }
      }

      if (actionKey === 'save_draft') {
        const taskId = requireTaskId(request)
        const detail = await this.service.saveDraft(scope, taskId, readDraftInput(request))
        return {
          ...success('Listing draft saved', '上架草稿已保存'),
          data: { taskId: detail.id }
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      return {
        success: false,
        message: text('Action failed.', '操作失败。'),
        refresh: true,
        data: {
          errorCode: error instanceof ListingError ? error.code : 'UNKNOWN',
          errorMessage: getActionErrorMessage(error, 'Action failed.')
        }
      }
    }
  }
}

function isListingViewKey(viewKey: string) {
  return (
    viewKey === LISTING_ASSISTANT_VIEW_KEY ||
    viewKey === `${LISTING_ASSISTANT_PROVIDER_KEY}__${LISTING_ASSISTANT_VIEW_KEY}`
  )
}

function isSupportedSlot(context: XpertResolvedViewHostContext, slot: string) {
  return context.hostType === 'agent' && (slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT)
}

function scopeFromContext(context: XpertResolvedViewHostContext, xpertId?: string): ListingScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    userId: context.userId,
    xpertId: xpertId ?? (context.hostType === 'agent' ? context.hostId : null)
  }
}

function requireTaskId(request: XpertViewActionRequest) {
  const taskId =
    getStringInput(request.input, 'taskId') ??
    getStringParameter(request.parameters, 'taskId') ??
    normalizeOptionalString(request.targetId)
  if (!taskId) throw new Error('请先选择一个上架任务。')
  return taskId
}

function readDraftInput(request: XpertViewActionRequest): ListingDraftInput {
  const attributes = request.input?.attributes
  const specs = request.input?.specs
  return {
    title: getStringInput(request.input, 'title'),
    description: getStringInput(request.input, 'description'),
    price: getStringInput(request.input, 'price'),
    currency: getStringInput(request.input, 'currency'),
    category: getStringInput(request.input, 'category'),
    attributes: attributes && typeof attributes === 'object' ? (attributes as ListingDraftInput['attributes']) : undefined,
    specs: Array.isArray(specs) ? (specs as ListingDraftInput['specs']) : undefined
  }
}

function requireSourceText(request: XpertViewActionRequest) {
  const value = getStringInput(request.input, 'sourceText')
  if (!value) throw new ListingError('SOURCE_REQUIRED', 'Supplier copy is required.')
  return value
}

function getStringInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getStringParameter(parameters: Record<string, unknown> | undefined, key: string) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function getActionErrorMessage(error: unknown, fallback = '操作失败，请重试。') {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
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

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

async function readOptionalFile(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}
