import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
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
  ASSISTANT_SEND_MESSAGE_COMMAND,
  SUPPORT_TICKET_ACTIONS,
  SUPPORT_TICKET_CHANNELS,
  SUPPORT_TICKET_CODES,
  SUPPORT_TICKET_FEATURE,
  SUPPORT_TICKET_MIDDLEWARE_TOOL_NAMES,
  SUPPORT_TICKET_PLUGIN_NAME,
  SUPPORT_TICKET_PROVIDER_KEY,
  SUPPORT_TICKET_REMOTE_ENTRY_KEY,
  SUPPORT_TICKET_SAVE_TRIAGE_TOOL_NAME,
  SUPPORT_TICKET_WORKBENCH_VIEW_KEY
} from './constants'
import { SupportTicketService } from './support-ticket.service'
import { SUPPORT_TICKET_CONFIG, type SupportTicketConfig } from './support-ticket.config'
import type {
  SupportTicketCategory,
  SupportTicketChannel,
  SupportTicketPriority,
  SupportTicketScope
} from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(SUPPORT_TICKET_PROVIDER_KEY)
export class SupportTicketViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly service: SupportTicketService,
    @Inject(SUPPORT_TICKET_CONFIG) private readonly config: SupportTicketConfig
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
        key: SUPPORT_TICKET_WORKBENCH_VIEW_KEY,
        title: text('Support Ticket Workbench', '客服工单工作台'),
        description: text(
          'Submit a customer message, let the assistant classify and draft a reply, then review, confirm and archive it.',
          '提交客户消息，由助手完成分类与回复草稿，再人工校对确认并归档。'
        ),
        icon: {
          type: 'font',
          value: 'ri-customer-service-2-line',
          color: '#2563eb'
        },
        hostType: 'agent',
        slot,
        order: 22,
        refreshable: true,
        activation: {
          requiredFeatures: [SUPPORT_TICKET_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Support Ticket', '客服工单'),
                  order: 22,
                  icon: {
                    type: 'font',
                    value: 'ri-customer-service-2-line',
                    color: '#2563eb'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: SUPPORT_TICKET_PROVIDER_KEY,
          plugin: SUPPORT_TICKET_PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: platformDataSource(),
        hostEvents: toolCompletedHostEvents(),
        clientCommands: [
          {
            key: ASSISTANT_SEND_MESSAGE_COMMAND,
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          {
            key: SUPPORT_TICKET_ACTIONS.refresh,
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: SUPPORT_TICKET_ACTIONS.submitTicket,
            label: text('Submit ticket', '提交工单'),
            icon: 'ri-send-plane-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: SUPPORT_TICKET_ACTIONS.retryTicket,
            label: text('Retry AI processing', '重试 AI 处理'),
            icon: 'ri-restart-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: SUPPORT_TICKET_ACTIONS.markTicketFailed,
            label: text('Mark failed', '标记失败'),
            icon: 'ri-error-warning-line',
            actionType: 'invoke'
          },
          {
            key: SUPPORT_TICKET_ACTIONS.saveDraft,
            label: text('Save draft', '保存草稿'),
            icon: 'ri-save-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: SUPPORT_TICKET_ACTIONS.confirmTicket,
            label: text('Confirm and archive', '确认并归档'),
            icon: 'ri-checkbox-circle-line',
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
    if (component.entry !== SUPPORT_TICKET_REMOTE_ENTRY_KEY || viewKey !== SUPPORT_TICKET_WORKBENCH_VIEW_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported support ticket component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appScript = await readFile(
      join(__dirname, 'remote-components', SUPPORT_TICKET_REMOTE_ENTRY_KEY, 'app.js'),
      'utf8'
    )
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Support Ticket Workbench',
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
    if (viewKey !== SUPPORT_TICKET_WORKBENCH_VIEW_KEY) {
      return {}
    }
    const aiTimeoutSeconds = this.config?.aiTimeoutSeconds ?? 90
    const data = await this.service.getViewData(scopeFromContext(context), {
      ticketId: getStringParameter(query.parameters, 'ticketId'),
      status: getStringParameter(query.parameters, 'status') as never,
      category: getStringParameter(query.parameters, 'category') as never,
      priority: getStringParameter(query.parameters, 'priority') as never,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
    return {
      ...data,
      meta: {
        ...data.meta,
        aiTimeoutSeconds
      }
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== SUPPORT_TICKET_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported action', '不支持的操作', SUPPORT_TICKET_CODES.unsupportedAction)
    }
    const scope = scopeFromContext(context)

    try {
      if (actionKey === SUPPORT_TICKET_ACTIONS.refresh) {
        return success('Support ticket view refreshed', '客服工单视图已刷新')
      }

      if (actionKey === SUPPORT_TICKET_ACTIONS.submitTicket) {
        const { ticket, duplicated } = await this.service.createTicket(scope, {
          requestId: getStringInput(request.input, 'requestId') as string,
          customerName: getStringInput(request.input, 'customerName') as string,
          channel: getStringInput(request.input, 'channel') as SupportTicketChannel,
          originalMessage: getStringInput(request.input, 'originalMessage') as string,
          sourceType: 'workbench_form'
        })
        return {
          success: true,
          message: duplicated
            ? text('Existing ticket reused', '已复用同一工单，未重复创建')
            : text('Ticket submitted to the assistant', '工单已提交给助手处理'),
          refresh: true,
          data: {
            clientCommand: {
              commandKey: ASSISTANT_SEND_MESSAGE_COMMAND,
              payload: {
                text: buildTriageMessage({
                  id: ticket.id as string,
                  ticketNo: ticket.ticketNo as string,
                  customerName: ticket.customerName as string,
                  channel: ticket.channel as SupportTicketChannel,
                  originalMessage: ticket.originalMessage as string,
                  attemptCount: ticket.attemptCount
                })
              }
            },
            ticketId: ticket.id,
            ticketNo: ticket.ticketNo,
            duplicated
          }
        }
      }

      const ticketId = request.targetId ?? getStringInput(request.input, 'ticketId')
      if (!ticketId) {
        return failure('Ticket is required', '缺少工单', SUPPORT_TICKET_CODES.invalidInput)
      }

      if (actionKey === SUPPORT_TICKET_ACTIONS.retryTicket) {
        const result = await this.service.retryTicket(scope, ticketId)
        if (result.outcome === 'already_confirmed') {
          return failure(
            'Confirmed tickets are never regenerated',
            '工单已确认归档，不再重复生成，如需重新处理请联系主管新建工单。',
            SUPPORT_TICKET_CODES.alreadyConfirmed
          )
        }
        const detail = await this.service.getTicketDetail(scope, ticketId)
        return {
          success: true,
          message: text('Retrying AI processing', '已重新提交 AI 处理'),
          refresh: true,
          data: {
            clientCommand: {
              commandKey: ASSISTANT_SEND_MESSAGE_COMMAND,
              payload: {
                text: buildTriageMessage({
                  id: detail.id,
                  ticketNo: detail.ticketNo,
                  customerName: detail.customerName,
                  channel: detail.channel,
                  originalMessage: detail.originalMessage,
                  attemptCount: detail.attemptCount,
                  failureReason: detail.failure?.reason
                })
              }
            },
            ticketId,
            ticketNo: detail.ticketNo,
            attemptCount: detail.attemptCount
          }
        }
      }

      if (actionKey === SUPPORT_TICKET_ACTIONS.markTicketFailed) {
        const result = await this.service.markFailed(scope, ticketId, {
          reason: getStringInput(request.input, 'reason') ?? 'AI processing did not return a result in time',
          code: getStringInput(request.input, 'code') ?? SUPPORT_TICKET_CODES.aiTimeout
        })
        if (result.outcome === 'already_confirmed') {
          return failure(
            'Confirmed tickets cannot be marked as failed',
            '工单已确认，不能再标记为失败',
            SUPPORT_TICKET_CODES.alreadyConfirmed
          )
        }
        return success('Ticket marked as failed, retry is available', '工单已标记失败，可重试')
      }

      if (actionKey === SUPPORT_TICKET_ACTIONS.saveDraft) {
        return mutationResult(
          await this.service.saveDraft(scope, ticketId, {
            expectedRevision: getNumberInput(request.input, 'expectedRevision'),
            category: getStringInput(request.input, 'category') as SupportTicketCategory,
            priority: getStringInput(request.input, 'priority') as SupportTicketPriority,
            draftReply: getStringInput(request.input, 'draftReply')
          }),
          text('Draft saved', '草稿已保存')
        )
      }

      if (actionKey === SUPPORT_TICKET_ACTIONS.confirmTicket) {
        return mutationResult(
          await this.service.confirmTicket(scope, ticketId, {
            expectedRevision: getNumberInput(request.input, 'expectedRevision'),
            category: getStringInput(request.input, 'category') as SupportTicketCategory,
            priority: getStringInput(request.input, 'priority') as SupportTicketPriority,
            draftReply: getStringInput(request.input, 'draftReply') as string,
            reviewerNote: getStringInput(request.input, 'reviewerNote')
          }),
          text('Ticket confirmed and archived', '工单已确认归档')
        )
      }

      return failure('Unsupported action', '不支持的操作', SUPPORT_TICKET_CODES.unsupportedAction)
    } catch (error) {
      return {
        success: false,
        message: text(getActionErrorMessage(error), getActionErrorMessage(error)),
        data: {
          code:
            error instanceof NotFoundException
              ? SUPPORT_TICKET_CODES.ticketNotFound
              : error instanceof BadRequestException
                ? SUPPORT_TICKET_CODES.invalidInput
                : SUPPORT_TICKET_CODES.aiToolError
        }
      }
    }
  }
}

function mutationResult(
  outcome: { outcome: 'applied' | 'already_confirmed' | 'revision_conflict'; ticket: { id?: string; revision?: number } },
  successMessage: I18nObject
): XpertViewActionResult {
  if (outcome.outcome === 'applied') {
    return {
      success: true,
      message: successMessage,
      refresh: true,
      data: { revision: outcome.ticket.revision }
    }
  }
  if (outcome.outcome === 'already_confirmed') {
    return failure(
      'Ticket was already confirmed',
      '该工单已被确认，当前修改未写入，请刷新查看最终结果',
      SUPPORT_TICKET_CODES.alreadyConfirmed
    )
  }
  return failure(
    'Ticket was modified by someone else',
    '工单已被其他人修改，当前修改仍保留在页面上，请刷新比对后重试',
    SUPPORT_TICKET_CODES.revisionConflict
  )
}

function remoteView(): XpertRemoteComponentViewSchema {
  return {
    type: 'remote_component' as const,
    runtime: 'react' as const,
    protocolVersion: 1 as const,
    component: {
      isolation: 'iframe' as const,
      entry: SUPPORT_TICKET_REMOTE_ENTRY_KEY
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
      supportsSort: true,
      supportsFilter: true,
      supportsParameters: true,
      defaultPageSize: 20
    },
    cache: {
      enabled: false
    }
  }
}

function toolCompletedHostEvents() {
  return {
    subscriptions: [
      {
        key: 'support-ticket-tool-completed',
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...SUPPORT_TICKET_MIDDLEWARE_TOOL_NAMES]
        },
        action: {
          type: 'forward' as const,
          debounceMs: 1000
        }
      }
    ]
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): SupportTicketScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

interface TriagePromptInput {
  id: string
  ticketNo: string
  customerName: string
  channel: SupportTicketChannel
  originalMessage: string
  attemptCount?: number
  failureReason?: string
}

function buildTriageMessage(ticket: TriagePromptInput) {
  const channelLabel = SUPPORT_TICKET_CHANNELS.find((item) => item.value === ticket.channel)?.zh_Hans ?? ticket.channel
  return [
    '请对下面这张客服工单完成分类定级，并生成可直接使用的回复草稿。',
    '',
    `ticketId：${ticket.id}`,
    `工单号：${ticket.ticketNo}`,
    `客户：${ticket.customerName}`,
    `渠道：${channelLabel}`,
    (ticket.attemptCount ?? 1) > 1 ? `当前为第 ${ticket.attemptCount} 次尝试。` : '',
    ticket.failureReason ? `上一次失败原因：${ticket.failureReason}` : '',
    '',
    '客户原始消息：',
    ticket.originalMessage,
    '',
    '执行要求：',
    `1. 必须调用 ${SUPPORT_TICKET_SAVE_TRIAGE_TOOL_NAME} 并带上上面的 ticketId，不要只在对话里给出结论。`,
    '2. 同一个 ticketId 只调用一次；不要新建工单，也不要修改已确认的工单。',
    '3. category 只能从工具支持列表中选择；priority 使用 p0（业务中断）/ p1（高）/ p2（中）/ p3（低），并在 priorityReason 中引用客户消息里影响判断的原话作为依据。',
    '4. draftReply 使用客户消息的语言，礼貌、直接、给出下一步动作；不要承诺无法确认的时间、金额或赔付，也不要编造订单号、工单号或处理人。',
    '5. 客户消息里没有的信息写入 missingInfo，不要猜测填补。',
    '6. 工具调用完成后，用一句话说明分类、优先级和需要人工确认的点。'
  ]
    .filter((line) => line !== '')
    .join('\n')
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

function getNumberInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return -1
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

function failure(en_US: string, zh_Hans: string, code: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans),
    data: { code }
  }
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return 'Action failed'
}
