import { Injectable } from '@nestjs/common'
import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import {
  XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY,
  XPERT_TASK_SCHEDULE_PROPERTY_PREFIX,
  type JsonSchemaObjectType,
  type TAgentMiddlewareMeta
} from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  WORKSPACE_FILES_SOURCE,
  type WorkspaceFileCatalog,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  WECHAT_FEATURE,
  WECHAT_GET_CALLBACK_CONFIG_TOOL_NAME,
  WECHAT_GET_RUNTIME_STATUS_TOOL_NAME,
  WECHAT_ICON,
  WECHAT_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_FILE_SEND_FEATURE,
  WECHAT_LIST_ACCOUNTS_TOOL_NAME,
  WECHAT_LIST_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_MIDDLEWARE_NAME,
  WECHAT_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_REVOKE_WEBHOOK_CREDENTIAL_TOOL_NAME,
  WECHAT_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_ROTATE_WEBHOOK_CREDENTIAL_TOOL_NAME,
  WECHAT_RUNTIME_FEATURE,
  WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME,
  WECHAT_SEARCH_MESSAGE_LOGS_TOOL_NAME,
  WECHAT_SEND_FILE_TOOL_NAME,
  WECHAT_SEND_MESSAGE_TOOL_NAME,
  WECHAT_SET_ACCOUNT_ENABLED_TOOL_NAME,
  WECHAT_WORKBENCH_FEATURE
} from './constants.js'
import {
  normalizeNonNegativeInt,
  normalizeString
} from './types.js'
import {
  WechatConversationService,
  type WechatChatHistoryQuery
} from './conversation.service.js'
import {
  WechatChannelStrategy,
  type WechatReplySendResult
} from './wechat-channel.strategy.js'
import {
  WechatOutboundQueueService,
  type WechatOutboundSource,
  type WechatQueuedSendResult
} from './wechat-outbound-queue.service.js'
import type { WechatMessageLogEntity } from './entities/index.js'
import type { WechatChatCallbackContext } from './handoff/wechat-chat.types.js'
import { withWechatChatContextLegacyAliases } from './handoff/wechat-chat-context.js'
import { resolveWechatConversationIdentity } from './conversation-user-key.js'
import {
  resolveWechatSendFile,
  resolveWechatSendFileFromWorkspace,
  shouldResolveWechatSendFileFromWorkspace,
  toWechatSendFileMetadata,
  type WechatResolvedSendFile,
  type WechatSendFileDescriptor
} from './wechat-send-file.js'

type WechatRuntimeMiddlewareOptions = {
  integrationId?: string
  toolMode?: WechatRuntimeToolMode
  sendMessageRandomDelay?: WechatRuntimeRandomDelayOptions
}

type WechatRuntimeToolMode = 'admin' | 'user'

type WechatRuntimeRandomDelayOptions = {
  minMs?: number
  maxMs?: number
}

type WechatRuntimeAgentMiddleware = AgentMiddleware & {
  stateFormSchema: JsonSchemaObjectType
}

type WechatScheduleTarget = {
  uuid: string
  contactId: string
  chatType?: 'private' | 'group'
  atUsers: string[]
}

type WechatScheduleState = {
  uuid?: string
  contactId?: string
  chatType?: 'private' | 'group'
  idempotencyKey?: string
  atUsers: string[]
  targets: WechatScheduleTarget[]
}

const WECHAT_SCHEDULE_UUID_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}uuid`
const WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}contact_id`
const WECHAT_SCHEDULE_CHAT_TYPE_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}chat_type`
const WECHAT_SCHEDULE_AT_USERS_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}at_users`
const CHAT_TYPE_ENUM_LABELS = {
  private: { en_US: 'Private chat', zh_Hans: '私聊' },
  group: { en_US: 'Group chat', zh_Hans: '群聊' }
}
const MAX_SEND_MESSAGE_RANDOM_DELAY_MS = 24 * 60 * 60_000

type WechatScheduleSendTarget = {
  uuid?: string
  contactId?: string
  chatType?: 'private' | 'group'
  atUsers?: string[]
}

type NormalizedWechatSendParams = Required<Pick<WechatScheduleSendTarget, 'uuid' | 'contactId'>> &
  Omit<WechatScheduleSendTarget, 'uuid' | 'contactId'> & {
    chatType: 'private' | 'group'
    atUsers: string[]
  }

type WechatRuntimeHistoryContext = {
  integrationId?: string
  uuid?: string
  contactId?: string
  chatType?: 'private' | 'group'
  senderId?: string
  senderName?: string
  sourceMessageLogIds: string[]
}

const integrationField = z.string().optional().describe('WeChat integration id. Defaults to the middleware node option.')

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

const searchMessageLogsSchema = z.object({
  integrationId: integrationField,
  direction: z.enum(['inbound', 'outbound', 'system']).optional().describe('Message direction filter.'),
  status: z.enum(['received', 'dispatched', 'history_only', 'queued', 'deferred', 'sending', 'sent', 'skipped', 'failed', 'paused', 'cancelled', 'context_reset']).optional().describe('Message status filter.'),
  search: z.string().optional().describe('Keyword for contact, sender, message id, content, error or conversation id.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Page size. Defaults to 50.')
})

const searchChatHistorySchema = z.object({
  keyword: z.string().optional().describe('Optional keyword to search inside message content.'),
  direction: z.enum(['inbound', 'outbound', 'both']).optional().describe('Direction filter. Defaults to both.'),
  before: z.string().optional().describe('Only return messages before this ISO timestamp.'),
  after: z.string().optional().describe('Only return messages after this ISO timestamp.'),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum messages to return. Defaults to 20.')
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
  logId: z.string().min(1).describe('Outbound message log id returned by wechat_list_outbound_queue.')
})

const outboundAccountSchema = z.object({
  integrationId: integrationField,
  uuid: z.string().min(1).describe('wx2.0 account uuid/key.')
})

const setAccountEnabledSchema = z.object({
  integrationId: integrationField,
  uuid: z.string().min(1).describe('wx2.0 account uuid/key.'),
  enabled: z.boolean().describe('Whether this account should accept inbound callbacks.')
})

const wechatScheduleStateSchema = z
  .object({
    [WECHAT_SCHEDULE_UUID_STATE_KEY]: z.string().min(1).describe('wx2.0 Account UUID'),
    [WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]: z
      .array(z.string().min(1))
      .min(1)
      .describe('Contact or Group IDs'),
    [WECHAT_SCHEDULE_CHAT_TYPE_STATE_KEY]: z.enum(['private', 'group']).optional().describe('Chat Type'),
    [WECHAT_SCHEDULE_AT_USERS_STATE_KEY]: z.array(z.string().min(1)).optional().describe('Default @ Users')
  })
  .passthrough()

const wechatScheduleStateFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    [WECHAT_SCHEDULE_UUID_STATE_KEY]: {
      type: 'string',
      title: {
        en_US: 'wx2.0 Account UUID',
        zh_Hans: 'wx2.0 账号 UUID'
      }
    },
    [WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]: {
      type: 'array',
      title: {
        en_US: 'Contact or Group IDs',
        zh_Hans: '联系人或群 ID'
      },
      items: {
        type: 'string'
      },
      minItems: 1
    },
    [WECHAT_SCHEDULE_CHAT_TYPE_STATE_KEY]: {
      type: 'string',
      title: {
        en_US: 'Chat Type',
        zh_Hans: '会话类型'
      },
      enum: ['private', 'group'],
      'x-ui': {
        enumLabels: CHAT_TYPE_ENUM_LABELS
      } as any
    },
    [WECHAT_SCHEDULE_AT_USERS_STATE_KEY]: {
      type: 'array',
      title: {
        en_US: 'Default @ Users',
        zh_Hans: '默认 @ 用户'
      },
      items: {
        type: 'string'
      }
    }
  },
  required: [WECHAT_SCHEDULE_UUID_STATE_KEY, WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY],
  additionalProperties: true
}

const sendMessageSchema = z.object({
  integrationId: integrationField,
  content: z
    .string()
    .min(1)
    .describe('Markdown content to send. Markdown image URLs are split and sent as WeChat images.'),
  atUsers: z.array(z.string().min(1)).optional().describe('Optional wxids to @ for text messages.'),
  idempotencyKey: z
    .string()
    .optional()
    .describe('Stable scheduler/run key. If an outbound log already exists for this key, no duplicate send is made.'),
  __wechatRuntimeSend: z
    .object({
      uuid: z.string().min(1).optional(),
      contactId: z.string().min(1).optional(),
      chatType: z.enum(['private', 'group']).optional(),
      atUsers: z.array(z.string()).optional(),
      targets: z
        .array(
          z.object({
            uuid: z.string().min(1),
            contactId: z.string().min(1),
            chatType: z.enum(['private', 'group']).optional(),
            atUsers: z.array(z.string()).optional()
          })
        )
        .optional()
    })
    .describe('Internal middleware-injected scheduled send parameters. Do not set manually.')
    .optional(),
  __wechatRuntimeSendToken: z
    .string()
    .describe('Internal middleware injection token. Do not set manually.')
    .optional()
})

// Keep the Agent-facing schema small: workspace scope lives inside platform
// fileRef objects returned by runtime capabilities, not in tool parameters.
const sendFileDescriptorSchema = z
  .object({
    path: z.string().optional().describe('Workspace file path, sandbox /workspace path, or legacy absolute local path.'),
    filePath: z.string().optional().describe('Workspace-relative file path or legacy path alias.'),
    workspacePath: z.string().optional().describe('Workspace-relative file path or sandbox /workspace path alias.'),
    fileRef: z
      .object({
        source: z.string().optional().describe('File reference source. Use platform.workspace.files for Xpert workspace files.'),
        filePath: z.string().optional().describe('Workspace-relative file path.'),
        workspacePath: z.string().optional().describe('Workspace-relative file path or sandbox /workspace path alias.')
      })
      .passthrough()
      .optional()
      .describe('Stable Xpert workspace file reference for queued/retryable file sends.'),
    originalName: z.string().optional().describe('Original filename to show in WeChat.'),
    name: z.string().optional().describe('Alias for originalName.'),
    mimeType: z.string().optional().describe('Optional MIME type.'),
    mimetype: z.string().optional().describe('Alias for mimeType.'),
    extension: z.string().optional().describe('Optional file extension without leading dot.'),
    size: z.number().int().positive().optional().describe('Optional expected file size in bytes.')
  })
  .passthrough()

// `wechat_send_file` accepts common path aliases and lets the platform resolve
// `/workspace/...` into the scoped project/Xpert workspace.
const sendFileSchema = z.object({
  integrationId: integrationField,
  file: sendFileDescriptorSchema
    .optional()
    .describe('File information returned by Xpert file tools. Include a workspace file reference, /workspace path, workspace-relative path, or legacy local path.'),
  path: z.string().optional().describe('Top-level workspace file path, sandbox /workspace path, or legacy absolute local path alias.'),
  filePath: z.string().optional().describe('Top-level workspace-relative file path alias.'),
  workspacePath: z.string().optional().describe('Top-level workspace-relative or sandbox /workspace path alias.'),
  fileRef: sendFileDescriptorSchema.shape.fileRef.optional(),
  originalName: z.string().optional().describe('Filename to show in WeChat.'),
  name: z.string().optional().describe('Alias for originalName.'),
  mimeType: z.string().optional().describe('Optional MIME type.'),
  mimetype: z.string().optional().describe('Alias for mimeType.'),
  extension: z.string().optional().describe('Optional file extension without leading dot.'),
  size: z.number().int().positive().optional().describe('Optional expected file size in bytes.'),
  idempotencyKey: z
    .string()
    .optional()
    .describe('Stable scheduler/run key. If an outbound log already exists for this key, no duplicate send is made.'),
  __wechatRuntimeSend: z
    .object({
      uuid: z.string().min(1).optional(),
      contactId: z.string().min(1).optional(),
      chatType: z.enum(['private', 'group']).optional(),
      atUsers: z.array(z.string()).optional(),
      targets: z
        .array(
          z.object({
            uuid: z.string().min(1),
            contactId: z.string().min(1),
            chatType: z.enum(['private', 'group']).optional(),
            atUsers: z.array(z.string()).optional()
          })
        )
        .optional()
    })
    .describe('Internal middleware-injected scheduled send parameters. Do not set manually.')
    .optional(),
  __wechatRuntimeSendToken: z
    .string()
    .describe('Internal middleware injection token. Do not set manually.')
    .optional()
})

const WECHAT_ADMIN_TOOL_NAMES = new Set([
  WECHAT_GET_RUNTIME_STATUS_TOOL_NAME,
  WECHAT_GET_CALLBACK_CONFIG_TOOL_NAME,
  WECHAT_LIST_ACCOUNTS_TOOL_NAME,
  WECHAT_SEARCH_MESSAGE_LOGS_TOOL_NAME,
  WECHAT_LIST_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_ROTATE_WEBHOOK_CREDENTIAL_TOOL_NAME,
  WECHAT_REVOKE_WEBHOOK_CREDENTIAL_TOOL_NAME,
  WECHAT_SET_ACCOUNT_ENABLED_TOOL_NAME
])

const WECHAT_USER_TOOL_NAMES = new Set([
  WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME,
  WECHAT_SEND_MESSAGE_TOOL_NAME,
  WECHAT_SEND_FILE_TOOL_NAME
])

const WECHAT_RUNTIME_MIDDLEWARE_META: TAgentMiddlewareMeta = {
  name: WECHAT_MIDDLEWARE_NAME,
  label: {
    en_US: 'WeChat Runtime',
    zh_Hans: '微信运行时'
  },
  description: {
    en_US: 'Expose WeChat workbench discovery and runtime management tools to an assistant.',
    zh_Hans: '为助手暴露微信工作台发现能力和运行时管理工具。'
  },
  icon: {
    type: 'svg',
    value: WECHAT_ICON,
    color: '#16a34a'
  },
  features: [WECHAT_FEATURE, WECHAT_RUNTIME_FEATURE, WECHAT_FILE_SEND_FEATURE, WECHAT_WORKBENCH_FEATURE],
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
          en_US: 'admin exposes operational tools; user exposes chat history search and controlled proactive sending.',
          zh_Hans: 'admin 暴露运维管理工具；user 暴露会话历史检索和受控主动发送工具。'
        },
        default: 'user'
      } as any,
      integrationId: {
        type: 'string',
        title: {
          en_US: 'WeChat Integration',
          zh_Hans: '微信集成'
        },
        'x-ui': {
          component: 'remoteSelect',
          selectUrl: '/api/wechat/integration-select-options'
        } as any
      },
      sendMessageRandomDelay: {
        type: 'object',
        title: {
          en_US: 'Send Message Random Delay',
          zh_Hans: '发送消息随机延迟'
        },
        description: {
          en_US: 'Adds a random extra queue delay to each wechat_send_message target. Use 0..0 to disable.',
          zh_Hans: '为每个 wechat_send_message 目标额外增加一个随机入队延迟。0..0 表示关闭。'
        },
        properties: {
          minMs: {
            type: 'number',
            minimum: 0,
            maximum: MAX_SEND_MESSAGE_RANDOM_DELAY_MS,
            title: {
              en_US: 'Minimum Delay (ms)',
              zh_Hans: '最小延迟（毫秒）'
            },
            default: 0
          },
          maxMs: {
            type: 'number',
            minimum: 0,
            maximum: MAX_SEND_MESSAGE_RANDOM_DELAY_MS,
            title: {
              en_US: 'Maximum Delay (ms)',
              zh_Hans: '最大延迟（毫秒）'
            },
            default: 0
          }
        },
        default: {
          minMs: 0,
          maxMs: 0
        }
      }
    },
    required: []
  }
}

@Injectable()
@AgentMiddlewareStrategy(WECHAT_MIDDLEWARE_NAME)
export class WechatRuntimeMiddleware
  implements IAgentMiddlewareStrategy<WechatRuntimeMiddlewareOptions>
{
  readonly meta: TAgentMiddlewareMeta = WECHAT_RUNTIME_MIDDLEWARE_META

  constructor(
    private readonly conversationService: WechatConversationService,
    private readonly wechatChannel: WechatChannelStrategy,
    private readonly outboundQueue: WechatOutboundQueueService
  ) {}

  createMiddleware(
    options: WechatRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const toolMode = this.resolveToolMode(options, context)
    const runtimeSendToken = randomUUID()
    const tools = [
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            return this.success(
              integrationId
                ? 'WeChat runtime status was returned.'
                : 'Organization WeChat runtime status was returned.',
              integrationId
                ? await this.conversationService.getRuntimeStatus(integrationId)
                : await this.conversationService.getOrganizationRuntimeStatus()
            )
          }),
        {
          name: WECHAT_GET_RUNTIME_STATUS_TOOL_NAME,
          description:
            'Get WeChat runtime status: callback URLs, tunnel connection state, trigger binding, summary counts, recent accounts and recent errors. Use for setup and operations questions.',
          schema: runtimeStatusSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            return this.success(
              'WeChat webhook credential was rotated.',
              await this.conversationService.rotateWebhookCredential(integrationId)
            )
          }),
        {
          name: WECHAT_ROTATE_WEBHOOK_CREDENTIAL_TOOL_NAME,
          description:
            'Rotate the opaque webhook credential for a WeChat integration. The previous callback URL becomes invalid; use the returned callback config to update wx2.0.',
          schema: callbackConfigSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            await this.conversationService.revokeWebhookCredential(integrationId)
            return this.success('WeChat webhook credential was revoked.', {
              integrationId
            })
          }),
        {
          name: WECHAT_REVOKE_WEBHOOK_CREDENTIAL_TOOL_NAME,
          description:
            'Revoke the active WeChat webhook credential. wx2.0 callbacks using the old URL will be rejected until a credential is rotated and the callback URL is updated.',
          schema: callbackConfigSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            if (!integrationId) {
              return this.success(
                'Organization WeChat callback configurations were returned.',
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
              return this.error(`WeChat integration "${integrationId}" was not found.`)
            }
            return this.success(
              'WeChat callback configuration was returned.',
              await this.conversationService.buildCallbackConfig(integration.id)
            )
          }),
        {
          name: WECHAT_GET_CALLBACK_CONFIG_TOOL_NAME,
          description:
            'Get the Xpert global webhook URL for configuring wx2.0 message callbacks.',
          schema: callbackConfigSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            return this.success(
              integrationId ? 'WeChat accounts were listed.' : 'Organization WeChat accounts were listed.',
              integrationId
                ? await this.conversationService.listAccounts(integrationId, input)
                : await this.conversationService.listOrganizationAccounts(input)
            )
          }),
        {
          name: WECHAT_LIST_ACCOUNTS_TOOL_NAME,
          description:
            'List wx2.0 WeChat accounts captured by callbacks, including enabled state, online status and recent errors.',
          schema: listAccountsSchema
        }
      ),
      tool(
        async (input) =>
          this.safeJson(async () => {
            const integrationId = await this.resolveIntegrationId(input.integrationId, options, context)
            return this.success(
              integrationId
                ? 'WeChat message logs were searched.'
                : 'Organization WeChat message logs were searched.',
              integrationId
                ? await this.conversationService.searchMessageLogs(integrationId, input)
                : await this.conversationService.searchOrganizationMessageLogs(input)
            )
          }),
        {
          name: WECHAT_SEARCH_MESSAGE_LOGS_TOOL_NAME,
          description:
            'Search inbound, outbound and system WeChat message logs for diagnostics and audit questions.',
          schema: searchMessageLogsSchema
        }
      ),
      tool(
        async (input, config) =>
          this.safeJson(async () => {
            const runtimeContext = this.resolveRuntimeHistoryContext(context, {
              runtime: config
            })
            const integrationId = await this.resolveIntegrationId(
              runtimeContext.integrationId,
              options,
              context
            )
            if (!integrationId) {
              return this.missingIntegrationId()
            }
            const query = this.buildChatHistoryQuery(input, runtimeContext, toolMode)
            if (!query.uuid || !query.contactId) {
              return this.error('Missing WeChat uuid or contactId. Use this tool from a WeChat conversation or a single-target WeChat scheduled task.')
            }
            return this.success(
              'WeChat chat history was returned.',
              await this.conversationService.searchChatHistory(integrationId, query)
            )
          }),
        {
          name: WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME,
          description:
            'Search concise historical messages for the current WeChat private chat or group. Use when the user asks to recall, summarize, or find previous WeChat messages. Defaults to the current WeChat conversation and never returns raw webhook payloads.',
          schema: searchChatHistorySchema
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
                ? 'WeChat outbound queue was listed.'
                : 'Organization WeChat outbound queue was listed.',
              integrationId
                ? await this.conversationService.searchMessageLogs(integrationId, query)
                : await this.conversationService.searchOrganizationMessageLogs(query)
            )
          }),
        {
          name: WECHAT_LIST_OUTBOUND_QUEUE_TOOL_NAME,
          description:
            'List queued, deferred, sending, paused, failed, cancelled or sent outbound WeChat messages by message log id and queue job id.',
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
            const sendTargets =
              input.__wechatRuntimeSendToken === runtimeSendToken
                ? this.normalizeRuntimeSendTargets(input.__wechatRuntimeSend)
                : []
            if (!sendTargets.length) {
              return this.error('WeChat scheduled send parameters were not provided in runtime state.')
            }
            const targetResults = []
            const baseIdempotencyKey = normalizeString(input.idempotencyKey)
            const source: WechatOutboundSource = baseIdempotencyKey ? 'scheduled_agent' : 'agent_tool'
            for (let index = 0; index < sendTargets.length; index += 1) {
              const sendParams = sendTargets[index]
              const idempotencyKey = this.resolveTargetIdempotencyKey(
                baseIdempotencyKey,
                sendParams,
                index,
                sendTargets.length
              )
              if (idempotencyKey) {
                const existing = await this.conversationService.findOutboundByIdempotencyKey(integrationId, idempotencyKey)
                if (existing) {
                  if (sendTargets.length === 1) {
                    return this.idempotentOutboundResult(existing)
                  }
                  targetResults.push(this.describeIdempotentOutbound(sendParams, idempotencyKey, existing))
                  continue
                }
              }

              const outboundContext = this.buildOutboundToolContext(context, integrationId, sendParams, idempotencyKey)
              const delayMs = this.resolveSendMessageRandomDelayMs(options, context)
              const result = await this.wechatChannel.sendReplyByIntegrationId(integrationId, {
                uuid: sendParams.uuid,
                contactId: sendParams.contactId,
                content: input.content,
                atUsers: this.mergeAtUsers(sendParams.atUsers, input.atUsers),
                context: outboundContext,
                source,
                idempotencyKey,
                delayMs
              })

              if (!result.queued) {
                await this.logDirectSendResult(outboundContext, result)
              }

              targetResults.push({
                uuid: sendParams.uuid,
                contactId: sendParams.contactId,
                chatType: sendParams.chatType,
                ...(idempotencyKey ? { idempotencyKey } : {}),
                ...result
              })
            }

            const data = this.buildMultiTargetSendResult(targetResults)
            return data.failureCount > 0
              ? this.error('WeChat message delivery failed for one or more targets.', data)
              : this.success(
                  sendTargets.length === 1
                    ? 'WeChat message was submitted for delivery.'
                    : `WeChat message was submitted for delivery to ${sendTargets.length} targets.`,
                  data
                )
          }),
        {
          name: WECHAT_SEND_MESSAGE_TOOL_NAME,
          description:
            'Send a proactive WeChat message using trusted scheduled task state. Use for scheduled Agent jobs such as daily news.',
          schema: sendMessageSchema
        }
      ),
      tool(
        async (input, config) =>
          this.safeJson(async () =>
            this.sendFileFromTool(
              this.asRecord(input) ?? {},
              config,
              runtimeSendToken,
              options,
              context
            )
          ),
        {
          name: WECHAT_SEND_FILE_TOOL_NAME,
          description:
            'Send a generated or edited file to the current WeChat user/group, or to trusted scheduled WeChat targets. Pass a Xpert workspace file reference, a sandbox /workspace path, a workspace-relative path, or a legacy absolute local path; the middleware validates the file and sends bytes through wx2.0.',
          schema: sendFileSchema
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
              ? this.success('WeChat outbound queue item was cancelled.', result)
              : this.error(result.message || 'WeChat outbound queue item could not be cancelled.', result)
          }),
        {
          name: WECHAT_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
          description: 'Cancel one queued/deferred WeChat outbound message by outbound message log id.',
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
              ? this.success('WeChat outbound queue item was retried.', result)
              : this.error(result.message || 'WeChat outbound queue item could not be retried.', result)
          }),
        {
          name: WECHAT_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
          description: 'Retry one failed, cancelled or paused WeChat outbound message by outbound message log id.',
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
            await this.conversationService.setAccountEnabled(integrationId, input.uuid, input.enabled)
            return this.success('WeChat account enabled state was updated.', {
              uuid: input.uuid,
              enabled: input.enabled
            })
          }),
        {
          name: WECHAT_SET_ACCOUNT_ENABLED_TOOL_NAME,
          description:
            'Enable or disable inbound processing for one wx2.0 WeChat account already seen by this integration.',
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
            return this.success('WeChat outbound account was paused.', { uuid: input.uuid })
          }),
        {
          name: WECHAT_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
          description:
            'Pause outbound sending for one wx2.0 WeChat account. Existing queued messages are marked paused until resumed.',
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
            return this.success('WeChat outbound account was resumed.', { uuid: input.uuid, resumed })
          }),
        {
          name: WECHAT_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
          description:
            'Resume outbound sending for one wx2.0 WeChat account and requeue paused messages.',
          schema: outboundAccountSchema
        }
      )
    ]
    const runtimeMiddleware = {
      name: WECHAT_MIDDLEWARE_NAME,
      stateSchema: wechatScheduleStateSchema,
      stateFormSchema: wechatScheduleStateFormSchema,
      tools: this.filterTools(tools, toolMode),
      wrapModelCall: async (request, handler) => {
        const runtimeScheduleState = this.resolveScheduleState(request.state)
        if (toolMode !== 'user' || !runtimeScheduleState.targets.length) {
          return handler(request)
        }

        const guidance = [
          'This run includes trusted WeChat scheduled-send parameters in runtime state.',
          `Target count: ${runtimeScheduleState.targets.length}.`,
          runtimeScheduleState.idempotencyKey ? `Idempotency key: ${runtimeScheduleState.idempotencyKey}.` : '',
          runtimeScheduleState.targets.length === 1
            ? `You may call ${WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME} to search this scheduled target's chat history before drafting.`
            : `Do not call ${WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME} in this multi-target scheduled run; split the task per target when history is needed.`,
          `After drafting the scheduled message, call ${WECHAT_SEND_MESSAGE_TOOL_NAME} with the final markdown content.`,
          `If the scheduled run needs to deliver a generated or edited local file, call ${WECHAT_SEND_FILE_TOOL_NAME} with the returned file path instead of exposing the path to the WeChat user.`,
          'Do not expose uuid/contactId/contactIds in the user-facing message; the middleware injects those destination parameters into the send tool from runtime state.'
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
        if (toolMode !== 'user') {
          return handler(request)
        }

        const isScheduledSendTool =
          toolName === WECHAT_SEND_MESSAGE_TOOL_NAME || toolName === WECHAT_SEND_FILE_TOOL_NAME
        const isChatHistoryTool = toolName === WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME
        if (!isScheduledSendTool && !isChatHistoryTool) {
          return handler(request)
        }

        const runtimeScheduleState = this.resolveScheduleState(request.state)
        if (
          !runtimeScheduleState.targets.length &&
          !runtimeScheduleState.idempotencyKey &&
          !runtimeScheduleState.atUsers.length
        ) {
          return handler(request)
        }

        if (isChatHistoryTool) {
          if (!runtimeScheduleState.targets.length) {
            return handler(request)
          }

          const runtimeContext = this.resolveRuntimeHistoryContext(context, {
            runtime: request.runtime
          })
          if (runtimeContext.uuid && runtimeContext.contactId) {
            return handler(request)
          }

          if (runtimeScheduleState.targets.length > 1) {
            return JSON.stringify(
              this.error(
                'WeChat scheduled chat history search requires exactly one target. Split the schedule per contact/group when target-specific history is needed.',
                {
                  targetCount: runtimeScheduleState.targets.length,
                  targets: runtimeScheduleState.targets.map((target) => ({
                    uuid: target.uuid,
                    contactId: target.contactId,
                    chatType: target.chatType
                  }))
                }
              ),
              null,
              2
            )
          }

          return handler({
            ...request,
            runtime: this.withScheduledHistoryRuntimeContext(
              request.runtime,
              runtimeScheduleState.targets[0]
            )
          })
        }

        const input = this.asRecord(request.toolCall?.args) ?? {}
        const args = {
          ...input
        } as Record<string, unknown>
        const idempotencyKey = normalizeString(args.idempotencyKey) || runtimeScheduleState.idempotencyKey
        if (idempotencyKey) {
          args.idempotencyKey = idempotencyKey
        }
        if (toolName === WECHAT_SEND_MESSAGE_TOOL_NAME) {
          const atUsers = this.mergeAtUsers(runtimeScheduleState.atUsers, args.atUsers)
          if (atUsers.length) {
            args.atUsers = atUsers
          }
        }
        if (runtimeScheduleState.targets.length) {
          args.__wechatRuntimeSend = {
            targets: runtimeScheduleState.targets.map((target) => ({
              uuid: target.uuid,
              contactId: target.contactId,
              ...(target.chatType ? { chatType: target.chatType } : {}),
              ...(target.atUsers.length ? { atUsers: target.atUsers } : {})
            }))
          }
          args.__wechatRuntimeSendToken = runtimeSendToken
        }

        return handler({
          ...request,
          toolCall: {
            ...request.toolCall,
            args
          }
        })
      }
    } satisfies WechatRuntimeAgentMiddleware
    return runtimeMiddleware
  }

  private withScheduledHistoryRuntimeContext(
    runtime: unknown,
    target: WechatScheduleTarget
  ): Record<string, unknown> {
    const runtimeRecord = this.asRecord(runtime) ?? {}
    const configurableRecord = this.asRecord(runtimeRecord.configurable) ?? {}
    const contextRecord = this.asRecord(configurableRecord.context) ?? {}
    const contactId = target.contactId
    return {
      ...runtimeRecord,
      configurable: {
        ...configurableRecord,
        context: {
          ...contextRecord,
          uuid: target.uuid,
          contactId,
          chatId: contactId,
          chatType: target.chatType || (contactId.endsWith('@chatroom') ? 'group' : 'private')
        }
      }
    }
  }

  private async sendFileFromTool(
    input: Record<string, unknown>,
    runtime: unknown,
    runtimeSendToken: string,
    options: WechatRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): Promise<Record<string, unknown>> {
    const runtimeContext = this.resolveRuntimeHistoryContext(context, {
      runtime
    })
    const integrationId = await this.resolveIntegrationId(
      normalizeString(input.integrationId) || runtimeContext.integrationId,
      options,
      context
    )
    if (!integrationId) {
      return this.missingIntegrationId()
    }

    const targetResolution = this.resolveFileSendTargets(input, runtimeSendToken, runtimeContext)
    if (targetResolution.error) {
      return this.error(targetResolution.error)
    }
    const sendTargets = targetResolution.targets
    if (!sendTargets.length) {
      return this.error('WeChat file send target was not available. Use this tool from a WeChat conversation or trusted scheduled state.')
    }

    const file = await this.resolveSendFileFromToolDescriptor(this.buildSendFileDescriptor(input), context)
    const validatedFile = toWechatSendFileMetadata(file)
    const targetResults: Array<Record<string, unknown>> = []
    const baseIdempotencyKey = normalizeString(input.idempotencyKey)
    const source: WechatOutboundSource =
      targetResolution.scheduled && baseIdempotencyKey ? 'scheduled_agent' : 'agent_tool'

    for (let index = 0; index < sendTargets.length; index += 1) {
      const sendParams = sendTargets[index]
      const idempotencyKey = this.resolveTargetIdempotencyKey(
        baseIdempotencyKey,
        sendParams,
        index,
        sendTargets.length
      )
      if (idempotencyKey) {
        const existing = await this.conversationService.findOutboundByIdempotencyKey(integrationId, idempotencyKey)
        if (existing) {
          targetResults.push(this.describeIdempotentOutbound(sendParams, idempotencyKey, existing))
          continue
        }
      }

      const outboundContext = this.buildOutboundToolContext(context, integrationId, sendParams, idempotencyKey)
      const result = await this.wechatChannel.sendFileByIntegrationId(integrationId, {
        uuid: sendParams.uuid,
        contactId: sendParams.contactId,
        file,
        context: outboundContext,
        source,
        idempotencyKey
      })

      if (!result.queued) {
        await this.logDirectFileSendResult(outboundContext, file, result, source, idempotencyKey)
      }

      targetResults.push({
        uuid: sendParams.uuid,
        contactId: sendParams.contactId,
        chatType: sendParams.chatType,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...result
      })
    }

    const sendResult = this.buildMultiTargetSendResult(targetResults)
    const data = {
      validatedFile,
      ...sendResult
    }
    return sendResult.failureCount > 0
      ? this.error('WeChat file delivery failed for one or more targets.', data)
      : this.success(
          sendTargets.length === 1
            ? 'WeChat file was submitted for delivery.'
            : `WeChat file was submitted for delivery to ${sendTargets.length} targets.`,
          data
        )
  }

  private resolveFileSendTargets(
    input: Record<string, unknown>,
    runtimeSendToken: string,
    runtimeContext: WechatRuntimeHistoryContext
  ): { targets: NormalizedWechatSendParams[]; scheduled: boolean; error?: string } {
    const hasInternalSendArgs = Boolean(input.__wechatRuntimeSend || input.__wechatRuntimeSendToken)
    if (input.__wechatRuntimeSendToken === runtimeSendToken) {
      const targets = this.normalizeRuntimeSendTargets(input.__wechatRuntimeSend)
      if (targets.length) {
        return { targets, scheduled: true }
      }
      return {
        targets: [],
        scheduled: true,
        error: 'WeChat scheduled send parameters were not provided in runtime state.'
      }
    }
    if (hasInternalSendArgs) {
      return {
        targets: [],
        scheduled: false,
        error: 'WeChat scheduled send parameters were not provided in runtime state.'
      }
    }

    return {
      targets: this.normalizeUniqueSendTargets([
        {
          uuid: runtimeContext.uuid,
          contactId: runtimeContext.contactId,
          chatType: runtimeContext.chatType
        }
      ]),
      scheduled: false
    }
  }

  /**
   * Collapse top-level tool arguments and nested file descriptors into the
   * compact file contract consumed by the send-file resolver.
   */
  private buildSendFileDescriptor(input: Record<string, unknown>): WechatSendFileDescriptor {
    const file = this.asRecord(input.file) ?? {}
    const fileRef = this.asRecord(file.fileRef) ?? this.asRecord(input.fileRef)
    const records = [file, input]
    return {
      path: this.readFirstString(records, ['path']),
      filePath: this.readFirstString(records, ['filePath', 'file_path']),
      workspacePath: this.readFirstString(records, ['workspacePath', 'workspace_path']),
      fileRef: fileRef
        ? {
            source: this.readFirstString([fileRef], ['source']),
            filePath: this.readFirstString([fileRef], ['filePath', 'file_path']),
            workspacePath: this.readFirstString([fileRef], ['workspacePath', 'workspace_path']),
            tenantId: this.readFirstString([fileRef], ['tenantId', 'tenant_id']),
            userId: this.readFirstString([fileRef], ['userId', 'user_id']),
            catalog: this.readFirstString([fileRef], ['catalog']) as WorkspaceFileCatalog | undefined,
            scopeId: this.readFirstString([fileRef], ['scopeId', 'scope_id']),
            projectId: this.readFirstString([fileRef], ['projectId', 'project_id']),
            knowledgeId: this.readFirstString([fileRef], ['knowledgeId', 'knowledge_id']),
            rootId: this.readFirstString([fileRef], ['rootId', 'root_id']),
            xpertId: this.readFirstString([fileRef], ['xpertId', 'xpert_id']),
            isolateByUser: this.readFirstBoolean([fileRef], ['isolateByUser', 'isolate_by_user'])
          }
        : undefined,
      originalName: this.readFirstString(records, ['originalName', 'original_name', 'filename', 'fileName']),
      name: this.readFirstString(records, ['name']),
      mimeType: this.readFirstString(records, ['mimeType', 'mime_type', 'contentType', 'content_type']),
      mimetype: this.readFirstString(records, ['mimetype']),
      extension: this.readFirstString(records, ['extension', 'ext']),
      size: this.readFirstNumber(records, ['size'])
    }
  }

  /**
   * Resolve tool file input through platform workspace files when possible,
   * falling back only for legacy host-readable absolute paths.
   */
  private async resolveSendFileFromToolDescriptor(
    descriptor: WechatSendFileDescriptor,
    context: IAgentMiddlewareContext
  ): Promise<WechatResolvedSendFile> {
    if (!shouldResolveWechatSendFileFromWorkspace(descriptor)) {
      return resolveWechatSendFile(descriptor)
    }

    const workspaceFiles = context.runtime?.capabilities?.get<Pick<WorkspaceFilesApi, 'readRuntimeBuffer'>>(WORKSPACE_FILES_SOURCE)
    if (!workspaceFiles?.readRuntimeBuffer) {
      throw new Error('微信文件发送需要 platform.workspace.files runtime capability 才能读取 workspace 文件。')
    }

    return resolveWechatSendFileFromWorkspace(descriptor, {
      workspaceFiles
    })
  }

  private async logDirectFileSendResult(
    context: WechatChatCallbackContext,
    file: WechatResolvedSendFile,
    result: WechatQueuedSendResult,
    source: WechatOutboundSource,
    idempotencyKey?: string
  ): Promise<void> {
    await this.conversationService.logOutbound({
      context,
      content: file.fileName,
      status: result.success ? 'sent' : 'failed',
      messageId: result.messageId,
      error: result.error,
      payloadSummary: JSON.stringify({
        type: 'file',
        source,
        ...toWechatSendFileMetadata(file),
        ...(idempotencyKey ? { idempotencyKey } : {})
      })
    })
  }

  private resolveToolMode(
    options: WechatRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): WechatRuntimeToolMode {
    const nodeOptions = context.node?.options as WechatRuntimeMiddlewareOptions | undefined
    const configuredMode = normalizeString(nodeOptions?.toolMode) || normalizeString(options?.toolMode)
    return configuredMode === 'admin' ? 'admin' : 'user'
  }

  private resolveSendMessageRandomDelayMs(
    options: WechatRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): number {
    const nodeOptions = context.node?.options as WechatRuntimeMiddlewareOptions | undefined
    const range = this.resolveRandomDelayRange(
      nodeOptions?.sendMessageRandomDelay ?? options?.sendMessageRandomDelay
    )
    if (range.maxMs <= 0) {
      return 0
    }
    if (range.minMs === range.maxMs) {
      return range.minMs
    }
    return range.minMs + Math.floor(Math.random() * (range.maxMs - range.minMs + 1))
  }

  private resolveRandomDelayRange(value: unknown): Required<WechatRuntimeRandomDelayOptions> {
    const record = this.asRecord(value)
    const minMs = normalizeNonNegativeInt(record?.minMs, 0, MAX_SEND_MESSAGE_RANDOM_DELAY_MS)
    const maxMs = normalizeNonNegativeInt(record?.maxMs, 0, MAX_SEND_MESSAGE_RANDOM_DELAY_MS)
    return minMs <= maxMs ? { minMs, maxMs } : { minMs: maxMs, maxMs: minMs }
  }

  private filterTools(tools: AgentMiddleware['tools'], toolMode: WechatRuntimeToolMode): AgentMiddleware['tools'] {
    const allowedNames = toolMode === 'user' ? WECHAT_USER_TOOL_NAMES : WECHAT_ADMIN_TOOL_NAMES
    return (tools ?? []).filter((item) => allowedNames.has(normalizeString((item as { name?: unknown }).name)))
  }

  private async resolveIntegrationId(
    inputIntegrationId: unknown,
    options: WechatRuntimeMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): Promise<string | null> {
    const nodeOptions = context.node?.options as WechatRuntimeMiddlewareOptions | undefined
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

  private buildChatHistoryQuery(
    input: Record<string, unknown>,
    runtimeContext: WechatRuntimeHistoryContext,
    toolMode: WechatRuntimeToolMode
  ): WechatChatHistoryQuery {
    const contactId = runtimeContext.contactId
    return {
      uuid: runtimeContext.uuid,
      contactId,
      chatType: runtimeContext.chatType || (contactId?.endsWith('@chatroom') ? 'group' : 'private'),
      keyword: normalizeString(input.keyword) || undefined,
      direction: input.direction === 'inbound' || input.direction === 'outbound' || input.direction === 'both'
        ? input.direction
        : undefined,
      before: normalizeString(input.before) || undefined,
      after: normalizeString(input.after) || undefined,
      limit: typeof input.limit === 'number' ? input.limit : undefined,
      excludedLogIds: runtimeContext.sourceMessageLogIds,
      enforceTriggerFilters: toolMode === 'user'
    }
  }

  private resolveRuntimeHistoryContext(
    context: IAgentMiddlewareContext,
    request?: unknown
  ): WechatRuntimeHistoryContext {
    const requestRecord = this.asRecord(request)
    const runtimeRecord = this.asRecord(requestRecord?.runtime)
    const configurableRecord = this.asRecord(runtimeRecord?.configurable)
    const runtimeContextRecord = this.asRecord(configurableRecord?.context)
    const metadataRecord = this.asRecord(runtimeRecord?.metadata)
    const metadataContextRecord = this.asRecord(metadataRecord?.context)
    const records = [runtimeContextRecord, metadataContextRecord]

    const integrationId =
      this.readFirstString(records, ['integrationId', 'sourceIntegrationId']) ||
      this.readFirstString([this.asRecord(configurableRecord?.runtimePrincipal)], ['sourceIntegrationId'])
    const contactId = this.readFirstString(records, ['contactId', 'contact_id', 'chatId', 'chat_id'])
    const chatType = this.normalizeChatType(this.readFirstString(records, ['chatType', 'chat_type']))

    return {
      integrationId,
      uuid: this.readFirstString(records, ['uuid']),
      contactId,
      chatType: chatType || (contactId?.endsWith('@chatroom') ? 'group' : undefined),
      senderId: this.readFirstString(records, ['senderId', 'sender_id', 'channelUserId']),
      senderName: this.readFirstString(records, ['senderName', 'sender_name', 'channelUserName']),
      sourceMessageLogIds: this.readFirstStringList(records, ['sourceMessageLogIds', 'currentInboundLogIds'])
    }
  }

  private readFirstString(
    records: Array<Record<string, unknown> | null | undefined>,
    keys: string[]
  ): string | undefined {
    for (const record of records) {
      if (!record) {
        continue
      }
      for (const key of keys) {
        const value = normalizeString(record[key])
        if (value) {
          return value
        }
      }
    }
    return undefined
  }

  private readFirstNumber(
    records: Array<Record<string, unknown> | null | undefined>,
    keys: string[]
  ): number | undefined {
    for (const record of records) {
      if (!record) {
        continue
      }
      for (const key of keys) {
        const value = record[key]
        const numberValue = typeof value === 'number' ? value : Number(value)
        if (Number.isFinite(numberValue) && numberValue > 0) {
          return Math.floor(numberValue)
        }
      }
    }
    return undefined
  }

  private readFirstBoolean(
    records: Array<Record<string, unknown> | null | undefined>,
    keys: string[]
  ): boolean | undefined {
    for (const record of records) {
      if (!record) {
        continue
      }
      for (const key of keys) {
        const value = record[key]
        if (typeof value === 'boolean') {
          return value
        }
      }
    }
    return undefined
  }

  private readFirstStringList(
    records: Array<Record<string, unknown> | null | undefined>,
    keys: string[]
  ): string[] {
    const values = new Set<string>()
    for (const record of records) {
      if (!record) {
        continue
      }
      for (const key of keys) {
        this.normalizeStringList(record[key]).forEach((value) => values.add(value))
      }
    }
    return Array.from(values)
  }

  private resolveScheduleState(state: unknown): WechatScheduleState {
    const root = this.asRecord(state)
    const idempotencyKey = normalizeString(root?.[XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY])
    const uuid = normalizeString(root?.[WECHAT_SCHEDULE_UUID_STATE_KEY])
    const contactIds = this.normalizeStringList(root?.[WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY])
    const contactId = contactIds[0] ?? ''
    const chatType = this.normalizeChatType(root?.[WECHAT_SCHEDULE_CHAT_TYPE_STATE_KEY])
    const atUsers = this.normalizeStringList(root?.[WECHAT_SCHEDULE_AT_USERS_STATE_KEY])
    const targets = this.normalizeUniqueSendTargets(
      contactIds.map((targetContactId) => ({
        uuid,
        contactId: targetContactId,
        chatType: chatType || (targetContactId.endsWith('@chatroom') ? 'group' : 'private'),
        atUsers
      }))
    )

    return {
      uuid,
      contactId,
      chatType: chatType || (contactId.endsWith('@chatroom') ? 'group' : 'private'),
      idempotencyKey,
      atUsers,
      targets
    }
  }

  private normalizeRuntimeSendTargets(value: unknown): NormalizedWechatSendParams[] {
    const record = this.asRecord(value)
    if (!record) {
      return []
    }
    const rawTargets = Array.isArray(record.targets) ? record.targets : [record]
    return this.normalizeUniqueSendTargets(
      rawTargets.map((item) => {
        const target = this.asRecord(item)
        if (!target) {
          return null
        }
        const uuid = normalizeString(target.uuid)
        const contactId = normalizeString(target.contactId)
        if (!uuid || !contactId) {
          return null
        }
        return {
          uuid,
          contactId,
          chatType: this.normalizeChatType(target.chatType) || (contactId.endsWith('@chatroom') ? 'group' : 'private'),
          atUsers: this.normalizeStringList(target.atUsers)
        }
      })
    )
  }

  private normalizeUniqueSendTargets(
    targets: Array<WechatScheduleSendTarget | null | undefined>
  ): NormalizedWechatSendParams[] {
    const unique = new Map<string, NormalizedWechatSendParams>()
    for (const target of targets) {
      if (!target) {
        continue
      }
      const uuid = normalizeString(target.uuid)
      const contactId = normalizeString(target.contactId)
      if (!uuid || !contactId) {
        continue
      }
      const normalized: NormalizedWechatSendParams = {
        uuid,
        contactId,
        chatType: this.normalizeChatType(target.chatType) || (contactId.endsWith('@chatroom') ? 'group' : 'private'),
        atUsers: this.normalizeStringList(target.atUsers)
      }
      const key = `${normalized.uuid}\n${normalized.contactId}`
      if (!unique.has(key)) {
        unique.set(key, normalized)
      }
    }
    return Array.from(unique.values())
  }

  private normalizeChatType(value: unknown): 'private' | 'group' | undefined {
    return value === 'private' || value === 'group' ? value : undefined
  }

  private mergeAtUsers(...values: unknown[]): string[] {
    return Array.from(new Set(values.flatMap((value) => this.normalizeStringList(value))))
  }

  private normalizeStringList(value: unknown): string[] {
    if (typeof value === 'string') {
      return value
        .split(/[,\n，]/)
        .map((item) => normalizeString(item))
        .filter(Boolean)
    }
    if (!Array.isArray(value)) {
      return []
    }
    return value.map((item) => normalizeString(item)).filter(Boolean)
  }

  private resolveTargetIdempotencyKey(
    baseIdempotencyKey: string,
    target: NormalizedWechatSendParams,
    index: number,
    total: number
  ): string | undefined {
    if (!baseIdempotencyKey) {
      return undefined
    }
    if (total <= 1) {
      return baseIdempotencyKey
    }
    return [
      baseIdempotencyKey,
      'target',
      encodeURIComponent(target.uuid),
      encodeURIComponent(target.contactId || String(index + 1))
    ].join(':')
  }

  private describeIdempotentOutbound(
    target: NormalizedWechatSendParams,
    idempotencyKey: string,
    log: WechatMessageLogEntity
  ): Record<string, unknown> {
    return {
      uuid: target.uuid,
      contactId: target.contactId,
      chatType: target.chatType,
      idempotencyKey,
      duplicate: true,
      success: log.status !== 'failed' && log.status !== 'cancelled',
      outboundLogId: log.id,
      status: log.status,
      queueJobId: log.queueJobId,
      messageId: log.messageId,
      scheduledAt: log.scheduledAt,
      sentAt: log.sentAt,
      error: log.error
    }
  }

  private buildMultiTargetSendResult(targetResults: Array<Record<string, unknown>>): Record<string, unknown> & {
    failureCount: number
  } {
    const successCount = targetResults.filter((item) => item.success !== false).length
    const failureCount = targetResults.length - successCount
    const duplicateCount = targetResults.filter((item) => item.duplicate === true).length
    const summary = {
      targetCount: targetResults.length,
      successCount,
      failureCount,
      duplicateCount,
      targets: targetResults
    }
    return targetResults.length === 1
      ? {
          ...targetResults[0],
          ...summary
        }
      : summary
  }

  private buildOutboundToolContext(
    context: IAgentMiddlewareContext,
    integrationId: string,
    sendParams: NormalizedWechatSendParams,
    idempotencyKey?: string
  ): WechatChatCallbackContext {
    const rawContext = context as unknown as Record<string, unknown>
    const outboundContext = {
      organizationId: normalizeString(rawContext.organizationId) || undefined,
      userId: normalizeString(rawContext.userId) || 'agent_tool',
      xpertId: normalizeString(context.xpertId) || 'agent_tool',
      from: WECHAT_MIDDLEWARE_NAME,
      channelType: 'wechat',
      channelSource: 'wechat_agent_tool',
      integrationId,
      uuid: sendParams.uuid,
      contactId: sendParams.contactId,
      chatId: sendParams.contactId,
      chatType: sendParams.chatType,
      senderId: sendParams.contactId,
      responseStrategy: 'final_text',
      message: {
        messageId: idempotencyKey ? `agent-tool:${idempotencyKey}` : undefined,
        status: 'tool_send'
      }
    } as WechatChatCallbackContext
    const identity = resolveWechatConversationIdentity({
      integrationId,
      uuid: sendParams.uuid,
      contactId: sendParams.contactId,
      senderId: sendParams.contactId,
      chatType: sendParams.chatType,
      isSelf: false
    })
    if (identity) {
      outboundContext.contactId = identity.contactId
      outboundContext.chatId = identity.contactId
      outboundContext.chatType = identity.chatType
      outboundContext.senderId = identity.senderId
      outboundContext.conversationUserKey = identity.conversationUserKey
    }
    const tenantId = normalizeString(rawContext.tenantId)
    if (tenantId) {
      outboundContext.tenantId = tenantId
    }
    return withWechatChatContextLegacyAliases(outboundContext)
  }

  private async logDirectSendResult(
    context: WechatChatCallbackContext,
    result: WechatReplySendResult
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

  private idempotentOutboundResult(log: WechatMessageLogEntity): Record<string, unknown> {
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
      ? this.error('WeChat message with this idempotencyKey already exists but is not deliverable.', data)
      : this.success('WeChat message with this idempotencyKey already exists; duplicate send skipped.', data)
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
    return this.error('Missing WeChat integrationId. Select an integration in the middleware options first.')
  }
}
