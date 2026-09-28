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
  XpertViewDataSource,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  SMART_TICKET_FEATURE,
  SMART_TICKET_MIDDLEWARE_TOOL_NAMES,
  SMART_TICKET_PLUGIN_NAME,
  SMART_TICKET_PROVIDER_KEY,
  SMART_TICKET_REMOTE_ENTRY_KEY,
  SMART_TICKET_WORKBENCH_VIEW_KEY
} from './constants'
import { SmartTicketDispatchService } from './smart-ticket-dispatch.service'
import type { SmartTicketCategory, SmartTicketStatus, SmartTicketTeam, SmartTicketUrgency } from './types'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(SMART_TICKET_PROVIDER_KEY)
export class SmartTicketDispatchViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: SmartTicketDispatchService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    // Register the view on the fixed workbench slot only. The same view exposed on
    // multiple slots makes per-slot activation resolution ambiguous at runtime.
    if (slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    const base = fixed
      ? {
          activation: {
            requiredFeatures: [SMART_TICKET_FEATURE]
          },
          workbench: {
            fixed: true
          }
        }
      : {}

    return [
      {
        key: SMART_TICKET_WORKBENCH_VIEW_KEY,
        title: text('Smart Ticket Dispatch', '智能工单分派'),
        description: text(
          'Submit support tickets, let the AI triage them, confirm the dispatch plan and track resolution.',
          '提交客服工单，AI 分诊分类并提出分派建议，人工确认后执行并可跟踪处理进度。'
        ),
        icon: {
          type: 'font',
          value: 'ri-ticket-2-line',
          color: '#1d4ed8'
        },
        hostType: 'agent',
        slot,
        order: 30,
        refreshable: true,
        ...base,
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Ticket Dispatch', '工单分派'),
                  order: 30,
                  icon: {
                    type: 'font',
                    value: 'ri-ticket-2-line',
                    color: '#1d4ed8'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: SMART_TICKET_PROVIDER_KEY,
          plugin: SMART_TICKET_PLUGIN_NAME
        },
        view: remoteView(),
        dataSource: platformDataSource(),
        hostEvents: toolCompletedHostEvents(),
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到助手对话')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          {
            key: 'submit_ticket',
            label: text('AI Triage', 'AI 分诊'),
            icon: 'ri-send-plane-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'confirm_dispatch',
            label: text('Confirm Dispatch', '确认分派'),
            icon: 'ri-checkbox-circle-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'reject_ticket',
            label: text('Reject', '驳回'),
            icon: 'ri-close-circle-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'mark_resolved',
            label: text('Mark Resolved', '标记解决'),
            icon: 'ri-checkbox-multiple-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'retry_triage',
            label: text('Retry Triage', '重新分诊'),
            icon: 'ri-restart-line',
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
    if (viewKey !== SMART_TICKET_WORKBENCH_VIEW_KEY || component.entry !== SMART_TICKET_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported smart ticket component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const appPath = join(__dirname, 'remote-components', SMART_TICKET_REMOTE_ENTRY_KEY, 'app.js')
    const appScript = await readFile(appPath, 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Smart Ticket Dispatch',
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
    if (viewKey !== SMART_TICKET_WORKBENCH_VIEW_KEY) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context), {
      ticketId: getStringParameter(query.parameters, 'ticketId'),
      status: getStringParameter(query.parameters, 'status') as SmartTicketStatus | undefined,
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
      if (viewKey !== SMART_TICKET_WORKBENCH_VIEW_KEY) {
        return failure('Unsupported action', '不支持的操作')
      }
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('工单列表已刷新', 'Smart ticket list refreshed')
      }

      if (actionKey === 'submit_ticket') {
        const originalContent = getStringInput(request.input, 'originalContent')
        if (!originalContent) {
          return failure('工单描述不能为空', 'Ticket description is required')
        }
        return {
          success: true,
          message: text('Ticket submitted to the AI assistant', '工单已提交给 AI 分诊'),
          refresh: false,
          data: {
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: buildTriageAssistantMessage(originalContent, request.input ?? {})
            }
          }
        }
      }

      const ticketId = request.targetId ?? getStringInput(request.input, 'ticketId')
      if (!ticketId) {
        return failure('缺少工单', 'Ticket is required')
      }

      if (actionKey === 'confirm_dispatch') {
        await this.service.confirmDispatch(scope, ticketId, {
          confirmedTeam: getStringInput(request.input, 'confirmedTeam') as SmartTicketTeam | undefined,
          confirmedOwner: getStringInput(request.input, 'confirmedOwner'),
          dispatchRemark: getStringInput(request.input, 'dispatchRemark')
        }, scope.userId)
      } else if (actionKey === 'reject_ticket') {
        await this.service.rejectTicket(scope, ticketId, getStringInput(request.input, 'reason') || '', scope.userId)
      } else if (actionKey === 'mark_resolved') {
        await this.service.markResolved(
          scope,
          ticketId,
          getStringInput(request.input, 'resolutionSummary') || '',
          scope.userId
        )
      } else if (actionKey === 'retry_triage') {
        const ticket = await this.service.retryTriage(scope, ticketId, scope.userId)
        return {
          success: true,
          message: text(`已记录第 ${ticket.retryCount} 次重新分诊`, `Retry #${ticket.retryCount} recorded`),
          refresh: true,
          data: {
            commandKey: 'assistant.chat.send_message',
            payload: {
              text: buildTriageAssistantMessage(ticket.originalContent, {
                customerName: ticket.customerName || '',
                channel: ticket.channel || ''
              })
            }
          }
        }
      } else {
        return failure('不支持的操作', 'Unsupported action')
      }

      return success('操作已完成', 'Operation completed')
    } catch (error) {
      const message = getActionErrorMessage(error)
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
      entry: SMART_TICKET_REMOTE_ENTRY_KEY
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
        key: 'smart-ticket-tool-completed',
        event: 'assistant.tool.completed',
        filter: {
          sources: ['chatkit'],
          toolNames: [...SMART_TICKET_MIDDLEWARE_TOOL_NAMES]
        },
        action: {
          type: 'forward' as const,
          debounceMs: 1000
        }
      }
    ]
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext) {
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

function buildTriageAssistantMessage(originalContent: string, input: Record<string, unknown>) {
  const customerName = getStringInput(input, 'customerName')
  const channel = getStringInput(input, 'channel')
  return [
    '请根据以下客服工单内容进行分诊。',
    '你必须调用 smart_ticket_save_triaged_ticket 工具保存分诊草稿；不要只总结内容，也不要声称已保存但未调用工具。',
    '分诊要求：判断工单类别（technical/billing/logistics/consult/complaint/other）、紧急程度（low/medium/high）、建议处理团队与负责人、具体处理建议和置信度。',
    '信息不足时仍然保存工单，把缺失项写入 completenessTips；一次提交只保存一张工单。',
    '保存后请告知工单号，并强调需要人工在审核台确认分派后工单才会执行。',
    '',
    `工单内容：${originalContent}`,
    customerName ? `客户名称：${customerName}` : '',
    channel ? `来源渠道：${channel}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function success(zh_Hans: string, en_US: string): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans),
    refresh: true
  }
}

function failure(zh_Hans: string, en_US: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans)
  }
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return '操作失败'
}
