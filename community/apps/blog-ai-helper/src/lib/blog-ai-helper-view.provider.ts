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
  BLOG_AI_HELPER_FEATURE,
  BLOG_AI_HELPER_ICON,
  BLOG_AI_HELPER_MIDDLEWARE_NAME,
  BLOG_AI_HELPER_PLUGIN_NAME,
  BLOG_AI_HELPER_PROVIDER_KEY,
  BLOG_AI_HELPER_REMOTE_ENTRY_KEY,
  BLOG_AI_HELPER_VIEW_KEY
} from './constants.js'
import { BlogAiHelperService } from './blog-ai-helper.service.js'
import type { BlogAiHelperScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const TOOL_NAMES = ['blog_save_analysis', 'blog_report_failure']

@Injectable()
@ViewExtensionProvider(BLOG_AI_HELPER_PROVIDER_KEY)
export class BlogAiHelperViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: BlogAiHelperService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (context.hostType !== 'agent' || (slot !== AGENT_WORKBENCH_FIXED_SLOT && slot !== AGENT_WORKBENCH_MAIN_SLOT)) {
      return []
    }

    const isAgentFixedWorkbench = slot === AGENT_WORKBENCH_FIXED_SLOT

    return [
      {
        key: BLOG_AI_HELPER_VIEW_KEY,
        title: text('Blog Article AI Helper', '博客文章AI智能助手'),
        description: text(
          'Paste a blog draft, generate an AI summary, tags, and title suggestions, then review and save results.',
          '粘贴文章草稿，AI 生成摘要、标签和标题建议，审核确认后保存，历史记录可查。'
        ),
        icon: {
          type: 'font',
          value: 'ri-quill-pen-line'
        },
        hostType: context.hostType,
        slot,
        order: 30,
        refreshable: true,
        activation: {
          requiredFeatures: [BLOG_AI_HELPER_FEATURE]
        },
        ...(isAgentFixedWorkbench
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Blog Article AI Helper', '博客文章AI智能助手'),
                  order: 30,
                  icon: {
                    type: 'svg',
                    value: BLOG_AI_HELPER_ICON,
                    alt: 'Blog Article AI Helper'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: BLOG_AI_HELPER_PROVIDER_KEY,
          plugin: BLOG_AI_HELPER_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: BLOG_AI_HELPER_REMOTE_ENTRY_KEY
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
            defaultPageSize: 20
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'blog-ai-helper-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: TOOL_NAMES
              },
              action: {
                type: 'refresh-and-forward',
                debounceMs: 1000
              }
            }
          ]
        },
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'process_article',
            label: text('Process Article with AI', 'AI 智能处理文章'),
            icon: 'ri-sparkling-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'regenerate_article',
            label: text('Regenerate with AI', '重新生成'),
            icon: 'ri-refresh-line',
            actionType: 'invoke'
          },
          {
            key: 'confirm_record',
            label: text('Save Result', '保存结果'),
            icon: 'ri-check-line',
            actionType: 'invoke'
          },
          {
            key: 'delete_record',
            label: text('Delete Record', '删除记录'),
            icon: 'ri-delete-bin-line',
            actionType: 'invoke'
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
    if (viewKey !== BLOG_AI_HELPER_VIEW_KEY || component.entry !== BLOG_AI_HELPER_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(
      join(__dirname, 'remote-components', BLOG_AI_HELPER_REMOTE_ENTRY_KEY, 'app.js'),
      'utf8'
    )
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Blog Article AI Helper',
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
    if (viewKey !== BLOG_AI_HELPER_VIEW_KEY) {
      return {}
    }

    return this.service.getWorkbenchData(scopeFromContext(context), {
      recordId: getStringParameter(query.parameters, 'recordId') ?? query.selectionId,
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
    if (viewKey !== BLOG_AI_HELPER_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('View refreshed', '视图已刷新')
      }

      if (actionKey === 'process_article') {
        const recordId = getStringInput(request.input, 'recordId')
        const content = getStringInput(request.input, 'content')
        if (!content) {
          throw new Error('文章内容不能为空，请先粘贴文章草稿。')
        }

        const xpertId = context.hostType === 'agent' ? context.hostId : undefined
        let record
        let command

        if (recordId) {
          command = await this.service.prepareProcessChatMessage(scope, recordId)
          record = await this.service.getWorkbenchData(scope, { recordId })
        } else {
          record = await this.service.createArticleRecord(scope, {
            content,
            title: getStringInput(request.input, 'title'),
            xpertId,
            agentKey: getStringInput(request.input, 'agentKey')
          })
          command = await this.service.prepareProcessChatMessage(scope, record.id)
        }

        return {
          ...success('Article processing started', '文章处理已启动，AI 正在生成摘要、标签和标题建议。'),
          data: {
            recordId: record.id,
            commandKey: command.commandKey,
            payload: command.payload
          },
          refresh: false
        }
      }

      if (actionKey === 'regenerate_article') {
        const recordId = requireRecordId(request)
        const command = await this.service.prepareProcessChatMessage(scope, recordId)
        return {
          ...success('Regeneration started', '已重新生成，AI 正在重新分析文章。'),
          data: {
            recordId,
            commandKey: command.commandKey,
            payload: command.payload
          },
          refresh: false
        }
      }

      if (actionKey === 'confirm_record') {
        const recordId = requireRecordId(request)
        const result = await this.service.confirmRecord(scope, recordId)
        return {
          ...success('Result saved', '结果已保存，可在历史记录中查看。'),
          data: result
        }
      }

      if (actionKey === 'delete_record') {
        const recordId = requireRecordId(request)
        const result = await this.service.deleteRecord(scope, recordId)
        return {
          ...success('Record deleted', '记录已删除。'),
          data: result
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Action failed')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function scopeFromContext(context: XpertResolvedViewHostContext): BlogAiHelperScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.runtimeScope?.projectId ?? null,
    userId: context.userId
  }
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

function requireRecordId(request: XpertViewActionRequest) {
  return (
    getStringInput(request.input, 'recordId') ??
    getStringParameter(request.parameters, 'recordId') ??
    requireString(request.targetId, '文章处理记录 id 缺失。')
  )
}

function requireString(value: string | undefined, message: string) {
  const normalized = value?.trim()
  if (!normalized) {
    throw new Error(message)
  }
  return normalized
}

function getStringInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getStringParameter(
  parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'] | undefined,
  key: string
) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
