import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewDataSource,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  ViewExtensionProvider,
  renderRemoteReactIframeHtml
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  CONVERSATION_REVIEW_FEATURE,
  CONVERSATION_REVIEW_PLUGIN_NAME,
  CONVERSATION_REVIEW_PROVIDER_KEY,
  CONVERSATION_REVIEW_REFRESH_TOOL_NAMES,
  CONVERSATION_REVIEW_REMOTE_ENTRY_KEY,
  CONVERSATION_REVIEW_VIEW_KEY,
  IMPORT_MAX_FILE_CHARS
} from './constants'
import { detectImportFormat, parseConversations, parseExcelConversations } from './conversation-import'
import { ConversationReviewService } from './conversation-review.service'
import type {
  ConversationImportFormat,
  ConversationIntentLevel,
  ConversationIssueSeverity,
  ConversationReviewScope,
  ConversationReviewStatus
} from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

const ASSISTANT_CHAT_COMMAND_KEY = 'assistant.chat.send_message'
/**
 * Silent counterpart to `assistant.chat.send_message`: sets context the Assistant can read
 * without it ever rendering as a chat bubble. The remote component uses this to hand the current
 * record's id to the model, so `buildAnalysisMessage` never has to put `recordId` in visible text.
 */
const ASSISTANT_CONTEXT_COMMAND_KEY = 'assistant.context.set'

@Injectable()
@ViewExtensionProvider(CONVERSATION_REVIEW_PROVIDER_KEY)
export class ConversationReviewViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ConversationReviewService) {}

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
        key: CONVERSATION_REVIEW_VIEW_KEY,
        title: text('Conversation Review Workbench', '客户沟通质检与跟进决策工作台'),
        description: text(
          'File a customer conversation, let the assistant produce a structured QC and follow-up analysis, then review, edit and confirm it.',
          '归档一次客户沟通，由助手生成结构化质检与跟进建议，再由销售查看、修改并确认保存。'
        ),
        icon: {
          type: 'font',
          value: 'ri-chat-check-line',
          color: '#1d4ed8'
        },
        hostType: 'agent',
        slot,
        order: 20,
        refreshable: true,
        activation: {
          requiredFeatures: [CONVERSATION_REVIEW_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Conversation Review', '沟通质检'),
                  order: 20,
                  icon: {
                    type: 'font',
                    value: 'ri-chat-check-line',
                    color: '#1d4ed8'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: CONVERSATION_REVIEW_PROVIDER_KEY,
          plugin: CONVERSATION_REVIEW_PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: platformDataSource(),
        parameters: [
          { key: 'recordId', label: text('Record', '业务记录'), type: 'string' },
          { key: 'status', label: text('Status', '状态'), type: 'string' },
          // Dashboard drill-down, e.g. `concern:price`.
          { key: 'issue', label: text('Issue Category', '问题分类'), type: 'string' },
          { key: 'intentLevel', label: text('Intent Level', '意向等级'), type: 'string' }
        ],
        hostEvents: toolCompletedHostEvents(),
        clientCommands: [
          {
            key: ASSISTANT_CHAT_COMMAND_KEY,
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          },
          {
            key: ASSISTANT_CONTEXT_COMMAND_KEY,
            label: text('Set Assistant Context', '设置 Assistant 上下文')
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
            key: 'create_record',
            label: text('File Conversation', '归档沟通记录'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'import_conversations',
            label: text('Import Conversations', '批量导入会话'),
            icon: 'ri-upload-2-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'simulate_fetch_conversations',
            label: text('Fetch Chat Archive (Simulated)', '获取聊天会话记录'),
            icon: 'ri-cloud-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'list_pending_analysis',
            label: text('Pending Analysis', '待分析队列'),
            icon: 'ri-list-check-2',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'start_analysis',
            label: text('Run AI Review', 'AI 质检与分析'),
            icon: 'ri-magic-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'retry_analysis',
            label: text('Retry AI Review', '重试 AI 分析'),
            icon: 'ri-restart-line',
            placement: 'row',
            actionType: 'invoke'
          },
          {
            key: 'mark_analysis_failed',
            label: text('Mark Failed', '标记分析失败'),
            icon: 'ri-error-warning-line',
            placement: 'row',
            actionType: 'invoke'
          },
          {
            key: 'confirm_result',
            label: text('Confirm and Save', '确认并保存'),
            icon: 'ri-check-double-line',
            placement: 'toolbar',
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
    if (viewKey !== CONVERSATION_REVIEW_VIEW_KEY || component.entry !== CONVERSATION_REVIEW_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported conversation review component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appScript = await readFile(
      join(__dirname, 'remote-components', CONVERSATION_REVIEW_REMOTE_ENTRY_KEY, 'app.js'),
      'utf8'
    )
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: '客户沟通质检与跟进决策工作台',
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
    if (viewKey !== CONVERSATION_REVIEW_VIEW_KEY) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context), {
      recordId: getStringParameter(query.parameters, 'recordId'),
      status: getStringParameter(query.parameters, 'status') as ConversationReviewStatus | undefined,
      issue: getStringParameter(query.parameters, 'issue'),
      intentLevel: getStringParameter(query.parameters, 'intentLevel') as ConversationIntentLevel | undefined,
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
      if (viewKey !== CONVERSATION_REVIEW_VIEW_KEY) {
        return failure('Unsupported view', '不支持的视图')
      }
      const scope = scopeFromContext(context)
      const input = request.input ?? {}

      if (actionKey === 'refresh') {
        return success('Workbench refreshed', '工作台已刷新')
      }

      if (actionKey === 'create_record') {
        const record = await this.service.createRecord(scope, {
          customerName: getStringInput(input, 'customerName') as string,
          conversation: getStringInput(input, 'conversation') as string
        })
        return {
          success: true,
          message: text('Conversation filed', '沟通记录已归档'),
          refresh: true,
          data: { recordId: record.id }
        }
      }

      // Batch ingestion. The browser only reads the file into a string (base64 for the binary
      // Excel format, plain text for JSON/CSV); format detection and parsing happen here, where a
      // real WeCom/CRM connector would also live.
      if (actionKey === 'import_conversations') {
        const content = getStringInput(input, 'content') as string
        if (!content || !content.trim()) {
          return failure('Import file is empty', '导入文件是空的')
        }
        if (content.length > IMPORT_MAX_FILE_CHARS) {
          return failure('Import file is too large', `导入文件过大，上限约 ${IMPORT_MAX_FILE_CHARS / 10000} 万字符`)
        }
        const fileName = getStringInput(input, 'fileName')
        const format =
          (getStringInput(input, 'format') as ConversationImportFormat | undefined) ?? detectImportFormat(fileName)
        if (format !== 'json' && format !== 'csv' && format !== 'excel') {
          return failure(
            'Unsupported file type',
            `无法识别文件类型${fileName ? `：${fileName}` : ''}，请使用 .json、.csv 或 .xlsx`
          )
        }

        const parsed =
          format === 'excel' ? parseExcelConversations(Buffer.from(content, 'base64')) : parseConversations(content, format)
        const result = await this.service.importConversations(scope, parsed.rows, `import:${format}`, parsed.skipped)
        return {
          success: true,
          message: text(
            `Imported ${result.imported} conversation(s)`,
            `已导入 ${result.imported} 条${result.duplicates ? `，跳过 ${result.duplicates} 条重复` : ''}${
              result.skipped.length ? `，${result.skipped.length} 条未能导入` : ''
            }`
          ),
          refresh: true,
          data: result
        }
      }

      // Simulated connector fetch — the "auto" counterpart to picking a file by hand. Same service
      // call as the `conversation_review_fetch_conversations` chat tool — see
      // `ConversationReviewService.simulateFetchConversations`.
      if (actionKey === 'simulate_fetch_conversations') {
        const merged = await this.service.simulateFetchConversations(scope)
        return {
          success: true,
          message: text(
            `Simulated fetch imported ${merged.imported} conversation(s)`,
            `模拟拉取完成，已导入 ${merged.imported} 条${merged.duplicates ? `，跳过 ${merged.duplicates} 条重复` : ''}${
              merged.skipped.length ? `，${merged.skipped.length} 条未能导入` : ''
            }`
          ),
          refresh: true,
          data: merged
        }
      }

      if (actionKey === 'list_pending_analysis') {
        const pending = await this.service.listPendingAnalysis(scope, getNumberInput(input, 'limit'))
        return {
          success: true,
          message: text(`${pending.length} pending`, `${pending.length} 条待分析`),
          data: { pending }
        }
      }

      const recordId = request.targetId ?? getStringInput(input, 'recordId')
      if (!recordId) {
        return failure('Record is required', '缺少业务记录')
      }

      if (actionKey === 'start_analysis' || actionKey === 'retry_analysis') {
        const isRetry = actionKey === 'retry_analysis'
        // Retry advances the SAME row. It never inserts a second main record, so the business
        // result cannot be duplicated by repeated retries.
        const { record, message } = await this.service.requestAnalysis(scope, recordId, { isRetry })
        return {
          success: true,
          message: isRetry ? text('Retrying', '已重新提交分析') : text('Analysis requested', '已提交 AI 分析'),
          refresh: true,
          data: {
            commandKey: ASSISTANT_CHAT_COMMAND_KEY,
            payload: { text: message },
            recordId,
            // Handed to the remote component so it can silently sync `assistant.context.set`
            // before sending the chat message — see the note on ASSISTANT_CONTEXT_COMMAND_KEY.
            customerName: record.customerName,
            status: record.status
          }
        }
      }

      if (actionKey === 'mark_analysis_failed') {
        await this.service.markFailed(scope, recordId, getStringInput(input, 'reason'))
        return success('Marked as failed', '已标记为分析失败')
      }

      if (actionKey === 'confirm_result') {
        await this.service.confirmResult(scope, {
          recordId,
          expectedRevision: getNumberInput(input, 'expectedRevision'),
          intentLevel: getStringInput(input, 'intentLevel') as ConversationIntentLevel | undefined,
          summary: getStringInput(input, 'summary'),
          // Clamping and axis filtering happen in the service, so the iframe cannot widen the radar.
          scores: getScoresInput(input, 'scores'),
          requirements: getStringArrayInput(input, 'requirements'),
          // Passed through as-is; the service is what coerces categories into the vocabulary, so
          // the iframe cannot introduce a category the dashboard does not know about.
          concerns: getIssueArrayInput(input, 'concerns'),
          risks: getIssueArrayInput(input, 'risks'),
          missingInformation: getStringArrayInput(input, 'missingInformation'),
          nextActions: getStringArrayInput(input, 'nextActions'),
          carriedOver: getStringArrayInput(input, 'carriedOver')
        })
        return success('Result confirmed and saved', '结果已确认并保存')
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

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component' as const,
    runtime: 'react' as const,
    protocolVersion: 1 as const,
    component: {
      isolation: 'iframe' as const,
      entry: CONVERSATION_REVIEW_REMOTE_ENTRY_KEY
    },
    dataSource: {
      mode: 'platform' as const
    }
  }
}

function platformDataSource(): XpertViewDataSource {
  return {
    mode: 'platform' as const,
    querySchema: {
      supportsPagination: true,
      supportsSearch: true,
      supportsParameters: true,
      defaultPageSize: 20
    },
    cache: {
      enabled: false
    }
  }
}

/**
 * The assistant writes results through the middleware tools, so the workbench listens for those
 * tool calls finishing and refreshes itself instead of polling. Only the tools that actually
 * change a record are subscribed — see `CONVERSATION_REVIEW_REFRESH_TOOL_NAMES`.
 */
function toolCompletedHostEvents() {
  return {
    subscriptions: [
      {
        key: 'conversation-review-tool-completed',
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...CONVERSATION_REVIEW_REFRESH_TOOL_NAMES]
        },
        action: {
          type: 'forward' as const,
          debounceMs: 800
        }
      }
    ]
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): ConversationReviewScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
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

function getNumberInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

function getStringArrayInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
    return items.length ? items : undefined
  }
  if (typeof value === 'string' && value.trim()) {
    const items = value
      .split(/\n+/)
      .map((item) => item.replace(/^[-•·\s]+/, '').trim())
      .filter(Boolean)
    return items.length ? items : undefined
  }
  return undefined
}

/**
 * The edited scorecard. Values arrive as strings from number inputs, so they are coerced here and
 * range-checked by `ConversationReviewService.normalizeScores`.
 */
function getScoresInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const scores: Record<string, number> = {}
  for (const [dimension, raw] of Object.entries(value as Record<string, unknown>)) {
    const parsed = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(parsed)) {
      scores[dimension] = parsed
    }
  }
  return Object.keys(scores).length ? scores : undefined
}

/**
 * Structured issues coming back from the workbench editor. Only the four known keys are read, so
 * nothing else the iframe sends can reach the database; `ConversationReviewService.normalizeIssues`
 * then decides whether the category is one the taxonomy actually has.
 */
function getIssueArrayInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (!Array.isArray(value)) {
    return undefined
  }
  const items = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      category: typeof item.category === 'string' ? item.category : 'other',
      severity: (typeof item.severity === 'string' ? item.severity : 'medium') as ConversationIssueSeverity,
      detail: typeof item.detail === 'string' ? item.detail.trim() : undefined,
      evidence: typeof item.evidence === 'string' ? item.evidence.trim() : undefined
    }))
    .filter((item) => item.detail || item.evidence)
  return items.length ? items : undefined
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

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return fallback
}
