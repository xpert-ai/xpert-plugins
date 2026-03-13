import { ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { InferInteropZodInput, interopSafeParse } from '@langchain/core/utils/types'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import { getToolCallIdFromConfig, TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { iconImage } from '../types.js'
import { WeComChannelStrategy } from '../wecom-channel.strategy.js'

const WECOM_NOTIFY_MIDDLEWARE_NAME = 'WeComNotifyMiddleware'

const middlewareConfigSchema = z.object({
  integrationId: z.string().min(1)
})

const runtimeContextSchema = z.object({
  senderId: z.string().optional().nullable(),
  chatId: z.string().optional().nullable(),
  responseUrl: z.string().optional().nullable(),
  reqId: z.string().optional().nullable(),
  timeoutMs: z.number().int().min(100).max(120000).optional().nullable()
})

const sendTextSchema = runtimeContextSchema.extend({
  content: z.string().min(1)
})

const sendRichSchema = runtimeContextSchema.extend({
  mode: z.enum(['markdown', 'textcard', 'template_card']).optional().nullable(),
  markdown: z.string().optional().nullable(),
  textcard: z
    .object({
      title: z.string(),
      description: z.string(),
      url: z.string(),
      btntxt: z.string().optional().nullable()
    })
    .optional()
    .nullable(),
  textCard: z
    .object({
      title: z.string(),
      description: z.string(),
      url: z.string(),
      btntxt: z.string().optional().nullable()
    })
    .optional()
    .nullable(),
  templateCard: z.record(z.any()).optional().nullable(),
  template_card: z.record(z.any()).optional().nullable(),
  card: z.record(z.any()).optional().nullable()
})

const updateMessageSchema = runtimeContextSchema.extend({
  templateCard: z.record(z.any()).optional().nullable(),
  template_card: z.record(z.any()).optional().nullable(),
  card: z.record(z.any()).optional().nullable()
})

const stateSchema = z.object({
  wecom_notify_last_result: z.record(z.any()).nullable().default(null)
})

type MiddlewareConfig = InferInteropZodInput<typeof middlewareConfigSchema>

type WeComNotifyResult = {
  tool: string
  integrationId: string
  successCount: number
  failureCount: number
  data?: Record<string, unknown>
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.trim()
  return text || null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
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

function resolveFirstStringByPaths(state: Record<string, unknown>, paths: readonly string[]): string | null {
  for (const path of paths) {
    const value = normalizeString(getValueByPath(state, path))
    if (value) {
      return value
    }
  }
  return null
}

function inferRichMode(input: Record<string, unknown>): 'markdown' | 'textcard' | 'template_card' {
  const mode = normalizeString(input.mode)?.toLowerCase()
  if (mode === 'markdown' || mode === 'textcard' || mode === 'template_card') {
    return mode
  }

  if (isRecord(input.templateCard) || isRecord(input.template_card) || isRecord(input.card)) {
    return 'template_card'
  }
  if (isRecord(input.textcard) || isRecord(input.textCard)) {
    return 'textcard'
  }
  if (normalizeString(input.markdown)) {
    return 'markdown'
  }

  throw new Error(
    '[wecom_send_rich_notification] cannot infer mode. Provide one of: markdown, textcard/textCard, templateCard/template_card/card'
  )
}

function normalizeTemplateCard(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error('[wecom_update_message] templateCard/template_card/card is required')
  }
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>
}

function resolveRuntimeContext(
  state: Record<string, unknown>,
  input: Record<string, unknown>
): {
  senderId: string | null
  chatId: string | null
  responseUrl: string | null
  reqId: string | null
  timeoutMs: number | undefined
  hasAnyContext: boolean
} {
  const senderId =
    normalizeString(input.senderId) ||
    resolveFirstStringByPaths(state, [
      'senderId',
      'message.senderId',
      'raw.senderId',
      'raw.sender_id',
      'raw.from.userId',
      'raw.from.userid',
      'message.raw.senderId',
      'message.raw.sender_id',
      'message.raw.from.userId',
      'message.raw.from.userid',
      'callback.context.senderId',
      'callback.context.sender_id'
    ])

  const chatId =
    normalizeString(input.chatId) ||
    resolveFirstStringByPaths(state, [
      'chatId',
      'message.chatId',
      'raw.chatId',
      'raw.chat_id',
      'raw.chatid',
      'message.raw.chatId',
      'message.raw.chat_id',
      'message.raw.chatid',
      'callback.context.chatId',
      'callback.context.chat_id'
    ])

  const responseUrl =
    normalizeString(input.responseUrl) ||
    resolveFirstStringByPaths(state, [
      'response_url',
      'responseUrl',
      'raw.response_url',
      'raw.responseUrl',
      'message.raw.response_url',
      'message.raw.responseUrl',
      'callback.context.response_url',
      'callback.context.responseUrl'
    ])

  const reqId =
    normalizeString(input.reqId) ||
    resolveFirstStringByPaths(state, [
      'req_id',
      'reqId',
      'raw.req_id',
      'raw.reqId',
      'message.raw.req_id',
      'message.raw.reqId',
      'callback.context.req_id',
      'callback.context.reqId'
    ])

  const timeoutInput = input.timeoutMs
  const timeoutValue = typeof timeoutInput === 'number' ? timeoutInput : Number(timeoutInput)
  const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue >= 100
    ? Math.min(Math.floor(timeoutValue), 120000)
    : undefined

  return {
    senderId,
    chatId,
    responseUrl,
    reqId,
    timeoutMs,
    hasAnyContext: Boolean(senderId || chatId || responseUrl || reqId)
  }
}

function toToolMessageContent(result: WeComNotifyResult) {
  return JSON.stringify(result)
}

@Injectable()
@AgentMiddlewareStrategy(WECOM_NOTIFY_MIDDLEWARE_NAME)
export class WeComNotifyMiddleware implements IAgentMiddlewareStrategy {
  constructor(private readonly wecomChannel: WeComChannelStrategy) {}

  meta: TAgentMiddlewareMeta = {
    name: WECOM_NOTIFY_MIDDLEWARE_NAME,
    icon: {
      type: 'image',
      value: iconImage
    },
    label: {
      en_US: 'WeCom Notify Middleware',
      zh_Hans: '企业微信通知中间件'
    },
    description: {
      en_US:
        'Robot-only WeCom notification tools (short callback + long websocket). For normal conversation, reply directly with text.',
      zh_Hans:
        '仅机器人通道的企业微信通知工具（短连接回调 + 长连接 WebSocket）。普通对话请直接输出文本。'
    },
    configSchema: {
      type: 'object',
      properties: {
        integrationId: {
          type: 'string',
          title: {
            en_US: 'WeCom Integration',
            zh_Hans: '企业微信集成'
          },
          description: {
            en_US: 'Required. Select either short-connection or long-connection WeCom integration.',
            zh_Hans: '必填。选择企业微信短连接或长连接集成。'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/wecom/integration-select-options',
            variable: false
          }
        }
      },
      required: ['integrationId']
    } as TAgentMiddlewareMeta['configSchema']
  }

  createMiddleware(
    options: MiddlewareConfig,
    _context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const { data, error } = interopSafeParse(middlewareConfigSchema, options ?? {})
    if (error) {
      throw new Error(`WeComNotifyMiddleware configuration error: ${error.message}`)
    }

    const parsed = data!
    const integrationId = normalizeString(parsed.integrationId)
    if (!integrationId) {
      throw new Error('WeComNotifyMiddleware requires integrationId')
    }

    const buildCommand = (toolName: string, toolCallId: string, result: WeComNotifyResult) => {
      const success = result.failureCount === 0
      return new Command({
        update: {
          wecom_notify_last_result: result,
          messages: [
            new ToolMessage({
              content: toToolMessageContent(result),
              name: toolName,
              tool_call_id: toolCallId,
              status: success ? 'success' : 'error'
            })
          ]
        }
      })
    }

    const tools = []

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'wecom_send_text_notification'
          const toolCallId = getToolCallIdFromConfig(config)
          const state = getCurrentStateSafe()
          const input = parameters as Record<string, unknown>
          const content = normalizeString(input.content)
          if (!content) {
            throw new Error(`[${toolName}] content is required`)
          }

          const runtime = resolveRuntimeContext(state, input)
          const result = await this.wecomChannel.sendRobotPayload({
            integrationId,
            senderId: runtime.senderId,
            chatId: runtime.chatId,
            responseUrl: runtime.responseUrl,
            reqId: runtime.reqId,
            preferConversationContext: runtime.hasAnyContext,
            timeoutMs: runtime.timeoutMs,
            payload: {
              msgtype: 'markdown',
              markdown: {
                content
              }
            }
          })

          if (!result.success) {
            throw new Error(result.error || '当前会话缺少可用机器人上下文（response_url/req_id/chat）')
          }

          const notifyResult: WeComNotifyResult = {
            tool: toolName,
            integrationId,
            successCount: 1,
            failureCount: 0,
            data: {
              messageId: result.messageId || null
            }
          }

          return buildCommand(toolName, toolCallId, notifyResult)
        },
        {
          name: 'wecom_send_text_notification',
          description:
            'Send text notification through WeCom robot context. Requires an active robot conversation context.',
          schema: sendTextSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'wecom_send_rich_notification'
          const toolCallId = getToolCallIdFromConfig(config)
          const state = getCurrentStateSafe()
          const input = parameters as Record<string, unknown>
          const mode = inferRichMode(input)
          const runtime = resolveRuntimeContext(state, input)

          let payload: Record<string, unknown>
          if (mode === 'markdown') {
            const markdown = normalizeString(input.markdown)
            if (!markdown) {
              throw new Error(`[${toolName}] markdown is required when mode=markdown`)
            }
            payload = {
              msgtype: 'markdown',
              markdown: { content: markdown }
            }
          } else if (mode === 'textcard') {
            const textcardInput = (input.textcard || input.textCard) as Record<string, unknown> | null
            const title = normalizeString(textcardInput?.title)
            const description = normalizeString(textcardInput?.description)
            const url = normalizeString(textcardInput?.url)
            const btntxt = normalizeString(textcardInput?.btntxt)
            if (!title || !description || !url) {
              throw new Error(`[${toolName}] textcard.title/description/url are required when mode=textcard`)
            }
            payload = {
              msgtype: 'textcard',
              textcard: {
                title,
                description,
                url,
                ...(btntxt ? { btntxt } : {})
              }
            }
          } else {
            const templateCard = normalizeTemplateCard(input.templateCard || input.template_card || input.card)
            payload = {
              msgtype: 'template_card',
              template_card: templateCard
            }
          }

          const result = await this.wecomChannel.sendRobotPayload({
            integrationId,
            senderId: runtime.senderId,
            chatId: runtime.chatId,
            responseUrl: runtime.responseUrl,
            reqId: runtime.reqId,
            preferConversationContext: runtime.hasAnyContext,
            timeoutMs: runtime.timeoutMs,
            payload
          })

          if (!result.success) {
            throw new Error(result.error || '当前会话缺少可用机器人上下文（response_url/req_id/chat）')
          }

          const notifyResult: WeComNotifyResult = {
            tool: toolName,
            integrationId,
            successCount: 1,
            failureCount: 0,
            data: {
              mode,
              messageId: result.messageId || null
            }
          }

          return buildCommand(toolName, toolCallId, notifyResult)
        },
        {
          name: 'wecom_send_rich_notification',
          description:
            'Send rich notification through WeCom robot context. mode: markdown/textcard/template_card (auto inference supported).',
          schema: sendRichSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'wecom_update_message'
          const toolCallId = getToolCallIdFromConfig(config)
          const state = getCurrentStateSafe()
          const input = parameters as Record<string, unknown>
          const runtime = resolveRuntimeContext(state, input)
          const templateCard = normalizeTemplateCard(input.templateCard || input.template_card || input.card)

          const result = await this.wecomChannel.updateRobotTemplateCard({
            integrationId,
            templateCard,
            senderId: runtime.senderId,
            chatId: runtime.chatId,
            responseUrl: runtime.responseUrl,
            reqId: runtime.reqId,
            timeoutMs: runtime.timeoutMs
          })

          if (!result.success) {
            throw new Error(result.error || '当前会话缺少可用机器人上下文（response_url/req_id/chat）')
          }

          const notifyResult: WeComNotifyResult = {
            tool: toolName,
            integrationId,
            successCount: 1,
            failureCount: 0,
            data: {
              updatedBy: 'template_card',
              messageId: result.messageId || null
            }
          }

          return buildCommand(toolName, toolCallId, notifyResult)
        },
        {
          name: 'wecom_update_message',
          description:
            'Update a template card in current WeCom robot conversation context. Requires templateCard/template_card/card payload.',
          schema: updateMessageSchema,
          verboseParsingErrors: true
        }
      )
    )

    return {
      name: WECOM_NOTIFY_MIDDLEWARE_NAME,
      stateSchema,
      tools
    }
  }
}
