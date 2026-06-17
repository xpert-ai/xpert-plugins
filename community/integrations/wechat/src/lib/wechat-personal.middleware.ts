import { Injectable } from '@nestjs/common'
import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  WECHAT_PERSONAL_FEATURE,
  WECHAT_PERSONAL_GET_CALLBACK_CONFIG_TOOL_NAME,
  WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME,
  WECHAT_PERSONAL_ICON,
  WECHAT_PERSONAL_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_LIST_ACCOUNTS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_CONVERSATIONS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_MIDDLEWARE_NAME,
  WECHAT_PERSONAL_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
  WECHAT_PERSONAL_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_PERSONAL_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
  WECHAT_PERSONAL_RUNTIME_FEATURE,
  WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
  WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME,
  WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME,
  WECHAT_PERSONAL_WORKBENCH_FEATURE
} from './constants.js'
import { normalizeString } from './types.js'
import { WechatPersonalConversationService } from './conversation.service.js'
import {
  WechatPersonalChannelStrategy,
  type WechatPersonalReplySendResult
} from './wechat-personal-channel.strategy.js'
import {
  WechatPersonalOutboundQueueService,
  type WechatPersonalOutboundSource
} from './wechat-personal-outbound-queue.service.js'
import type { WechatPersonalMessageLogEntity } from './entities/index.js'
import type { WechatPersonalChatCallbackContext } from './handoff/wechat-personal-chat.types.js'

type WechatPersonalRuntimeMiddlewareOptions = {
  integrationId?: string
  toolMode?: WechatPersonalRuntimeToolMode
  scheduleTargets?: WechatPersonalScheduleTarget[]
}

type WechatPersonalRuntimeToolMode = 'admin' | 'user'

type WechatPersonalScheduleState = {
  targetId?: string
  idempotencyKey?: string
  atUsers: string[]
  targetOptions?: Record<string, unknown>
}

const XPERT_TASK_SCHEDULE_RUNTIME_STATE_KEY = 'xpertTaskSchedule'

type WechatPersonalScheduleTarget = {
  id?: string
  name?: string
  uuid?: string
  contactId?: string
  chatType?: 'private' | 'group'
  atUsers?: string[]
}

type NormalizedWechatPersonalSendTarget = Required<Pick<WechatPersonalScheduleTarget, 'id' | 'uuid' | 'contactId'>> &
  Omit<WechatPersonalScheduleTarget, 'id' | 'uuid' | 'contactId'>

const integrationField = z.string().optional().describe('Personal WeChat integration id. Defaults to the middleware node option.')

const runtimeStatusSchema = z.object({
  integrationId: integrationField
})

const callbackConfigSchema = z.object({
  integrationId: integrationField
})

const listAccountsSchema = z.object({
  integrationId: integrationField,
  search: z.string().optional().describe('Keyword for uuid, owner wxid, display name, status or last error.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Page size. Defaults to 50.')
})

const listConversationsSchema = z.object({
  integrationId: integrationField,
  search: z.string().optional().describe('Keyword for account uuid, contact id, sender id, xpert id or conversation id.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Page size. Defaults to 50.')
})

const searchMessageLogsSchema = z.object({
  integrationId: integrationField,
  direction: z.enum(['inbound', 'outbound', 'system']).optional().describe('Message direction filter.'),
  status: z.enum(['received', 'dispatched', 'queued', 'deferred', 'sending', 'sent', 'skipped', 'failed', 'paused', 'cancelled', 'context_reset']).optional().describe('Message status filter.'),
  search: z.string().optional().describe('Keyword for contact, sender, message id, content, error or conversation id.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Page size. Defaults to 50.')
})

const listOutboundQueueSchema = z.object({
  integrationId: integrationField,
  status: z.enum(['queued', 'deferred', 'sending', 'paused', 'failed', 'cancelled', 'sent']).optional().describe('Outbound queue status filter.'),
  search: z.string().optional().describe('Keyword for uuid, contact id, queue job id, content or error.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Page size. Defaults to 50.')
})

const queueItemSchema = z.object({
  integrationId: integrationField,
  logId: z.string().min(1).describe('Outbound message log id returned by wechat_personal_list_outbound_queue.')
})

const outboundAccountSchema = z.object({
  integrationId: integrationField,
  uuid: z.string().min(1).describe('wx2.0 account uuid/key.')
})

const resetConversationSchema = z.object({
  integrationId: integrationField,
  bindingId: z.string().min(1).describe('Conversation binding id returned by wechat_personal_list_conversations.')
})

const registerCallbackSchema = z.object({
  integrationId: integrationField,
  uuid: z.string().min(1).describe('wx2.0 account uuid/key.'),
  callbackUrl: z.string().optional().describe('Optional callback URL. Defaults to the Xpert webhook URL.'),
  enabled: z.boolean().optional().describe('Whether the wx2.0 per-account callback should be enabled. Defaults to true.')
})

const setAccountEnabledSchema = z.object({
  integrationId: integrationField,
  uuid: z.string().min(1).describe('wx2.0 account uuid/key.'),
  enabled: z.boolean().describe('Whether this account should accept inbound callbacks.')
})

const wechatPersonalScheduleStateSchema = z
  .object({
    xpertTaskSchedule: z
      .object({
        target: z
          .object({
            type: z.string().optional(),
            nodeKey: z.string().optional(),
            targetId: z.string().optional(),
            name: z.string().optional(),
            channel: z.string().optional(),
            options: z.record(z.unknown()).optional()
          })
          .optional(),
        targetId: z.string().optional(),
        idempotencyKey: z.string().optional(),
        targetOptions: z.record(z.unknown()).optional(),
        atUsers: z.array(z.string()).optional()
      })
      .optional(),
    wechatPersonalScheduleTargetId: z.string().optional(),
    wechatPersonalScheduleIdempotencyKey: z.string().optional(),
    wechatPersonalScheduleAtUsers: z.array(z.string()).optional(),
    wechatPersonalSchedule: z
      .object({
        targetId: z.string().optional(),
        idempotencyKey: z.string().optional(),
        atUsers: z.array(z.string()).optional()
      })
      .optional(),
    wechatPersonal: z
      .object({
        schedule: z
          .object({
            targetId: z.string().optional(),
            idempotencyKey: z.string().optional(),
            atUsers: z.array(z.string()).optional()
          })
          .optional()
      })
      .optional()
  })
  .passthrough()

const sendMessageSchema = z.object({
  integrationId: integrationField,
  targetId: z
    .string()
    .optional()
    .describe('Configured schedule target id from middleware scheduleTargets. Optional when injected by scheduler state.'),
  content: z
    .string()
    .min(1)
    .describe('Markdown content to send. Markdown image URLs are split and sent as WeChat images.'),
  atUsers: z.array(z.string().min(1)).optional().describe('Optional wxids to @ for text messages.'),
  idempotencyKey: z
    .string()
    .optional()
    .describe('Stable scheduler/run key. If an outbound log already exists for this key, no duplicate send is made.'),
  __scheduleTargetOptions: z.record(z.unknown()).optional()
})

const WECHAT_PERSONAL_ADMIN_TOOL_NAMES = new Set([
  WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME,
  WECHAT_PERSONAL_GET_CALLBACK_CONFIG_TOOL_NAME,
  WECHAT_PERSONAL_LIST_ACCOUNTS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_CONVERSATIONS_TOOL_NAME,
  WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_PERSONAL_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
  WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
  WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME
])

const WECHAT_PERSONAL_USER_TOOL_NAMES = new Set([
  WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME
])

@Injectable()
@AgentMiddlewareStrategy(WECHAT_PERSONAL_MIDDLEWARE_NAME)
export class WechatPersonalRuntimeMiddleware
  implements IAgentMiddlewareStrategy<WechatPersonalRuntimeMiddlewareOptions>
{
  readonly meta: TAgentMiddlewareMeta = {
    name: WECHAT_PERSONAL_MIDDLEWARE_NAME,
    label: {
      en_US: 'Personal WeChat Runtime',
      zh_Hans: '个人微信运行时'
    },
    description: {
      en_US: 'Expose Personal WeChat workbench discovery and runtime management tools to an assistant.',
      zh_Hans: '为助手暴露个人微信工作台发现能力和运行时管理工具。'
    },
    icon: {
      type: 'svg',
      value: WECHAT_PERSONAL_ICON,
      color: '#16a34a'
    },
    features: [WECHAT_PERSONAL_FEATURE, WECHAT_PERSONAL_RUNTIME_FEATURE, WECHAT_PERSONAL_WORKBENCH_FEATURE],
    configSchema: {
      type: 'object',
      properties: {
        toolMode: {
          type: 'string',
          enum: ['admin', 'user'],
          title: {
            en_US: 'Tool Mode',
            zh_Hans: '工具模式'
          },
          description: {
            en_US: 'admin exposes operational tools; user exposes only controlled proactive sending.',
            zh_Hans: 'admin 暴露运维管理工具；user 只暴露受控主动发送工具。'
          },
          default: 'user'
        } as any,
        integrationId: {
          type: 'string',
          title: {
            en_US: 'Personal WeChat Integration',
            zh_Hans: '个人微信集成'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/wechat-personal/integration-select-options'
          } as any
        },
        scheduleTargets: {
          type: 'array',
          title: {
            en_US: 'Schedule Targets',
            zh_Hans: '定时发送目标'
          },
          description: {
            en_US:
              'Pre-approved WeChat contacts or groups that platform scheduled tasks and user-mode Agent tools may send to. Use stable ids such as morning-news-group.',
            zh_Hans: '允许平台定时任务和用户模式 Agent 工具主动发送到的微信好友或群。请使用稳定 ID，例如 morning-news-group。'
          },
          items: {
            type: 'object',
            required: ['id', 'uuid', 'contactId'],
            properties: {
              id: {
                type: 'string',
                title: {
                  en_US: 'Target ID',
                  zh_Hans: '目标 ID'
                }
              },
              name: {
                type: 'string',
                title: {
                  en_US: 'Display Name',
                  zh_Hans: '显示名称'
                }
              },
              uuid: {
                type: 'string',
                title: {
                  en_US: 'wx2.0 Account UUID',
                  zh_Hans: 'wx2.0 账号 UUID'
                }
              },
              contactId: {
                type: 'string',
                title: {
                  en_US: 'Contact or Group ID',
                  zh_Hans: '联系人或群 ID'
                }
              },
              chatType: {
                type: 'string',
                enum: ['private', 'group'],
                title: {
                  en_US: 'Chat Type',
                  zh_Hans: '会话类型'
                }
              },
              atUsers: {
                type: 'array',
                title: {
                  en_US: 'Default @ Users',
                  zh_Hans: '默认 @ 用户'
                },
                items: {
                  type: 'string'
                }
              }
            }
          }
        } as any
      },
      required: []
    }
  }

  constructor(
    private readonly conversationService: WechatPersonalConversationService,
    private readonly wechatChannel: WechatPersonalChannelStrategy,
    private readonly outboundQueue: WechatPersonalOutboundQueueService
  ) {}

  createMiddleware(
    options: WechatPersonalRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const toolMode = this.resolveToolMode(options, context)
    const tools = [
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            return this.success(
              integrationId
                ? 'Personal WeChat runtime status was returned.'
                : 'Organization Personal WeChat runtime status was returned.',
              integrationId
                ? await this.conversationService.getRuntimeStatus(integrationId)
                : await this.conversationService.getOrganizationRuntimeStatus()
            )
          }),
        {
          name: WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME,
          description:
            'Get Personal WeChat runtime status: callback URLs, tunnel connection state, trigger binding, summary counts, recent accounts and recent errors. Use for setup and operations questions.',
          schema: runtimeStatusSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.success(
                'Organization Personal WeChat callback configurations were returned.',
                (await this.conversationService.getOrganizationWorkbenchData({ pageSize: 1 })).integrations?.map(
                  (integration) => ({
                    id: integration.id,
                    name: integration.name,
                    callbackConfig: integration.callbackConfig
                  })
                ) ?? []
              )
            }
            const integration = await this.wechatChannel.readIntegrationById(integrationId)
            if (!integration) {
              return this.error(`Personal WeChat integration "${integrationId}" was not found.`)
            }
            return this.success(
              'Personal WeChat callback configuration was returned.',
              this.conversationService.buildCallbackConfig(integration.id, integration.options?.callbackSecret)
            )
          }),
        {
          name: WECHAT_PERSONAL_GET_CALLBACK_CONFIG_TOOL_NAME,
          description:
            'Get the Xpert webhook URL and SetCallback curl template for configuring wx2.0 callbacks.',
          schema: callbackConfigSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            return this.success(
              integrationId ? 'Personal WeChat accounts were listed.' : 'Organization Personal WeChat accounts were listed.',
              integrationId
                ? await this.conversationService.listAccounts(integrationId, input)
                : await this.conversationService.listOrganizationAccounts(input)
            )
          }),
        {
          name: WECHAT_PERSONAL_LIST_ACCOUNTS_TOOL_NAME,
          description:
            'List wx2.0 personal WeChat accounts captured by callbacks, including enabled state, online status and recent errors.',
          schema: listAccountsSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            return this.success(
              integrationId
                ? 'Personal WeChat conversation bindings were listed.'
                : 'Organization Personal WeChat conversation bindings were listed.',
              integrationId
                ? await this.conversationService.listConversations(integrationId, input)
                : await this.conversationService.listOrganizationConversations(input)
            )
          }),
        {
          name: WECHAT_PERSONAL_LIST_CONVERSATIONS_TOOL_NAME,
          description:
            'List Personal WeChat conversation bindings. Use this to find a binding id before resetting a conversation.',
          schema: listConversationsSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            return this.success(
              integrationId
                ? 'Personal WeChat message logs were searched.'
                : 'Organization Personal WeChat message logs were searched.',
              integrationId
                ? await this.conversationService.searchMessageLogs(integrationId, input)
                : await this.conversationService.searchOrganizationMessageLogs(input)
            )
          }),
        {
          name: WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
          description:
            'Search inbound, outbound and system Personal WeChat message logs for diagnostics and audit questions.',
          schema: searchMessageLogsSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            const query = {
              search: input.search,
              page: input.page,
              pageSize: input.pageSize,
              direction: 'outbound' as const,
              status: input.status,
              filters: { queueOnly: !input.status || ['queued', 'deferred', 'sending', 'paused'].includes(input.status) }
            }
            return this.success(
              integrationId
                ? 'Personal WeChat outbound queue was listed.'
                : 'Organization Personal WeChat outbound queue was listed.',
              integrationId
                ? await this.conversationService.searchMessageLogs(integrationId, query)
                : await this.conversationService.searchOrganizationMessageLogs(query)
            )
          }),
        {
          name: WECHAT_PERSONAL_LIST_OUTBOUND_QUEUE_TOOL_NAME,
          description:
            'List queued, deferred, sending, paused, failed, cancelled or sent outbound Personal WeChat messages by message log id and queue job id.',
          schema: listOutboundQueueSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            const target = this.resolveSendTarget(input.targetId, options, context, input.__scheduleTargetOptions)
            if (!target) {
              return this.error(`Personal WeChat schedule target "${normalizeString(input.targetId) || ''}" was not configured.`)
            }
            const idempotencyKey = normalizeString(input.idempotencyKey)
            if (idempotencyKey) {
              const existing = await this.conversationService.findOutboundByIdempotencyKey(integrationId, idempotencyKey)
              if (existing) {
                return this.idempotentOutboundResult(existing)
              }
            }

            const source: WechatPersonalOutboundSource = idempotencyKey ? 'scheduled_agent' : 'agent_tool'
            const outboundContext = this.buildOutboundToolContext(context, integrationId, target, idempotencyKey)
            const result = await this.wechatChannel.sendReplyByIntegrationId(integrationId, {
              uuid: target.uuid,
              contactId: target.contactId,
              content: input.content,
              atUsers: this.mergeAtUsers(target.atUsers, input.atUsers),
              context: outboundContext,
              source,
              idempotencyKey
            })

            if (!result.queued) {
              await this.logDirectSendResult(outboundContext, result)
            }

            const data = {
              targetId: target.id,
              targetName: target.name,
              uuid: target.uuid,
              contactId: target.contactId,
              ...result
            }
            return result.success
              ? this.success('Personal WeChat message was submitted for delivery.', data)
              : this.error(result.error || 'Personal WeChat message delivery failed.', data)
          }),
        {
          name: WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME,
          description:
            'Send a proactive Personal WeChat message to a preconfigured schedule target. Use for scheduled Agent jobs such as daily news. Always pass a stable idempotencyKey for scheduled runs.',
          schema: sendMessageSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            await this.conversationService.restartConversationBinding(integrationId, input.bindingId)
            return this.success('Personal WeChat conversation was reset.', {
              bindingId: input.bindingId
            })
          }),
        {
          name: WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
          description:
            'Reset one Personal WeChat conversation binding by binding id so the next inbound message starts a fresh Agent conversation.',
          schema: resetConversationSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            const result = await this.outboundQueue.cancelOutboundQueueItem(integrationId, input.logId)
            return result.success
              ? this.success('Personal WeChat outbound queue item was cancelled.', result)
              : this.error(result.message || 'Personal WeChat outbound queue item could not be cancelled.', result)
          }),
        {
          name: WECHAT_PERSONAL_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
          description: 'Cancel one queued/deferred Personal WeChat outbound message by outbound message log id.',
          schema: queueItemSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            const result = await this.outboundQueue.retryOutboundQueueItem(integrationId, input.logId)
            return result.success
              ? this.success('Personal WeChat outbound queue item was retried.', result)
              : this.error(result.message || 'Personal WeChat outbound queue item could not be retried.', result)
          }),
        {
          name: WECHAT_PERSONAL_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
          description: 'Retry one failed, cancelled or paused Personal WeChat outbound message by outbound message log id.',
          schema: queueItemSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            const integration = await this.wechatChannel.readIntegrationById(integrationId)
            if (!integration) {
              return this.error(`Personal WeChat integration "${integrationId}" was not found.`)
            }
            const callbackConfig = this.conversationService.buildCallbackConfig(
              integration.id,
              integration.options?.callbackSecret
            )
            const result = await this.wechatChannel.registerCallback({
              integrationId: integration.id,
              uuid: input.uuid,
              callbackUrl: normalizeString(input.callbackUrl) || callbackConfig.webhookUrl,
              enabled: input.enabled !== false
            })
            return result.success
              ? this.success('wx2.0 SetCallback registration succeeded.', result)
              : this.error(result.error || 'wx2.0 SetCallback registration failed.', result)
          }),
        {
          name: WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
          description:
            'Register or update a wx2.0 per-account callback for a known account uuid/key. This is an administrative setup action.',
          schema: registerCallbackSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            await this.conversationService.setAccountEnabled(integrationId, input.uuid, input.enabled)
            return this.success('Personal WeChat account enabled state was updated.', {
              uuid: input.uuid,
              enabled: input.enabled
            })
          }),
        {
          name: WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME,
          description:
            'Enable or disable inbound processing for one wx2.0 personal WeChat account already seen by this integration.',
          schema: setAccountEnabledSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            await this.outboundQueue.pauseOutboundAccount(integrationId, input.uuid)
            return this.success('Personal WeChat outbound account was paused.', { uuid: input.uuid })
          }),
        {
          name: WECHAT_PERSONAL_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
          description:
            'Pause outbound sending for one wx2.0 personal WeChat account. Existing queued messages are marked paused until resumed.',
          schema: outboundAccountSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            const resumed = await this.outboundQueue.resumeOutboundAccount(integrationId, input.uuid)
            return this.success('Personal WeChat outbound account was resumed.', { uuid: input.uuid, resumed })
          }),
        {
          name: WECHAT_PERSONAL_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
          description:
            'Resume outbound sending for one wx2.0 personal WeChat account and requeue paused messages.',
          schema: outboundAccountSchema
        }
      )
    ]
    return {
      name: WECHAT_PERSONAL_MIDDLEWARE_NAME,
      stateSchema: wechatPersonalScheduleStateSchema,
      tools: this.filterTools(tools, toolMode),
      wrapModelCall: async (request, handler) => {
        const runtimeScheduleState = this.resolveScheduleState(request.state, context)
        if (toolMode !== 'user' || !runtimeScheduleState.targetId) {
          return handler(request)
        }

        const guidance = [
          'This run includes a trusted Personal WeChat scheduled-send target in runtime state.',
          `Target id: ${runtimeScheduleState.targetId}.`,
          runtimeScheduleState.idempotencyKey ? `Idempotency key: ${runtimeScheduleState.idempotencyKey}.` : '',
          `After drafting the scheduled message, call ${WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME} with the final markdown content.`,
          'Do not invent or expose uuid/contactId; the middleware resolves the configured schedule target from runtime state.'
        ].filter(Boolean).join('\n')
        const baseContent = `${request.systemMessage?.content ?? ''}`.trim()
        const content = [baseContent, guidance].filter(Boolean).join('\n\n')
        return handler({
          ...request,
          systemMessage: new SystemMessage({ content })
        })
      },
      wrapToolCall: async (request, handler) => {
        const toolName =
          normalizeString(request.toolCall?.name) || normalizeString((request.tool as { name?: unknown })?.name)
        if (toolMode !== 'user' || toolName !== WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME) {
          return handler(request)
        }

        const runtimeScheduleState = this.resolveScheduleState(request.state, context)
        if (
          !runtimeScheduleState.targetId &&
          !runtimeScheduleState.idempotencyKey &&
          !runtimeScheduleState.atUsers.length &&
          !runtimeScheduleState.targetOptions
        ) {
          return handler(request)
        }

        const input = this.asRecord(request.toolCall?.args) ?? {}
        const args = {
          ...input
        } as Record<string, unknown>
        const targetId = normalizeString(args.targetId) || runtimeScheduleState.targetId
        const idempotencyKey = normalizeString(args.idempotencyKey) || runtimeScheduleState.idempotencyKey
        const atUsers = this.mergeAtUsers(runtimeScheduleState.atUsers, args.atUsers)
        if (targetId) {
          args.targetId = targetId
        }
        if (idempotencyKey) {
          args.idempotencyKey = idempotencyKey
        }
        if (atUsers.length) {
          args.atUsers = atUsers
        }
        if (runtimeScheduleState.targetOptions) {
          args.__scheduleTargetOptions = runtimeScheduleState.targetOptions
        }

        return handler({
          ...request,
          toolCall: {
            ...request.toolCall,
            args
          }
        })
      }
    }
  }

  private resolveToolMode(
    options: WechatPersonalRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): WechatPersonalRuntimeToolMode {
    const nodeOptions = context.node?.options as WechatPersonalRuntimeMiddlewareOptions | undefined
    const configuredMode = normalizeString(nodeOptions?.toolMode) || normalizeString(options?.toolMode)
    return configuredMode === 'admin' ? 'admin' : 'user'
  }

  private filterTools(tools: AgentMiddleware['tools'], toolMode: WechatPersonalRuntimeToolMode): AgentMiddleware['tools'] {
    const allowedNames = toolMode === 'user' ? WECHAT_PERSONAL_USER_TOOL_NAMES : WECHAT_PERSONAL_ADMIN_TOOL_NAMES
    return (tools ?? []).filter((item) => allowedNames.has(normalizeString((item as { name?: unknown }).name)))
  }

  private async resolveIntegrationId(
    inputIntegrationId: unknown,
    options: WechatPersonalRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): Promise<string | null> {
    const nodeOptions = context.node?.options as WechatPersonalRuntimeMiddlewareOptions | undefined
    const explicitIntegrationId =
      normalizeString(inputIntegrationId) ||
      normalizeString(options?.integrationId) ||
      normalizeString(nodeOptions?.integrationId)
    if (explicitIntegrationId) {
      return explicitIntegrationId
    }
    const xpertId = normalizeString(context.xpertId)
    return xpertId ? this.conversationService.getBoundIntegrationIdForXpert(xpertId) : null
  }

  private resolveSendTarget(
    inputTargetId: unknown,
    options: WechatPersonalRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext,
    runtimeTargetOptions?: unknown
  ): NormalizedWechatPersonalSendTarget | null {
    const targetId = normalizeString(inputTargetId)
    if (!targetId) {
      return null
    }
    const nodeOptions = context.node?.options as WechatPersonalRuntimeMiddlewareOptions | undefined
    const targets = [
      ...this.normalizeSendTargets(nodeOptions?.scheduleTargets),
      ...this.normalizeSendTargets(options?.scheduleTargets),
      ...this.normalizeSendTargets(runtimeTargetOptions ? [runtimeTargetOptions] : [])
    ]
    return targets.find((target) => target.id === targetId) ?? null
  }

  private resolveScheduleState(
    state: unknown,
    context?: IAgentMiddlewareContext
  ): WechatPersonalScheduleState {
    const root = this.asRecord(state)
    const genericSchedule = this.asRecord(root?.[XPERT_TASK_SCHEDULE_RUNTIME_STATE_KEY])
    const genericTarget = this.asRecord(genericSchedule?.target)
    const genericNodeKey = normalizeString(genericTarget?.nodeKey)
    const currentNodeKey = normalizeString(context?.node?.key)
    const useGenericSchedule = !genericNodeKey || !currentNodeKey || genericNodeKey === currentNodeKey
    const genericTargetId = useGenericSchedule
      ? normalizeString(genericTarget?.targetId) || normalizeString(genericSchedule?.targetId)
      : ''
    const genericIdempotencyKey = useGenericSchedule ? normalizeString(genericSchedule?.idempotencyKey) : ''
    const genericAtUsers = useGenericSchedule ? this.normalizeStringList(genericSchedule?.atUsers) : []
    const genericTargetOptions = useGenericSchedule
      ? this.asRecord(genericTarget?.options) ?? this.asRecord(genericSchedule?.targetOptions)
      : undefined

    const flatTargetId = normalizeString(root?.wechatPersonalScheduleTargetId)
    const flatIdempotencyKey = normalizeString(root?.wechatPersonalScheduleIdempotencyKey)
    const flatAtUsers = this.normalizeStringList(root?.wechatPersonalScheduleAtUsers)

    const schedule = this.asRecord(root?.wechatPersonalSchedule)
    const nestedTargetId = normalizeString(schedule?.targetId)
    const nestedIdempotencyKey = normalizeString(schedule?.idempotencyKey)
    const nestedAtUsers = this.normalizeStringList(schedule?.atUsers)

    const wechatPersonal = this.asRecord(root?.wechatPersonal)
    const namespacedSchedule = this.asRecord(wechatPersonal?.schedule)
    const namespacedTargetId = normalizeString(namespacedSchedule?.targetId)
    const namespacedIdempotencyKey = normalizeString(namespacedSchedule?.idempotencyKey)
    const namespacedAtUsers = this.normalizeStringList(namespacedSchedule?.atUsers)

    return {
      targetId: genericTargetId || nestedTargetId || namespacedTargetId || flatTargetId,
      idempotencyKey: genericIdempotencyKey || nestedIdempotencyKey || namespacedIdempotencyKey || flatIdempotencyKey,
      atUsers: Array.from(new Set([...genericAtUsers, ...nestedAtUsers, ...namespacedAtUsers, ...flatAtUsers])),
      ...(genericTargetOptions ? { targetOptions: genericTargetOptions } : {})
    }
  }

  private normalizeSendTargets(value: unknown): NormalizedWechatPersonalSendTarget[] {
    if (!Array.isArray(value)) {
      return []
    }
    return value.flatMap((item) => {
      const record = this.asRecord(item)
      if (!record) {
        return []
      }
      const id = normalizeString(record.id)
      const uuid = normalizeString(record.uuid)
      const contactId = normalizeString(record.contactId)
      if (!id || !uuid || !contactId) {
        return []
      }
      const chatType = record.chatType === 'private' || record.chatType === 'group'
        ? record.chatType
        : contactId.endsWith('@chatroom')
          ? 'group'
          : 'private'
      return [
        {
          id,
          uuid,
          contactId,
          name: normalizeString(record.name) || id,
          chatType,
          atUsers: this.normalizeStringList(record.atUsers)
        }
      ]
    })
  }

  private mergeAtUsers(...values: unknown[]): string[] {
    return Array.from(new Set(values.flatMap((value) => this.normalizeStringList(value))))
  }

  private normalizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return []
    }
    return value.map((item) => normalizeString(item)).filter(Boolean)
  }

  private buildOutboundToolContext(
    context: IAgentMiddlewareContext,
    integrationId: string,
    target: NormalizedWechatPersonalSendTarget,
    idempotencyKey?: string
  ): WechatPersonalChatCallbackContext {
    const rawContext = context as unknown as Record<string, unknown>
    const outboundContext = {
      organizationId: normalizeString(rawContext.organizationId) || undefined,
      userId: normalizeString(rawContext.userId) || 'agent_tool',
      xpertId: normalizeString(context.xpertId) || 'agent_tool',
      from: WECHAT_PERSONAL_MIDDLEWARE_NAME,
      channelType: 'wechat_personal',
      channelSource: 'wechat_personal_agent_tool',
      channel_source: 'wechat_personal_agent_tool',
      integrationId,
      uuid: target.uuid,
      contactId: target.contactId,
      contact_id: target.contactId,
      chatId: target.contactId,
      chat_id: target.contactId,
      chatType: target.chatType,
      chat_type: target.chatType,
      senderId: target.contactId,
      sender_id: target.contactId,
      responseStrategy: 'final_text',
      message: {
        messageId: idempotencyKey ? `agent-tool:${idempotencyKey}` : undefined,
        status: 'tool_send'
      }
    } as WechatPersonalChatCallbackContext
    const tenantId = normalizeString(rawContext.tenantId)
    if (tenantId) {
      outboundContext.tenantId = tenantId
    }
    return outboundContext
  }

  private async logDirectSendResult(
    context: WechatPersonalChatCallbackContext,
    result: WechatPersonalReplySendResult
  ): Promise<void> {
    await Promise.all(
      result.items.map((item) =>
        this.conversationService.logOutbound({
          context,
          content: item.content,
          status: item.success ? 'sent' : 'failed',
          messageId: item.messageId,
          error: item.error,
          payloadSummary: item.payloadSummary
        })
      )
    )
  }

  private idempotentOutboundResult(log: WechatPersonalMessageLogEntity): Record<string, unknown> {
    const data = {
      duplicate: true,
      outboundLogId: log.id,
      status: log.status,
      queueJobId: log.queueJobId,
      messageId: log.messageId,
      scheduledAt: log.scheduledAt,
      sentAt: log.sentAt,
      error: log.error
    }
    return log.status === 'failed' || log.status === 'cancelled'
      ? this.error('Personal WeChat message with this idempotencyKey already exists but is not deliverable.', data)
      : this.success('Personal WeChat message with this idempotencyKey already exists; duplicate send skipped.', data)
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  }

  private async safeJson(factory: () => Promise<Record<string, unknown>>): Promise<string> {
    try {
      return JSON.stringify(await factory(), null, 2)
    } catch (err) {
      return JSON.stringify(this.error(err instanceof Error ? err.message : String(err)), null, 2)
    }
  }

  private success(message: string, data?: unknown): Record<string, unknown> {
    return {
      success: true,
      message,
      data
    }
  }

  private error(message: string, data?: unknown): Record<string, unknown> {
    return {
      success: false,
      message,
      data
    }
  }

  private missingIntegrationId(): Record<string, unknown> {
    return this.error('Missing Personal WeChat integrationId. Select an integration in the middleware options first.')
  }
}
