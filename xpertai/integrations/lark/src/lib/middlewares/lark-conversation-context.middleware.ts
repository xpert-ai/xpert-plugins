import { SystemMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { InferInteropZodInput, interopSafeParse } from '@langchain/core/utils/types'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import type { TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { getToolCallIdFromConfig } from '../contracts-compat.js'
import { LarkContextToolService } from '../lark-context-tool.service.js'
import { iconImage } from '../types.js'

const LARK_CONVERSATION_CONTEXT_MIDDLEWARE_NAME = 'LarkConversationContextMiddleware'
const DEFAULT_TIMEOUT_MS = 10000
const DEFAULT_PAGE_SIZE = 20

const middlewareConfigSchema = z.object({
  integrationId: z.string().optional().nullable(),
  defaults: z
    .object({
      timeoutMs: z.number().int().min(100).default(DEFAULT_TIMEOUT_MS),
      pageSize: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
      resourceContentMode: z.enum(['metadata', 'base64']).default('metadata')
    })
    .default({})
})

const middlewareStateSchema = z.object({
  lark_conversation_context_last_result: z.record(z.any()).nullable().default(null),
  lark_conversation_context_current_chat_id: z.string().default(''),
  lark_conversation_context_current_chat_type: z.string().default(''),
  lark_conversation_context_current_sender_open_id: z.string().default(''),
  lark_conversation_context_current_sender_name: z.string().default(''),
  lark_conversation_context_agent_guidance: z.string().default('')
})

const listMessagesSchema = z.object({
  containerIdType: z
    .enum(['chat', 'user'])
    .optional()
    .nullable()
    .describe(
      'Conversation container type. If omitted, the tool defaults to the current Lark chat. Use chat for the current group or private chat history.'
    ),
  containerId: z
    .string()
    .optional()
    .nullable()
    .describe(
      'Conversation container id. If omitted, the tool defaults to the current Lark chat_id. For chat containers use chat_id (usually oc_), not message_id (usually om_).'
    ),
  startTime: z.string().optional().nullable().describe('Optional start timestamp in milliseconds.'),
  endTime: z.string().optional().nullable().describe('Optional end timestamp in milliseconds.'),
  sortType: z
    .enum(['ByCreateTimeAsc', 'ByCreateTimeDesc'])
    .optional()
    .nullable()
    .describe('Message order, default is descending by create time.'),
  pageSize: z.number().int().min(1).max(100).optional().nullable().describe('Page size, default comes from middleware config.'),
  pageToken: z.string().optional().nullable().describe('Pagination token from the previous response.'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds.')
})

const getMessageSchema = z.object({
  messageId: z.string().describe('Lark message id to fetch.'),
  userIdType: z
    .enum(['open_id', 'user_id', 'union_id'])
    .optional()
    .nullable()
    .describe('Optional sender id type for the response payload.'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds.')
})

const getMessageResourceSchema = z.object({
  messageId: z.string().describe('Lark message id that owns the resource.'),
  fileKey: z.string().describe('Resource file key extracted from a message resource reference.'),
  type: z.enum(['file', 'image', 'audio', 'media']).describe('Resource type expected by Lark message resource API.'),
  contentMode: z
    .enum(['metadata', 'base64'])
    .optional()
    .nullable()
    .describe('metadata only returns headers-derived metadata; base64 also inlines the binary payload.'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds.')
})

type LarkConversationContextMiddlewareConfig = InferInteropZodInput<typeof middlewareConfigSchema>

type ResolvedCurrentLarkContext = {
  chatId: string | null
  chatType: string | null
  senderOpenId: string | null
  senderName: string | null
}

type ResolvedListMessagesContainer = {
  containerIdType: 'chat' | 'user'
  containerId: string
  source: 'explicit' | 'current-chat' | 'current-user'
}

function getCurrentStateSafe() {
  try {
    return (getCurrentTaskInput<Record<string, unknown>>() ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

function getValueByPath(source: Record<string, unknown>, path: string): unknown {
  if (!path?.trim()) {
    return undefined
  }

  const normalized = path.trim().replace(/\[(\d+)\]/g, '.$1')
  const segments = normalized.split('.').filter(Boolean)
  let current: unknown = source

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

function normalizeTimeout(value: unknown, fallback: number): number {
  const timeout = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(timeout) && timeout >= 100) {
    return timeout
  }
  return fallback
}

function normalizePageSize(value: unknown, fallback: number): number {
  const pageSize = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(pageSize) && pageSize >= 1 && pageSize <= 100) {
    return Math.floor(pageSize)
  }
  return fallback
}

function toToolMessageContent(result: Record<string, unknown>) {
  return JSON.stringify(result)
}

function toSystemMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as Record<string, unknown>).text ?? '')
        }
        return JSON.stringify(item)
      })
      .join('\n')
  }
  if (content == null) {
    return ''
  }
  return String(content)
}

function resolveFirstStringByPaths(source: Record<string, unknown>, paths: readonly string[]): string | null {
  for (const path of paths) {
    const value = getValueByPath(source, path)
    const normalized = normalizeString(value)
    if (normalized) {
      return normalized
    }
  }
  return null
}

function findLarkContextDeep(
  source: unknown,
  maxDepth = 4,
  visited = new WeakSet<object>()
): ResolvedCurrentLarkContext {
  if (!source || typeof source !== 'object' || maxDepth < 0) {
    return {
      chatId: null,
      chatType: null,
      senderOpenId: null,
      senderName: null
    }
  }

  const record = source as Record<string, unknown>
  if (visited.has(record)) {
    return {
      chatId: null,
      chatType: null,
      senderOpenId: null,
      senderName: null
    }
  }
  visited.add(record)

  const chatId = resolveFirstStringByPaths(record, [
    'chatId',
    'runtime.chatId',
    'callback.context.chatId',
    'message.chatId',
    'options.chatId',
    'lark_group_window.chatId',
    'lark_conversation_context_current_chat_id'
  ])
  const chatType = resolveFirstStringByPaths(record, [
    'chatType',
    'runtime.chatType',
    'callback.context.chatType',
    'message.chatType',
    'options.chatType',
    'lark_conversation_context_current_chat_type'
  ])
  const senderOpenId = resolveFirstStringByPaths(record, [
    'senderOpenId',
    'runtime.senderOpenId',
    'callback.context.senderOpenId',
    'message.senderOpenId',
    'options.channelUserId',
    'lark_conversation_context_current_sender_open_id',
    'lark_current_context.senderOpenId'
  ])
  const senderName = resolveFirstStringByPaths(record, [
    'senderName',
    'runtime.senderName',
    'callback.context.senderName',
    'message.senderName',
    'lark_conversation_context_current_sender_name',
    'lark_current_context.senderName'
  ])

  if (chatId || chatType || senderOpenId || senderName) {
    return {
      chatId,
      chatType,
      senderOpenId,
      senderName
    }
  }

  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue
    }
    const nested = findLarkContextDeep(value, maxDepth - 1, visited)
    if (nested.chatId || nested.chatType || nested.senderOpenId || nested.senderName) {
      return nested
    }
  }

  return {
    chatId: null,
    chatType: null,
    senderOpenId: null,
    senderName: null
  }
}

function resolveCurrentLarkContext(state: Record<string, unknown>): ResolvedCurrentLarkContext {
  return findLarkContextDeep(state)
}

function validateChatContainerId(containerId: string, source: ResolvedListMessagesContainer['source']) {
  if (containerId.startsWith('om_')) {
    throw new Error(
      `[lark_list_messages] containerIdType=chat requires a chat_id (usually starts with 'oc_'), but got a message_id-like value '${containerId}'. ${
        source === 'explicit'
          ? 'If you want the current conversation history, omit containerId and let the middleware default to the current Lark chat.'
          : 'The current chat context did not expose a valid chat_id.'
      }`
    )
  }
}

function resolveListMessagesContainer(
  parameters: z.infer<typeof listMessagesSchema>,
  state: Record<string, unknown>
): ResolvedListMessagesContainer {
  const explicitContainerId = normalizeString(parameters.containerId)
  const explicitContainerIdType = parameters.containerIdType ?? null
  if (explicitContainerId) {
    const containerIdType = (explicitContainerIdType ?? 'chat') as 'chat' | 'user'
    if (containerIdType === 'chat') {
      validateChatContainerId(explicitContainerId, 'explicit')
    }
    return {
      containerIdType,
      containerId: explicitContainerId,
      source: 'explicit'
    }
  }

  const current = resolveCurrentLarkContext(state)
  if ((explicitContainerIdType == null || explicitContainerIdType === 'chat') && current.chatId) {
    validateChatContainerId(current.chatId, 'current-chat')
    return {
      containerIdType: 'chat',
      containerId: current.chatId,
      source: 'current-chat'
    }
  }

  if (explicitContainerIdType === 'user' && current.senderOpenId) {
    return {
      containerIdType: 'user',
      containerId: current.senderOpenId,
      source: 'current-user'
    }
  }

  throw new Error(
    `[lark_list_messages] containerId is required. By default this tool reads the current Lark chat, but no current chat context was found.`
  )
}

function buildConversationContextGuidance(context: ResolvedCurrentLarkContext): string {
  const lines = [
    'Lark conversation context rules:',
    '- Use lark_list_messages to inspect message history.',
    '- If you do not explicitly specify containerIdType/containerId, default to the current Lark chat.',
    '- In group chats, this means the current group chat.',
    '- When the user asks who they are, what was said earlier, what this group discussed before, or why you made a judgment, inspect the current group history first.',
    '- In group chats, you may inspect the current group context before answering context-dependent questions.',
    '- Treat open_id values as internal identifiers. Do not present open_id as a person name in user-facing answers.',
    "- For chat containers, use chat_id (usually starts with 'oc_'), not message_id (usually starts with 'om_').",
    '- Only override containerIdType/containerId when the user explicitly asks about another chat or another user.'
  ]

  if (context.chatId) {
    lines.push(`- Current chat_id available in context: ${context.chatId}`)
  }

  if (context.chatType) {
    lines.push(`- Current chat_type available in context: ${context.chatType}`)
  }

  if (context.senderName) {
    lines.push(`- Current speaker display name available in context: ${context.senderName}`)
  }

  return lines.join('\n')
}

function enrichCurrentSpeakerName<T>(result: T, context: ResolvedCurrentLarkContext): T {
  if (!context.senderOpenId || !context.senderName || !result || typeof result !== 'object') {
    return result
  }

  const patchMessage = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value
    }

    const record = { ...(value as Record<string, unknown>) }
    if (
      record.senderOpenId === context.senderOpenId &&
      !normalizeString(record.senderName)
    ) {
      record.senderName = context.senderName
    }
    return record
  }

  const record = { ...(result as Record<string, unknown>) }
  if (Array.isArray(record.items)) {
    record.items = record.items.map((item) => patchMessage(item))
  }
  if (record.item) {
    record.item = patchMessage(record.item)
  }
  return record as T
}

@Injectable()
@AgentMiddlewareStrategy(LARK_CONVERSATION_CONTEXT_MIDDLEWARE_NAME)
export class LarkConversationContextMiddleware implements IAgentMiddlewareStrategy {
  constructor(private readonly contextToolService: LarkContextToolService) {}

  meta: TAgentMiddlewareMeta = {
    name: LARK_CONVERSATION_CONTEXT_MIDDLEWARE_NAME,
    icon: {
      type: 'image',
      value: iconImage
    },
    label: {
      en_US: 'Lark Conversation Context',
      zh_Hans: '飞书会话上下文'
    },
    description: {
      en_US: 'Exposes normalized Lark message and message-resource tools for conversation context assembly.',
      zh_Hans: '提供标准化的飞书消息与消息资源工具，供后续会话上下文层消费。'
    },
    configSchema: {
      type: 'object',
      properties: {
        integrationId: {
          type: 'string',
          title: {
            en_US: 'Lark Integration',
            zh_Hans: '飞书集成'
          },
          description: {
            en_US: 'Default integration used by Lark conversation context tools.',
            zh_Hans: '会话上下文工具默认使用的飞书集成。'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/integration/select-options?provider=lark',
            variable: true,
            span: 2
          }
        },
        defaults: {
          type: 'object',
          title: {
            en_US: 'Defaults',
            zh_Hans: '默认值'
          },
          description: {
            en_US: 'Default runtime settings shared by all Lark conversation context tools.',
            zh_Hans: '所有会话上下文工具共享的默认运行参数。'
          },
          properties: {
            timeoutMs: {
              type: 'number',
              default: DEFAULT_TIMEOUT_MS,
              minimum: 100,
              title: {
                en_US: 'Timeout (ms)',
                zh_Hans: '超时毫秒'
              },
              description: {
                en_US: 'Fallback request timeout used by all tools when the tool call does not specify one.',
                zh_Hans: '当工具调用未显式传入超时时使用的默认超时。'
              }
            },
            pageSize: {
              type: 'number',
              default: DEFAULT_PAGE_SIZE,
              minimum: 1,
              maximum: 100,
              title: {
                en_US: 'List Page Size',
                zh_Hans: '列表分页大小'
              },
              description: {
                en_US: 'Default page size for lark_list_messages.',
                zh_Hans: 'lark_list_messages 的默认分页大小。'
              }
            },
            resourceContentMode: {
              type: 'string',
              enum: ['metadata', 'base64'],
              default: 'metadata',
              title: {
                en_US: 'Resource Content Mode',
                zh_Hans: '资源内容模式'
              },
              description: {
                en_US: 'metadata only returns headers-derived metadata; base64 also returns the file content.',
                zh_Hans: 'metadata 仅返回资源元数据，base64 还会内联返回文件内容。'
              }
            }
          },
          'x-ui': {
            span: 2
          }
        }
      }
    } as TAgentMiddlewareMeta['configSchema']
  }

  createMiddleware(
    options: LarkConversationContextMiddlewareConfig,
    _context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const { data, error } = interopSafeParse(middlewareConfigSchema, options ?? {})
    if (error) {
      throw new Error(`LarkConversationContextMiddleware configuration error: ${error.message}`)
    }

    const parsed = data!

    const requireIntegrationId = (toolName: string) => {
      const integrationId = normalizeString(parsed.integrationId)
      if (!integrationId) {
        throw new Error(`[${toolName}] integrationId is required. Configure middleware integration first.`)
      }
      return integrationId
    }

    const buildCommand = (
      toolName: string,
      toolCallId: string | undefined,
      integrationId: string,
      data: Record<string, unknown>
    ) => {
      const result = {
        tool: toolName,
        integrationId,
        success: true,
        data
      }

      return new Command({
        update: {
          lark_conversation_context_last_result: result,
          messages: [
            new ToolMessage({
              content: toToolMessageContent(result),
              name: toolName,
              tool_call_id: toolCallId,
              status: 'success'
            })
          ]
        }
      })
    }

    const tools = [
      tool(
        async (parameters, config) => {
          const toolName = 'lark_list_messages'
          const integrationId = requireIntegrationId(toolName)
          const toolCallId = getToolCallIdFromConfig(config)
          const timeoutMs = normalizeTimeout(parameters.timeoutMs, parsed.defaults.timeoutMs)
          const state = getCurrentStateSafe()
          const currentContext = resolveCurrentLarkContext(state)
          const resolvedContainer = resolveListMessagesContainer(parameters, state)

          const result = await this.contextToolService.listMessages({
            integrationId,
            containerIdType: resolvedContainer.containerIdType,
            containerId: resolvedContainer.containerId,
            startTime: parameters.startTime,
            endTime: parameters.endTime,
            sortType: parameters.sortType ?? 'ByCreateTimeDesc',
            pageSize: normalizePageSize(parameters.pageSize, parsed.defaults.pageSize),
            pageToken: parameters.pageToken,
            timeoutMs
          })
          const enrichedResult = enrichCurrentSpeakerName(result, currentContext)

          return buildCommand(toolName, toolCallId, integrationId, {
            ...enrichedResult,
            resolvedContainer
          } as Record<string, unknown>)
        },
        {
          name: 'lark_list_messages',
          description:
            "List historical messages from a Lark conversation. If containerIdType/containerId are omitted, this tool defaults to the current Lark chat. In group chats, that means the current group. Only override the container when the user explicitly asks about another chat or another user.",
          schema: listMessagesSchema,
          verboseParsingErrors: true
        }
      ),
      tool(
        async (parameters, config) => {
          const toolName = 'lark_get_message'
          const integrationId = requireIntegrationId(toolName)
          const toolCallId = getToolCallIdFromConfig(config)
          const timeoutMs = normalizeTimeout(parameters.timeoutMs, parsed.defaults.timeoutMs)
          const currentContext = resolveCurrentLarkContext(getCurrentStateSafe())

          const result = await this.contextToolService.getMessage({
            integrationId,
            messageId: parameters.messageId,
            userIdType: parameters.userIdType,
            timeoutMs
          })

          return buildCommand(
            toolName,
            toolCallId,
            integrationId,
            enrichCurrentSpeakerName(result, currentContext) as unknown as Record<string, unknown>
          )
        },
        {
          name: 'lark_get_message',
          description:
            'Fetch a single Lark message by message id and return a normalized message shape instead of the raw Lark payload.',
          schema: getMessageSchema,
          verboseParsingErrors: true
        }
      ),
      tool(
        async (parameters, config) => {
          const toolName = 'lark_get_message_resource'
          const integrationId = requireIntegrationId(toolName)
          const toolCallId = getToolCallIdFromConfig(config)
          const timeoutMs = normalizeTimeout(parameters.timeoutMs, parsed.defaults.timeoutMs)

          const result = await this.contextToolService.getMessageResource({
            integrationId,
            messageId: parameters.messageId,
            fileKey: parameters.fileKey,
            type: parameters.type,
            contentMode: parameters.contentMode ?? parsed.defaults.resourceContentMode,
            timeoutMs
          })

          return buildCommand(toolName, toolCallId, integrationId, result as unknown as Record<string, unknown>)
        },
        {
          name: 'lark_get_message_resource',
          description:
            'Fetch a resource referenced by a Lark message and return normalized metadata, with optional inline base64 content.',
          schema: getMessageResourceSchema,
          verboseParsingErrors: true
        }
      )
    ]

    return {
      name: LARK_CONVERSATION_CONTEXT_MIDDLEWARE_NAME,
      stateSchema: middlewareStateSchema,
      beforeAgent: async (state, runtime) => {
        const rootState =
          ((runtime as Record<string, unknown> | undefined)?.state as Record<string, unknown> | undefined) ?? {}
        const currentContext = resolveCurrentLarkContext({
          ...rootState,
          ...((state ?? {}) as Record<string, unknown>)
        })
        const guidance = buildConversationContextGuidance(currentContext)

        return {
          lark_conversation_context_current_chat_id: currentContext.chatId ?? '',
          lark_conversation_context_current_chat_type: currentContext.chatType ?? '',
          lark_conversation_context_current_sender_open_id: currentContext.senderOpenId ?? '',
          lark_conversation_context_current_sender_name: currentContext.senderName ?? '',
          lark_conversation_context_agent_guidance: guidance
        }
      },
      wrapModelCall: async (request, handler) => {
        const guidance = normalizeString((request.state as Record<string, unknown>)?.lark_conversation_context_agent_guidance)
        if (!guidance) {
          return handler(request)
        }

        const baseSystemContent = toSystemMessageText(request.systemMessage?.content).trim()
        const mergedSystemContent = [baseSystemContent, '<lark_conversation_context_guidance>', guidance, '</lark_conversation_context_guidance>']
          .filter(Boolean)
          .join('\n\n')

        return handler({
          ...request,
          systemMessage: new SystemMessage({
            content: mergedSystemContent
          })
        })
      },
      tools
    }
  }
}

export type { LarkConversationContextMiddlewareConfig }
