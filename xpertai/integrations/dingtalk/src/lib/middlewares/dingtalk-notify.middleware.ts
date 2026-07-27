import { ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { InferInteropZodInput, interopSafeParse } from '@langchain/core/utils/types'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import { getToolCallIdFromConfig, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  WORKSPACE_FILES_SOURCE,
  WorkspaceFilesRuntimeCapability,
  getErrorMessage
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { DingTalkConversationService } from '../conversation.service.js'
import { toRecipientConversationUserKey } from '../conversation-user-key.js'
import { DingTalkChannelStrategy } from '../dingtalk-channel.strategy.js'
import {
  buildDingTalkSendMediaContent,
  resolveDingTalkSendMediaFromWorkspace,
  toDingTalkSendFileMetadata,
  type DingTalkSendFileDescriptor
} from '../dingtalk-send-file.js'
import { iconImage, normalizeDingTalkRobotCode } from '../types.js'
import {
  resolveDingTalkTrustedRuntimeContext,
  type DingTalkTrustedRuntimeContext
} from './dingtalk-trusted-runtime-context.js'

const DINGTALK_NOTIFY_MIDDLEWARE_NAME = 'DingTalkNotifyMiddleware'
const DEFAULT_TIMEOUT_MS = 10000
const MAX_BATCH_CONCURRENCY = 5

const RecipientTypeSchema = z.enum(['chat_id', 'open_id', 'user_id', 'union_id', 'email'])

const middlewareConfigSchema = z.object({
  integrationId: z.string().optional().nullable(),
  recipient_type: RecipientTypeSchema.optional().nullable().describe('DingTalk recipient type (optional)'),
  recipient_id: z.string().optional().nullable().describe('DingTalk recipient id (optional)'),
  template: z
    .object({
      enabled: z.boolean().default(true),
      strict: z.boolean().default(false)
    })
    .default({}),
  defaults: z
    .object({
      timeoutMs: z.number().int().min(100).default(DEFAULT_TIMEOUT_MS)
    })
    .default({}),
})

const dingtalkNotifyStateSchema = z.object({
  dingtalk_notify_last_result: z.record(z.any()).nullable().default(null),
  dingtalk_notify_last_message_ids: z.array(z.string()).default([])
})

const sendTextNotificationSchema = z.object({
  content: z.string().describe('Text content to send'),
  sessionWebhook: z
    .string()
    .optional()
    .nullable()
    .describe('Legacy configured-target session webhook. Ignored for trusted trigger-routed conversations.'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

const sendRichNotificationSchema = z.object({
  mode: z
    .enum(['markdown', 'interactive', 'template'])
    .describe('markdown=rich text; interactive=action card; template=raw msgKey/msgParam'),
  markdown: z
    .string()
    .optional()
    .nullable()
    .describe('Markdown content. Required when mode=markdown; optional fallback when mode=interactive'),
  msgKey: z.string().optional().nullable().describe('DingTalk message template key. Required when mode=template'),
  msgParam: z
    .union([z.record(z.any()), z.string()])
    .optional()
    .nullable()
    .describe('DingTalk message template payload. Required when mode=template'),
  card: z
    .union([z.record(z.any()), z.string()])
    .optional()
    .nullable()
    .describe('Card payload for interactive mode. Prefer compact JSON; JSON string is also supported.'),
  sessionWebhook: z
    .string()
    .optional()
    .nullable()
    .describe('Legacy configured-target session webhook. Ignored for trusted trigger-routed conversations.'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

const sendFileReferenceSchema = z.object({
  source: z.literal(WORKSPACE_FILES_SOURCE).optional(),
  filePath: z.string().optional().describe('Workspace-relative file path.'),
  workspacePath: z.string().optional().describe('Workspace-relative file path or sandbox /workspace path alias.'),
  originalName: z.string().optional().describe('Original filename.'),
  name: z.string().optional().describe('Alias for originalName.'),
  mimeType: z.string().optional().describe('Optional MIME type.'),
  size: z.number().int().positive().optional().describe('Optional expected file size in bytes.')
})

const sendFileDescriptorSchema = z.object({
  path: z.string().optional().describe('Sandbox /workspace path or workspace-relative path.'),
  filePath: z.string().optional().describe('Workspace-relative file path alias.'),
  workspacePath: z.string().optional().describe('Workspace-relative file path or sandbox /workspace path alias.'),
  fileRef: sendFileReferenceSchema.optional().describe('Xpert workspace file reference returned by a file tool.'),
  originalName: z.string().optional().describe('Filename to show in DingTalk.'),
  name: z.string().optional().describe('Alias for originalName.'),
  mimeType: z.string().optional().describe('Optional MIME type.'),
  mimetype: z.string().optional().describe('Alias for mimeType.'),
  extension: z.string().optional().describe('Optional file extension without a leading dot.'),
  size: z.number().int().positive().optional().describe('Optional expected file size in bytes.')
})

const sendFileSchema = z.object({
  file: sendFileDescriptorSchema.optional().describe('File descriptor returned by an Xpert file tool.'),
  path: z.string().optional().describe('Sandbox /workspace path or workspace-relative path.'),
  filePath: z.string().optional().describe('Workspace-relative file path alias.'),
  workspacePath: z.string().optional().describe('Workspace-relative file path or sandbox /workspace path alias.'),
  fileRef: sendFileReferenceSchema.optional(),
  originalName: z.string().optional().describe('Filename to show in DingTalk.'),
  original_name: z.string().optional().describe('Alias for originalName.'),
  fileName: z.string().optional().describe('Alias for originalName.'),
  file_name: z.string().optional().describe('Alias for originalName.'),
  filename: z.string().optional().describe('Alias for originalName.'),
  name: z.string().optional().describe('Alias for originalName.'),
  mimeType: z.string().optional().describe('Optional MIME type.'),
  mime_type: z.string().optional().describe('Alias for mimeType.'),
  mimetype: z.string().optional().describe('Alias for mimeType.'),
  contentType: z.string().optional().describe('Alias for mimeType.'),
  content_type: z.string().optional().describe('Alias for mimeType.'),
  extension: z.string().optional().describe('Optional file extension without a leading dot.'),
  size: z.number().int().positive().optional().describe('Optional expected file size in bytes.'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

const updateMessageSchema = z.object({
  messageId: z.string().describe('DingTalk message id to update'),
  mode: z
    .enum(['text', 'interactive', 'template'])
    .describe('text updates text content, interactive updates card content, template uses msgKey/msgParam'),
  content: z.string().optional().nullable().describe('Text content for text mode'),
  markdown: z.string().optional().nullable().describe('Markdown content for interactive mode'),
  msgKey: z.string().optional().nullable().describe('DingTalk message template key for template mode'),
  msgParam: z
    .union([z.record(z.any()), z.string()])
    .optional()
    .nullable()
    .describe('DingTalk message template payload for template mode'),
  card: z
    .union([z.record(z.any()), z.string()])
    .optional()
    .nullable()
    .describe('Card payload for interactive mode. JSON string is also supported.'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

const recallMessageSchema = z.object({
  messageId: z.string().describe('DingTalk message id to recall'),
  robotCode: z.string().optional().nullable().describe('Optional robot code override for recall API'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

const listUsersSchema = z.object({
  keyword: z.string().optional().nullable().describe('Filter keyword for users'),
  pageSize: z.number().int().min(1).max(100).optional().nullable().default(20).describe('Users page size'),
  pageToken: z.string().optional().nullable().describe('Users page token'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

export type DingTalkNotifyResultItem = {
  target: string
  success: boolean
  messageId?: string | null
  error?: string
}

export type DingTalkNotifyResult = {
  tool: string
  integrationId: string
  successCount: number
  failureCount: number
  results: DingTalkNotifyResultItem[]
  data?: Record<string, unknown>
}

type DingTalkRecipient = { type: z.infer<typeof RecipientTypeSchema>; id: string }
type DingTalkNotifyState = z.infer<typeof dingtalkNotifyStateSchema>
type DingTalkNotifyMiddlewareConfig = InferInteropZodInput<typeof middlewareConfigSchema>

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function renderTemplateString(
  value: string,
  state: Record<string, unknown>,
  options: { enabled: boolean; strict: boolean }
): unknown {
  if (!options.enabled) {
    return value
  }

  const templatePattern = /{{\s*([^{}]+?)\s*}}/g
  if (!templatePattern.test(value)) {
    return value
  }

  const fullPattern = /^{{\s*([^{}]+?)\s*}}$/
  const fullMatch = value.match(fullPattern)
  if (fullMatch) {
    const resolved = getValueByPath(state, fullMatch[1])
    if (resolved === undefined) {
      if (options.strict) {
        throw new Error(`Template variable '${fullMatch[1]}' is not found in current state`)
      }
      return value
    }
    return resolved
  }

  return value.replace(templatePattern, (_, rawPath: string) => {
    const resolved = getValueByPath(state, rawPath)
    if (resolved === undefined) {
      if (options.strict) {
        throw new Error(`Template variable '${rawPath}' is not found in current state`)
      }
      return `{{${rawPath}}}`
    }

    if (resolved == null) {
      return ''
    }

    return typeof resolved === 'string' ? resolved : JSON.stringify(resolved)
  })
}

function renderTemplateValue<T>(
  value: T,
  state: Record<string, unknown>,
  options: { enabled: boolean; strict: boolean }
): T {
  if (typeof value === 'string') {
    return renderTemplateString(value, state, options) as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, state, options)) as T
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce((acc, [key, item]) => {
      acc[key] = renderTemplateValue(item, state, options)
      return acc
    }, {} as Record<string, unknown>) as T
  }

  return value
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readFirstString(records: Array<Record<string, unknown> | undefined>, keys: string[]): string | null {
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
  return null
}

function readFirstNumber(records: Array<Record<string, unknown> | undefined>, keys: string[]): number | null {
  for (const record of records) {
    if (!record) {
      continue
    }
    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value
      }
    }
  }
  return null
}

function buildDingTalkSendFileDescriptor(input: Record<string, unknown>): DingTalkSendFileDescriptor {
  const nestedFile = isPlainObject(input.file) ? input.file : {}
  const fileRef = isPlainObject(nestedFile.fileRef)
    ? nestedFile.fileRef
    : isPlainObject(input.fileRef)
    ? input.fileRef
    : undefined
  const metadataRecords = [nestedFile, input, fileRef]

  return {
    path: readFirstString(metadataRecords, ['path']),
    filePath: readFirstString(metadataRecords, ['filePath', 'file_path']),
    workspacePath: readFirstString(metadataRecords, ['workspacePath', 'workspace_path']),
    ...(fileRef
      ? {
          fileRef: {
            source: readFirstString([fileRef], ['source']),
            filePath: readFirstString([fileRef], ['filePath', 'file_path']),
            workspacePath: readFirstString([fileRef], ['workspacePath', 'workspace_path']),
            originalName: readFirstString([fileRef], ['originalName', 'original_name']),
            name: readFirstString([fileRef], ['name']),
            mimeType: readFirstString([fileRef], ['mimeType', 'mime_type', 'mimetype']),
            size: readFirstNumber([fileRef], ['size'])
          }
        }
      : {}),
    originalName: readFirstString(metadataRecords, [
      'originalName',
      'original_name',
      'fileName',
      'file_name',
      'filename'
    ]),
    name: readFirstString(metadataRecords, ['name']),
    mimeType: readFirstString(metadataRecords, ['mimeType', 'mime_type', 'contentType', 'content_type']),
    mimetype: readFirstString(metadataRecords, ['mimetype']),
    extension: readFirstString(metadataRecords, ['extension', 'ext']),
    size: readFirstNumber(metadataRecords, ['size'])
  }
}

function normalizeTimeout(value: unknown, fallback: number): number {
  const timeout = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(timeout) && timeout >= 100) {
    return timeout
  }
  return fallback
}

function normalizeIntInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  const integer = Math.floor(parsed)
  if (integer < min || integer > max) {
    return fallback
  }
  return integer
}

function normalizeRecipientIdValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeRecipientIdValues(item))
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }

  return []
}

function normalizeRecipients(value: unknown, state: Record<string, unknown>): DingTalkRecipient[] {
  const recipientTypes = RecipientTypeSchema.options as readonly string[]
  if (!Array.isArray(value)) {
    return []
  }

  return value.reduce<DingTalkRecipient[]>((acc, item) => {
    if (!isPlainObject(item)) {
      return acc
    }

    const type = normalizeString(item.type)
    if (!type) {
      return acc
    }
    if (!recipientTypes.includes(type)) {
      return acc
    }

    const rawId = item.id
    const path = normalizeString(rawId)
    const resolvedValue = path ? getValueByPath(state, path) : undefined
    const resolvedIds = resolvedValue === undefined ? [] : normalizeRecipientIdValues(resolvedValue)
    const ids = resolvedIds.length ? resolvedIds : normalizeRecipientIdValues(rawId)

    ids.forEach((id) => {
      acc.push({
        type: type as DingTalkRecipient['type'],
        id
      })
    })

    return acc
  }, [])
}

function normalizeCardPayload(value: unknown): Record<string, unknown> | null {
  if (isPlainObject(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function resolveStateBackedString(value: unknown, state: Record<string, unknown>): string | null {
  const normalized = normalizeString(value)
  if (!normalized) {
    return null
  }

  const resolved = getValueByPath(state, normalized)
  if (resolved === undefined) {
    return normalized
  }

  const resolvedValues = normalizeRecipientIdValues(resolved)
  return resolvedValues[0] ?? normalized
}

function resolveFirstStringByPaths(state: Record<string, unknown>, paths: readonly string[]): string | null {
  for (const path of paths) {
    const resolved = getValueByPath(state, path)
    const text = normalizeString(resolved)
    if (text) {
      return text
    }
  }
  return null
}

function resolveConversationIds(state: Record<string, unknown>): Set<string> {
  const ids = new Set<string>()
  for (const path of ['conversationId', 'chatId', 'runtime.conversationId', 'runtime.chatId', 'options.chatId'] as const) {
    normalizeRecipientIdValues(getValueByPath(state, path)).forEach((v) => ids.add(v))
  }
  return ids
}

function resolveSessionWebhookFromState(inputValue: unknown, state: Record<string, unknown>): string | null {
  return resolveStateBackedString(inputValue, state) || resolveFirstStringByPaths(state, ['sessionWebhook', 'options.sessionWebhook', 'runtime.sessionWebhook'])
}

function resolveRobotCodeFromState(inputValue: unknown, state: Record<string, unknown>): string | null {
  return normalizeDingTalkRobotCode(
    resolveStateBackedString(inputValue, state) ||
      resolveFirstStringByPaths(state, ['robotCode', 'runtime.robotCode', 'message.raw.robotCode', 'raw.robotCode', 'options.robotCode'])
  )
}

async function resolveSessionWebhookForRecipient(
  recipient: DingTalkRecipient,
  conversationIds: Set<string>,
  sessionWebhook: string | null,
  getCached: (id: string) => Promise<string | null>
): Promise<string | undefined> {
  let sw = !!sessionWebhook && recipient.type === 'chat_id' && (!conversationIds.size || conversationIds.has(recipient.id))
    ? sessionWebhook
    : undefined
  if (!sw && recipient.type === 'chat_id' && recipient.id) {
    sw = (await getCached(recipient.id)) ?? undefined
  }
  return sw
}

function collectMessageIds(result: DingTalkNotifyResult): string[] {
  return result.results
    .filter((item) => item.success && !!item.messageId)
    .map((item) => item.messageId as string)
}

function toToolMessageContent(result: DingTalkNotifyResult) {
  const payload = result.data ? { ...result, data: result.data } : result
  return JSON.stringify(payload)
}

function formatError(error: unknown): string {
  const message = (error as any)?.response?.data?.msg || getErrorMessage(error)
  return message || 'Unknown error'
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout while ${label} after ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

@Injectable()
@AgentMiddlewareStrategy(DINGTALK_NOTIFY_MIDDLEWARE_NAME)
export class DingTalkNotifyMiddleware implements IAgentMiddlewareStrategy {
  private readonly logger = new Logger(DingTalkNotifyMiddleware.name)

  constructor(
    private readonly dingtalkChannel: DingTalkChannelStrategy,
    private readonly conversationService: DingTalkConversationService
  ) {}

  private resolveTargetXpertId(context: IAgentMiddlewareContext): string | null {
    return normalizeString(context?.xpertId)
  }

  private async tryBindConversationForRecipient(params: {
    integrationId: string
    recipient: DingTalkRecipient
    context: IAgentMiddlewareContext
  }): Promise<void> {
    const { integrationId, recipient, context } = params
    if (recipient.type === 'chat_id') {
      return
    }

    const conversationId = normalizeString(context?.conversationId)
    if (!conversationId) {
      return
    }

    const xpertId = this.resolveTargetXpertId(context)
    if (!xpertId) {
      return
    }

    const conversationUserKey = toRecipientConversationUserKey(recipient?.type, recipient?.id)
    if (!conversationUserKey) {
      return
    }

    try {
      await this.conversationService.setConversation(conversationUserKey, xpertId, conversationId)
      this.logger.log(
        `[${DINGTALK_NOTIFY_MIDDLEWARE_NAME}] Bound "${conversationUserKey}" to conversation "${conversationId}" for xpert "${xpertId}" (integration: ${integrationId})`
      )
    } catch (error) {
      this.logger.warn(
        `[${DINGTALK_NOTIFY_MIDDLEWARE_NAME}] Failed to bind recipient ${recipient.type}:${recipient.id} to conversation "${conversationId}": ${formatError(error)}`
      )
    }
  }

  meta: TAgentMiddlewareMeta = {
    name: DINGTALK_NOTIFY_MIDDLEWARE_NAME,
    icon: {
      type: 'svg',
      value: iconImage
    },
    label: {
      en_US: 'DingTalk Runtime',
      zh_Hans: '钉钉运行时'
    },
    description: {
      en_US:
        'Attach this runtime to a DingTalk-triggered agent. It uses the trusted trigger integration and conversation for notifications, cards, and workspace files, without integration or recipient selectors. IMPORTANT: For normal conversation replies, just output text directly—the system streams it automatically.',
      zh_Hans:
        '挂载到由钉钉触发的智能体后，通知、卡片和工作区文件会自动使用可信的触发器集成与当前会话，无需选择集成或收件人。重要：普通对话回复请直接输出文本，系统会自动流式展示。'
    },
    configSchema: {
      type: 'object',
      properties: {
        template: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              default: true,
              title: {
                en_US: 'Enable Template',
                zh_Hans: '启用模板变量'
              }
            },
            strict: {
              type: 'boolean',
              default: false,
              title: {
                en_US: 'Strict Template Mode',
                zh_Hans: '模板严格模式'
              }
            }
          },
          'x-ui': {
            span: 2
          }
        },
        defaults: {
          type: 'object',
          properties: {
            timeoutMs: {
              type: 'number',
              default: DEFAULT_TIMEOUT_MS,
              minimum: 100,
              title: {
                en_US: 'Timeout (ms)',
                zh_Hans: '超时毫秒'
              }
            }
          },
          'x-ui': {
            span: 2
          }
        },
      }
    } as TAgentMiddlewareMeta['configSchema']
  }

  createMiddleware(
    options: DingTalkNotifyMiddlewareConfig,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const { data, error } = interopSafeParse(middlewareConfigSchema, options ?? {})
    if (error) {
      throw new Error(`DingTalkNotifyMiddleware configuration error: ${error.message}`)
    }

    const parsed = data!
    const templateOptions = {
      enabled: parsed.template?.enabled !== false,
      strict: parsed.template?.strict === true
    }

    const resolveInput = <T extends Record<string, unknown>>(value: T, config?: unknown) => {
      const state = getCurrentStateSafe()
      const trustedRuntimeContext = resolveDingTalkTrustedRuntimeContext(config)
      const renderedInput = renderTemplateValue(value, state, templateOptions)
      const renderedRecipients = parsed.recipient_type && parsed.recipient_id
        ? renderTemplateValue([{ type: parsed.recipient_type, id: parsed.recipient_id }], state, templateOptions)
        : null
      const renderedDefaults = renderTemplateValue(parsed.defaults, state, templateOptions)
      const renderedIntegration = renderTemplateValue(parsed.integrationId, state, templateOptions)
      const integrationId = resolveStateBackedString(renderedIntegration, state)
      const timeoutMs = normalizeTimeout(
        (renderedInput as Record<string, unknown>)?.timeoutMs,
        normalizeTimeout(renderedDefaults.timeoutMs, DEFAULT_TIMEOUT_MS)
      )

      return {
        state,
        renderedInput,
        renderedRecipients,
        integrationId,
        trustedRuntimeContext,
        timeoutMs
      }
    }

    const resolveSendTarget = (
      runtimeContext: DingTalkTrustedRuntimeContext,
      configuredIntegrationId: string | null,
      renderedRecipients: unknown,
      state: Record<string, unknown>
    ): {
      source: 'runtime' | 'configured'
      integrationId: string | null
      recipients: DingTalkRecipient[]
    } => {
      const chatType = runtimeContext.chatType?.toLowerCase()
      if (chatType === 'group' && runtimeContext.chatId) {
        return {
          source: 'runtime',
          integrationId: runtimeContext.integrationId ?? null,
          recipients: [{ type: 'chat_id', id: runtimeContext.chatId }]
        }
      }

      if (chatType === 'private' && runtimeContext.senderRecipient) {
        return {
          source: 'runtime',
          integrationId: runtimeContext.integrationId ?? null,
          recipients: [runtimeContext.senderRecipient]
        }
      }

      return {
        source: 'configured',
        integrationId: configuredIntegrationId,
        recipients: normalizeRecipients(renderedRecipients, state)
      }
    }

    const requireIntegrationId = (integrationId: string | null, toolName: string) => {
      if (!integrationId) {
        throw new Error(`[${toolName}] A DingTalk trigger integration is required.`)
      }
      return integrationId
    }

    const requireTriggerRecipients = (recipients: DingTalkRecipient[], toolName: string) => {
      if (!recipients.length) {
        throw new Error(
          `[${toolName}] No trusted DingTalk recipient was found. Run this tool from a DingTalk-triggered conversation.`
        )
      }
      return recipients
    }

    const buildCommand = (toolName: string, toolCallId: string, result: DingTalkNotifyResult) => {
      return new Command({
        update: {
          dingtalk_notify_last_result: result,
          dingtalk_notify_last_message_ids: collectMessageIds(result),
          messages: [
            new ToolMessage({
              content: toToolMessageContent(result),
              name: toolName,
              tool_call_id: toolCallId,
              status: result.failureCount ? 'error' : 'success'
            })
          ]
        }
      })
    }

    const runSendTaskBatch = async (params: {
      integrationId: string
      toolName: string
      recipients: DingTalkRecipient[]
      timeoutMs: number
      allowDegraded?: boolean
      task: (recipient: DingTalkRecipient) => Promise<{ messageId?: string | null; degraded?: boolean }>
      onSuccess?: (recipient: DingTalkRecipient, result: { messageId?: string | null }) => Promise<void>
    }): Promise<DingTalkNotifyResult> => {
      const results: DingTalkNotifyResultItem[] = []

      for (let i = 0; i < params.recipients.length; i += MAX_BATCH_CONCURRENCY) {
        const group = params.recipients.slice(i, i + MAX_BATCH_CONCURRENCY)
        const settled = await Promise.allSettled(
          group.map(async (recipient) => {
            const result = await withTimeout(
              params.task(recipient),
              params.timeoutMs,
              `[${params.toolName}] send to ${recipient.type}:${recipient.id}`
            )
            if (result?.degraded === true && params.allowDegraded === false) {
              throw new Error('degraded delivery is not allowed for this mode')
            }
            if (params.onSuccess) {
              try {
                await params.onSuccess(recipient, result)
              } catch (error) {
                this.logger.warn(
                  `[${params.toolName}] post-send hook failed for ${recipient.type}:${recipient.id}: ${formatError(error)}`
                )
              }
            }
            return {
              target: `${recipient.type}:${recipient.id}`,
              success: true,
              messageId: result.messageId ?? null
            } as DingTalkNotifyResultItem
          })
        )

        settled.forEach((item, index) => {
          const recipient = group[index]
          if (item.status === 'fulfilled') {
            results.push(item.value)
          } else {
            results.push({
              target: `${recipient.type}:${recipient.id}`,
              success: false,
              error: formatError(item.reason)
            })
          }
        })
      }

      const successCount = results.filter((item) => item.success).length
      const failureCount = results.length - successCount

      this.logger.log(
        `[${params.toolName}] integrationId=${params.integrationId}, recipientCount=${params.recipients.length}, successCount=${successCount}, failureCount=${failureCount}`
      )

      return {
        tool: params.toolName,
        integrationId: params.integrationId,
        successCount,
        failureCount,
        results
      }
    }

    const tools = []

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'dingtalk_send_text_notification'
          const toolCallId = getToolCallIdFromConfig(config)
          const { state, renderedInput, renderedRecipients, integrationId, trustedRuntimeContext, timeoutMs } =
            resolveInput(parameters, config)
          const sendTarget = resolveSendTarget(trustedRuntimeContext, integrationId, renderedRecipients, state)
          if (sendTarget.source === 'runtime' && !sendTarget.integrationId) {
            throw new Error(`[${toolName}] The current DingTalk conversation is missing its trusted runtime integrationId.`)
          }
          const resolvedIntegrationId = requireIntegrationId(sendTarget.integrationId, toolName)
          const recipients = requireTriggerRecipients(sendTarget.recipients, toolName)
          const content = normalizeString(renderedInput.content)
          const conversationIds = resolveConversationIds(state)
          if (trustedRuntimeContext.chatId) {
            conversationIds.add(trustedRuntimeContext.chatId)
          }
          const sessionWebhook =
            normalizeString(trustedRuntimeContext.sessionWebhook) ||
            (sendTarget.source === 'configured'
              ? resolveSessionWebhookFromState((renderedInput as Record<string, unknown>)?.sessionWebhook, state)
              : null)
          const robotCodeOverride =
            normalizeDingTalkRobotCode(trustedRuntimeContext.robotCode) ||
            resolveRobotCodeFromState((renderedInput as Record<string, unknown>)?.robotCode, state)

          if (!content) {
            throw new Error(`[${toolName}] content is required`)
          }

          const result = await runSendTaskBatch({
            integrationId: resolvedIntegrationId,
            toolName,
            recipients,
            timeoutMs,
            allowDegraded: true,
            onSuccess: async (recipient) => {
              await this.tryBindConversationForRecipient({
                integrationId: resolvedIntegrationId,
                recipient,
                context
              })
            },
            task: async (recipient) => {
              const scopedSessionWebhook = await resolveSessionWebhookForRecipient(
                recipient,
                conversationIds,
                sessionWebhook,
                (id) => this.dingtalkChannel.getCachedSessionWebhook(resolvedIntegrationId, id)
              )
              const response = await this.dingtalkChannel.createMessage(resolvedIntegrationId, {
                recipient,
                sessionWebhook: scopedSessionWebhook,
                robotCodeOverride,
                msgType: 'text',
                content: {
                  text: content
                }
              })

              return {
                messageId: response?.data?.message_id ?? null,
                degraded: response?.degraded === true
              }
            }
          })

          return buildCommand(toolName, toolCallId, result)
        },
        {
          name: 'dingtalk_send_text_notification',
          description:
            'Send plain text to DingTalk users/chats. Use ONLY when: user explicitly asks to send/notify, or proactive notification to another recipient. Do NOT use for normal replies—output text directly.',
          schema: sendTextNotificationSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'dingtalk_send_file'
          const toolCallId = getToolCallIdFromConfig(config)
          const { state, renderedInput, renderedRecipients, integrationId, trustedRuntimeContext, timeoutMs } =
            resolveInput(parameters, config)
          const fileTarget = resolveSendTarget(trustedRuntimeContext, integrationId, renderedRecipients, state)
          if (fileTarget.source === 'runtime' && !fileTarget.integrationId) {
            throw new Error(`[${toolName}] The current DingTalk conversation is missing its trusted runtime integrationId.`)
          }
          const resolvedIntegrationId = requireIntegrationId(fileTarget.integrationId, toolName)
          const recipients = requireTriggerRecipients(fileTarget.recipients, toolName)
          const workspaceFiles = context.runtime?.capabilities?.get(WorkspaceFilesRuntimeCapability)
          if (!workspaceFiles?.readRuntimeBuffer) {
            throw new Error(
              `[${toolName}] platform.workspace.files runtime capability is required to read workspace files.`
            )
          }

          const file = await resolveDingTalkSendMediaFromWorkspace(
            buildDingTalkSendFileDescriptor(renderedInput as Record<string, unknown>),
            { workspaceFiles }
          )
          const uploaded = await withTimeout(
            this.dingtalkChannel.uploadFile(resolvedIntegrationId, file, timeoutMs),
            timeoutMs,
            `[${toolName}] upload '${file.fileName}'`
          )
          const robotCodeOverride =
            fileTarget.source === 'runtime'
              ? normalizeDingTalkRobotCode(trustedRuntimeContext.robotCode)
              : resolveRobotCodeFromState(undefined, state)
          const result = await runSendTaskBatch({
            integrationId: resolvedIntegrationId,
            toolName,
            recipients,
            timeoutMs,
            allowDegraded: false,
            onSuccess: async (recipient) => {
              await this.tryBindConversationForRecipient({
                integrationId: resolvedIntegrationId,
                recipient,
                context
              })
            },
            task: async (recipient) => {
              const response = await this.dingtalkChannel.createMessage(resolvedIntegrationId, {
                recipient,
                robotCodeOverride,
                msgType: 'interactive',
                content: buildDingTalkSendMediaContent(file, uploaded.mediaId),
                allowFallback: false
              })

              return {
                messageId: response?.data?.message_id ?? null,
                degraded: response?.degraded === true
              }
            }
          })
          result.data = {
            file: toDingTalkSendFileMetadata(file)
          }

          return buildCommand(toolName, toolCallId, result)
        },
        {
          name: 'dingtalk_send_file',
          description:
            'Send a generated, edited, or previously found Xpert workspace image or file to the trusted current DingTalk conversation. Images use the DingTalk image message channel; documents and archives use the file message channel. The tool cannot choose another integration, chat, or user.',
          schema: sendFileSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'dingtalk_send_rich_notification'
          const toolCallId = getToolCallIdFromConfig(config)
          const { state, renderedInput, renderedRecipients, integrationId, trustedRuntimeContext, timeoutMs } =
            resolveInput(parameters, config)
          const sendTarget = resolveSendTarget(trustedRuntimeContext, integrationId, renderedRecipients, state)
          if (sendTarget.source === 'runtime' && !sendTarget.integrationId) {
            throw new Error(`[${toolName}] The current DingTalk conversation is missing its trusted runtime integrationId.`)
          }
          const resolvedIntegrationId = requireIntegrationId(sendTarget.integrationId, toolName)
          const recipients = requireTriggerRecipients(sendTarget.recipients, toolName)
          const mode = renderedInput.mode as 'markdown' | 'interactive' | 'template'
          const conversationIds = resolveConversationIds(state)
          if (trustedRuntimeContext.chatId) {
            conversationIds.add(trustedRuntimeContext.chatId)
          }
          const sessionWebhook =
            normalizeString(trustedRuntimeContext.sessionWebhook) ||
            (sendTarget.source === 'configured'
              ? resolveSessionWebhookFromState((renderedInput as Record<string, unknown>)?.sessionWebhook, state)
              : null)
          const robotCodeOverride =
            normalizeDingTalkRobotCode(trustedRuntimeContext.robotCode) ||
            resolveRobotCodeFromState((renderedInput as Record<string, unknown>)?.robotCode, state)

          const markdown = normalizeString(renderedInput.markdown)
          const card = normalizeCardPayload(renderedInput.card)
          const msgKey = normalizeString(renderedInput.msgKey)
          const msgParam = renderedInput.msgParam

          if (mode === 'markdown' && !markdown) {
            throw new Error(`[${toolName}] markdown is required when mode=markdown`)
          }
          if (mode === 'interactive' && !card && !markdown) {
            throw new Error(`[${toolName}] card or markdown is required when mode=interactive`)
          }
          if (mode === 'template') {
            if (!msgKey) {
              throw new Error(`[${toolName}] msgKey is required when mode=template`)
            }
            if (msgParam == null || (typeof msgParam === 'string' && !msgParam.trim())) {
              throw new Error(`[${toolName}] msgParam is required when mode=template`)
            }
          }

          const result = await runSendTaskBatch({
            integrationId: resolvedIntegrationId,
            toolName,
            recipients,
            timeoutMs,
            allowDegraded: true,
            onSuccess: async (recipient) => {
              await this.tryBindConversationForRecipient({
                integrationId: resolvedIntegrationId,
                recipient,
                context
              })
            },
            task: async (recipient) => {
              const scopedSessionWebhook = await resolveSessionWebhookForRecipient(
                recipient,
                conversationIds,
                sessionWebhook,
                (id) => this.dingtalkChannel.getCachedSessionWebhook(resolvedIntegrationId, id)
              )
              const response = await this.dingtalkChannel.createMessage(resolvedIntegrationId, {
                recipient,
                sessionWebhook: scopedSessionWebhook,
                robotCodeOverride,
                msgType: mode === 'markdown' ? 'markdown' : 'interactive',
                content:
                  mode === 'markdown'
                    ? {
                        title: 'Xpert Notification',
                        markdown
                      }
                    : mode === 'template'
                      ? {
                          msgKey,
                          msgParam
                        }
                    : card || {
                        title: 'Xpert Notification',
                        markdown
                      }
              })

              return {
                messageId: response?.data?.message_id ?? null,
                degraded: response?.degraded === true
              }
            }
          })

          return buildCommand(toolName, toolCallId, result)
        },
        {
          name: 'dingtalk_send_rich_notification',
          description:
            'Send DingTalk rich notifications. mode=markdown for rich text; mode=interactive for action card; mode=template for raw msgKey/msgParam. Do NOT use for normal replies—output directly.',
          schema: sendRichNotificationSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'dingtalk_update_message'
          const toolCallId = getToolCallIdFromConfig(config)
          const { renderedInput, integrationId, trustedRuntimeContext, timeoutMs } = resolveInput(parameters, config)
          const resolvedIntegrationId = requireIntegrationId(
            trustedRuntimeContext.integrationId ?? integrationId,
            toolName
          )
          const messageId = normalizeString(renderedInput.messageId)
          const mode = renderedInput.mode as 'text' | 'interactive' | 'template'

          if (!messageId) {
            throw new Error(`[${toolName}] messageId is required`)
          }

          let content: Record<string, unknown> | null = null
          if (mode === 'text') {
            const text = normalizeString(renderedInput.content)
            if (!text) {
              throw new Error(`[${toolName}] content is required when mode=text`)
            }
            content = { text }
          } else if (mode === 'template') {
            const msgKey = normalizeString(renderedInput.msgKey)
            const msgParam = renderedInput.msgParam
            if (!msgKey) {
              throw new Error(`[${toolName}] msgKey is required when mode=template`)
            }
            if (msgParam == null || (typeof msgParam === 'string' && !msgParam.trim())) {
              throw new Error(`[${toolName}] msgParam is required when mode=template`)
            }
            content = {
              msgKey,
              msgParam
            }
          } else {
            const card = normalizeCardPayload(renderedInput.card)
            const markdown = normalizeString(renderedInput.markdown)
            if (!card && !markdown) {
              throw new Error(`[${toolName}] card or markdown is required when mode=interactive`)
            }
            content = card || { markdown }
          }

          const patchResult = await withTimeout(
            this.dingtalkChannel.patchMessage(resolvedIntegrationId, {
              messageId,
              content
            }),
            timeoutMs,
            `[${toolName}] update message '${messageId}'`
          )

          const result: DingTalkNotifyResult = {
            tool: toolName,
            integrationId: resolvedIntegrationId,
            successCount: 1,
            failureCount: 0,
            results: [
              {
                target: `message:${messageId}`,
                success: true,
                messageId
              }
            ],
            data: {
              degraded: patchResult?.degraded === true
            }
          }

          this.logger.log(
            `[${toolName}] integrationId=${resolvedIntegrationId}, recipientCount=1, successCount=1, failureCount=0`
          )

          return buildCommand(toolName, toolCallId, result)
        },
        {
          name: 'dingtalk_update_message',
          description:
            'Update an existing DingTalk message by messageId. Use when you need to modify content of a message you previously sent.',
          schema: updateMessageSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'dingtalk_recall_message'
          const toolCallId = getToolCallIdFromConfig(config)
          const { state, renderedInput, integrationId, trustedRuntimeContext, timeoutMs } =
            resolveInput(parameters, config)
          const resolvedIntegrationId = requireIntegrationId(
            trustedRuntimeContext.integrationId ?? integrationId,
            toolName
          )
          const messageId = normalizeString(renderedInput.messageId)

          if (!messageId) {
            throw new Error(`[${toolName}] messageId is required`)
          }

          const robotCodeOverride =
            normalizeDingTalkRobotCode(trustedRuntimeContext.robotCode) ||
            resolveRobotCodeFromState((renderedInput as Record<string, unknown>)?.robotCode, state)

          const recallResult = await withTimeout(
            this.dingtalkChannel.deleteMessage(resolvedIntegrationId, messageId, {
              robotCodeOverride,
              timeoutMs
            }),
            timeoutMs,
            `[${toolName}] recall message '${messageId}'`
          )

          if (recallResult?.success !== true) {
            throw new Error(`[${toolName}] recall failed`)
          }

          const result: DingTalkNotifyResult = {
            tool: toolName,
            integrationId: resolvedIntegrationId,
            successCount: 1,
            failureCount: 0,
            results: [
              {
                target: `message:${messageId}`,
                success: true,
                messageId
              }
            ],
            data: {
              degraded: recallResult?.degraded === true
            }
          }

          this.logger.log(
            `[${toolName}] integrationId=${resolvedIntegrationId}, recipientCount=1, successCount=1, failureCount=0`
          )

          return buildCommand(toolName, toolCallId, result)
        },
        {
          name: 'dingtalk_recall_message',
          description: 'Recall an existing DingTalk OTO message by messageId (human-bot conversation).',
          schema: recallMessageSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'dingtalk_list_users'
          const toolCallId = getToolCallIdFromConfig(config)
          const { renderedInput, integrationId, trustedRuntimeContext, timeoutMs } = resolveInput(parameters, config)
          const resolvedIntegrationId = requireIntegrationId(
            trustedRuntimeContext.integrationId ?? integrationId,
            toolName
          )
          const keyword = normalizeString(renderedInput.keyword)
          const pageSize = normalizeIntInRange(renderedInput.pageSize, 20, 1, 100)
          const pageToken = normalizeString(renderedInput.pageToken)

          const listResult = await withTimeout(
            this.dingtalkChannel.listUsers(resolvedIntegrationId, {
              keyword,
              pageSize,
              pageToken,
              timeoutMs
            }),
            timeoutMs,
            `[${toolName}] list users`
          )

          const result: DingTalkNotifyResult = {
            tool: toolName,
            integrationId: resolvedIntegrationId,
            successCount: 1,
            failureCount: 0,
            results: [{ target: 'users', success: true }],
            data: {
              items: listResult.items,
              pageToken: listResult.nextPageToken ?? null
            }
          }

          return buildCommand(toolName, toolCallId, result)
        },
        {
          name: 'dingtalk_list_users',
          description:
            'List DingTalk users for selecting notification recipients. Use when user asks to send to someone and you need to find their user ID.',
          schema: listUsersSchema,
          verboseParsingErrors: true
        }
      )
    )

    return {
      name: DINGTALK_NOTIFY_MIDDLEWARE_NAME,
      stateSchema: dingtalkNotifyStateSchema,
      tools
    }
  }
}

export type { DingTalkNotifyMiddlewareConfig, DingTalkNotifyState }
