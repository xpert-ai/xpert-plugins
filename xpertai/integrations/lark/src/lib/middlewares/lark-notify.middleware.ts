import { SystemMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { InferInteropZodInput, interopSafeParse } from '@langchain/core/utils/types'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
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
import { getToolCallIdFromConfig } from '../contracts-compat.js'
import { LarkConversationService } from '../conversation.service.js'
import { toRecipientConversationUserKey } from '../conversation-user-key.js'
import { LARK_NOTIFY_MIDDLEWARE_NAME, LARK_SEND_FILE_TOOL_NAME } from '../constants.js'
import { LarkChannelStrategy } from '../lark-channel.strategy.js'
import { LarkContextToolService, toLarkApplicationPermissionError } from '../lark-context-tool.service.js'
import { LarkRecipientDirectoryService } from '../lark-recipient-directory.service.js'
import {
  buildLarkFileSendUuid,
  readLarkUploadedFileKey,
  resolveLarkSendFileFromWorkspace,
  toLarkSendFileMetadata,
  type LarkSendFileDescriptor
} from '../lark-send-file.js'
import { iconImage } from '../types.js'
import { toLarkApiErrorMessage } from '../utils.js'
import { resolveLarkTrustedRuntimeContext } from './lark-trusted-runtime-context.js'

const DEFAULT_TIMEOUT_MS = 10000
const DEFAULT_POST_LOCALE = 'en_us'
const MAX_BATCH_CONCURRENCY = 5
const MAX_KNOWN_RECIPIENT_SUMMARY_NAMES = 8

// TODO: 当前 UI 只暴露 open_id 形式的 recipient_type 选择。
// 后端仍然支持 chat_id、user_id、union_id、email 等类型。
// 后续可以按产品需要继续扩展 UI 配置。
const RecipientTypeSchema = z.enum(['chat_id', 'open_id', 'user_id', 'union_id', 'email'])
const PostLocaleSchema = z.enum(['en_us', 'zh_cn', 'ja_jp'])

const middlewareConfigSchema = z.object({
  integrationId: z.string().optional().nullable(),
  trustedTriggerOnly: z.boolean().optional().default(false),
  // recipient_type 和 recipient_id 作为中间件级默认接收人配置
  recipient_type: RecipientTypeSchema.optional().nullable().describe('Lark receive_id_type (optional)'),
  recipient_id: z.string().optional().nullable().describe('Lark receive_id value (optional)'),
  template: z
    .object({
      enabled: z.boolean().default(true),
      strict: z.boolean().default(false)
    })
    .default({}),
  defaults: z
    .object({
      postLocale: PostLocaleSchema.default(DEFAULT_POST_LOCALE),
      timeoutMs: z.number().int().min(100).default(DEFAULT_TIMEOUT_MS)
    })
    .default({}),
  lookupTools: z
    .object({
      enabled: z.boolean().default(false)
    })
    .default({})
})

export const larkNotifyStateSchema = z.object({
  lark_notify_last_result: z.record(z.any()).nullable().default(null),
  lark_notify_last_message_ids: z.array(z.string()).default([]),
  lark_notify_known_recipients_summary: z.string().default(''),
  lark_notify_agent_guidance: z.string().default(''),
  lark_notify_recipient_directory_key: z.string().default('')
})

const RECIPIENT_NAME_FIELD_DESCRIPTION =
  'Preferred recipient name from the current Lark conversation context. Use a real person name that has already appeared in this chat, especially someone the user previously @mentioned.'

const RECIPIENT_NAMES_FIELD_DESCRIPTION =
  'Preferred recipient names from the current Lark conversation context. Each name should refer to someone already seen in this chat, especially via earlier @mentions.'

// TODO: 当前 tool-level recipient_id 默认按 open_id 处理。
// 如果后面需要支持 recipient_type override，再扩展 schema。
const sendTextNotificationSchema = z.object({
  content: z.string().describe('Text content to send'),
  recipient_name: z.string().optional().nullable().describe(RECIPIENT_NAME_FIELD_DESCRIPTION),
  recipient_names: z.array(z.string()).optional().nullable().describe(RECIPIENT_NAMES_FIELD_DESCRIPTION),
  // 兜底 ID：当中间件没有配置 recipient_id 时使用。
  // 当前 recipient_id 默认按 open_id 解释。
  recipient_id: z
    .string()
    .optional()
    .nullable()
    .describe(
      'Fallback recipient ID. Prefer recipient_name first; only use recipient_id when an explicit open_id-style target is already known in configuration.'
    ),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

// TODO: 当前 tool-level recipient_id 默认按 open_id 处理。
// 如果后面需要支持 recipient_type override，再扩展 schema。
const sendRichNotificationSchema = z.object({
  mode: z.enum(['post', 'interactive']).describe('post=rich text, interactive=card'),
  markdown: z.string().optional().nullable().describe('Markdown content for post mode'),
  card: z.record(z.any()).optional().nullable().describe('Lark interactive card payload for interactive mode'),
  locale: PostLocaleSchema.optional().nullable().describe('Locale key for post mode content'),
  recipient_name: z.string().optional().nullable().describe(RECIPIENT_NAME_FIELD_DESCRIPTION),
  recipient_names: z.array(z.string()).optional().nullable().describe(RECIPIENT_NAMES_FIELD_DESCRIPTION),
  // 兜底 ID：当中间件没有配置 recipient_id 时使用。
  // 当前 recipient_id 默认按 open_id 解释。
  recipient_id: z
    .string()
    .optional()
    .nullable()
    .describe(
      'Fallback recipient ID. Prefer recipient_name first; only use recipient_id when an explicit open_id-style target is already known in configuration.'
    ),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

const sendFileReferenceSchema = z
  .object({
    source: z.literal(WORKSPACE_FILES_SOURCE).optional(),
    filePath: z.string().optional().describe('Workspace-relative file path.'),
    workspacePath: z.string().optional().describe('Workspace-relative file path or sandbox /workspace path alias.')
  })

const sendFileDescriptorSchema = z
  .object({
    path: z.string().optional().describe('Sandbox /workspace path or workspace-relative path.'),
    filePath: z.string().optional().describe('Workspace-relative file path alias.'),
    workspacePath: z.string().optional().describe('Workspace-relative file path or sandbox /workspace path alias.'),
    fileRef: sendFileReferenceSchema
      .optional()
      .describe('Xpert workspace file reference returned by a file or history tool.'),
    originalName: z.string().optional().describe('Filename to show in Lark.'),
    name: z.string().optional().describe('Alias for originalName.'),
    mimeType: z.string().optional().describe('Optional MIME type.'),
    mimetype: z.string().optional().describe('Alias for mimeType.'),
    extension: z.string().optional().describe('Optional file extension without a leading dot.'),
    size: z.number().int().positive().optional().describe('Optional expected file size in bytes.')
  })

const sendFileSchema = z.object({
  file: sendFileDescriptorSchema
    .optional()
    .describe('File descriptor returned by Xpert file tools or local Lark history search.'),
  path: z.string().optional().describe('Sandbox /workspace path or workspace-relative path.'),
  filePath: z.string().optional().describe('Workspace-relative file path alias.'),
  workspacePath: z.string().optional().describe('Workspace-relative file path or sandbox /workspace path alias.'),
  fileRef: sendFileReferenceSchema.optional(),
  originalName: z.string().optional().describe('Filename to show in Lark.'),
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
  messageId: z.string().describe('Lark message id to update'),
  mode: z.enum(['text', 'interactive']).describe('text updates text content, interactive updates card content'),
  content: z.string().optional().nullable().describe('Text content for text mode'),
  markdown: z.string().optional().nullable().describe('Markdown content for interactive mode'),
  card: z.record(z.any()).optional().nullable().describe('Card payload for interactive mode'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

const recallMessageSchema = z.object({
  messageId: z.string().describe('Lark message id to recall'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

const listUsersSchema = z.object({
  keyword: z.string().optional().nullable().describe('Filter keyword for users'),
  pageSize: z.number().int().min(1).max(100).optional().nullable().default(20).describe('Lark users page size'),
  pageToken: z.string().optional().nullable().describe('Lark users page token'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

const listChatsSchema = z.object({
  keyword: z.string().optional().nullable().describe('Filter keyword for chats'),
  pageSize: z.number().int().min(1).max(100).optional().nullable().default(20).describe('Lark chats page size'),
  pageToken: z.string().optional().nullable().describe('Lark chats page token'),
  timeoutMs: z.number().int().min(100).optional().nullable().describe('Request timeout in milliseconds')
})

export type LarkNotifyResultItem = {
  target: string
  success: boolean
  messageId?: string | null
  error?: string
}

export type LarkNotifyResult = {
  tool: string
  integrationId: string
  successCount: number
  failureCount: number
  results: LarkNotifyResultItem[]
  data?: Record<string, unknown>
}

type LarkCommandResult = {
  failureCount: number
  results: Array<{
    success: boolean
    messageId?: string | null
  }>
}

type LarkRecipient = { type: z.infer<typeof RecipientTypeSchema>; id: string }
type LarkNotifyState = z.infer<typeof larkNotifyStateSchema>
type LarkNotifyMiddlewareConfig = InferInteropZodInput<typeof middlewareConfigSchema>
type LarkRecipientNameResolution =
  | { status: 'resolved'; recipient: LarkRecipient }
  | { status: 'not_found'; name: string }
  | { status: 'ambiguous'; name: string }

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

export function renderTemplateString(
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

export function renderTemplateValue<T>(
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

type LarkFileRuntimeContext = {
  integrationId: string | null
  chatId: string | null
  chatType: string | null
  senderOpenId: string | null
}

function buildLarkSendFileDescriptor(input: Record<string, unknown>): LarkSendFileDescriptor {
  const nestedFile = isPlainObject(input.file) ? input.file : {}
  const fileRef = readFirstRecord([nestedFile, input], ['fileRef', 'file_ref'])
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

function resolveLarkFileRuntimeContext(
  config: unknown,
  state: Record<string, unknown>,
  trustedTriggerOnly = false
): LarkFileRuntimeContext {
  const trusted = resolveLarkTrustedRuntimeContext(config)
  if (trustedTriggerOnly) {
    return {
      integrationId: trusted.integrationId ?? null,
      chatId: trusted.chatId ?? null,
      chatType: trusted.chatType ?? null,
      senderOpenId: trusted.senderOpenId ?? null
    }
  }
  const configRecord = isPlainObject(config) ? config : {}
  const configurable = isPlainObject(configRecord.configurable) ? configRecord.configurable : {}
  const configurableContext = isPlainObject(configurable.context) ? configurable.context : undefined
  const runtimePrincipal = isPlainObject(configurable.runtimePrincipal) ? configurable.runtimePrincipal : undefined
  const metadata = isPlainObject(configRecord.metadata) ? configRecord.metadata : {}
  const metadataContext = isPlainObject(metadata.context) ? metadata.context : undefined
  const stateRecords = findCurrentLarkStateRecords(state)
  const records = [configurableContext, metadataContext, runtimePrincipal, ...stateRecords]

  return {
    integrationId: readFirstString(records, ['sourceIntegrationId', 'integrationId']),
    chatId:
      readFirstString(records, ['chatId', 'openChatId', 'open_chat_id']) ||
      readFirstString(stateRecords, ['lark_conversation_context_current_chat_id']),
    chatType:
      readFirstString(records, ['chatType', 'chat_type']) ||
      readFirstString(stateRecords, ['lark_conversation_context_current_chat_type']),
    senderOpenId:
      readFirstString(records, ['senderOpenId', 'channelUserId', 'sender_open_id']) ||
      readFirstString(stateRecords, ['lark_conversation_context_current_sender_open_id'])
  }
}

function findCurrentLarkStateRecords(
  source: unknown,
  maxDepth = 4,
  visited = new WeakSet<object>()
): Array<Record<string, unknown>> {
  if (!source || typeof source !== 'object' || Array.isArray(source) || maxDepth < 0) {
    return []
  }
  const record = source as Record<string, unknown>
  if (visited.has(record)) {
    return []
  }
  visited.add(record)

  const currentContext = isPlainObject(record.lark_current_context) ? record.lark_current_context : undefined
  if (
    currentContext ||
    normalizeString(record.lark_conversation_context_current_chat_id) ||
    normalizeString(record.lark_conversation_context_current_sender_open_id)
  ) {
    return currentContext ? [currentContext, record] : [record]
  }

  for (const value of Object.values(record)) {
    const found = findCurrentLarkStateRecords(value, maxDepth - 1, visited)
    if (found.length) {
      return found
    }
  }
  return []
}

function resolveRuntimeIntegrationId(state: Record<string, unknown>): string | null {
  return readFirstString(
    [state, ...findCurrentLarkStateRecords(state)],
    ['sourceIntegrationId', 'integrationId', 'lark_conversation_context_current_integration_id']
  )
}

function readFirstRecord(
  records: Array<Record<string, unknown> | undefined>,
  keys: string[]
): Record<string, unknown> | undefined {
  for (const record of records) {
    if (!record) {
      continue
    }
    for (const key of keys) {
      if (isPlainObject(record[key])) {
        return record[key] as Record<string, unknown>
      }
    }
  }
  return undefined
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
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value
      }
    }
  }
  return null
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

function normalizeNameValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeNameValues(item))
  }
  return normalizeRecipientIdValues(value)
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

function findRecipientDirectoryKeyDeep(source: unknown, maxDepth = 4, visited = new WeakSet<object>()): string | null {
  if (!source || typeof source !== 'object' || maxDepth < 0) {
    return null
  }

  const record = source as Record<string, unknown>
  if (visited.has(record)) {
    return null
  }
  visited.add(record)

  const directMatch = resolveFirstStringByPaths(record, [
    'recipientDirectoryKey',
    'runtime.recipientDirectoryKey',
    'callback.context.recipientDirectoryKey',
    'message.recipientDirectoryKey',
    'lark_notify_recipient_directory_key'
  ])
  if (directMatch) {
    return directMatch
  }

  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue
    }
    const nested = findRecipientDirectoryKeyDeep(value, maxDepth - 1, visited)
    if (nested) {
      return nested
    }
  }

  return null
}

function normalizeRecipients(value: unknown, state: Record<string, unknown>): LarkRecipient[] {
  const recipientTypes = RecipientTypeSchema.options as readonly string[]
  if (!Array.isArray(value)) {
    return []
  }

  return value.reduce<LarkRecipient[]>((acc, item) => {
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
        type: type as LarkRecipient['type'],
        id
      })
    })

    return acc
  }, [])
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

function collectMessageIds(result: LarkCommandResult): string[] {
  return result.results.filter((item) => item.success && !!item.messageId).map((item) => item.messageId as string)
}

function toToolMessageContent(result: LarkCommandResult) {
  return JSON.stringify(result)
}

function formatError(error: unknown): string {
  const message = toLarkApiErrorMessage(error) || getErrorMessage(error)
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
@AgentMiddlewareStrategy(LARK_NOTIFY_MIDDLEWARE_NAME)
export class LarkNotifyMiddleware implements IAgentMiddlewareStrategy {
  private readonly logger = new Logger(LarkNotifyMiddleware.name)

  constructor(
    private readonly larkChannel: LarkChannelStrategy,
    private readonly conversationService: LarkConversationService,
    private readonly recipientDirectoryService: LarkRecipientDirectoryService,
    private readonly contextToolService: LarkContextToolService
  ) {}

  private resolveTargetXpertId(context: IAgentMiddlewareContext): string | null {
    return normalizeString(context?.xpertId)
  }

  private resolveRecipientDirectoryKey(state: Record<string, unknown>): string | null {
    return findRecipientDirectoryKeyDeep(state)
  }

  private formatKnownRecipientsSummary(directory: Awaited<ReturnType<LarkRecipientDirectoryService['get']>>): string {
    const entries = directory?.entries ?? []
    if (!entries.length) {
      return 'Known Lark recipients in this chat: none yet.'
    }

    const sorted = [...entries].sort((left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0))
    const names = Array.from(
      new Map(
        sorted
          .map((entry) => normalizeString(entry.name))
          .filter((name): name is string => Boolean(name))
          .map((name) => [name.toLocaleLowerCase(), name])
      ).values()
    )

    if (!names.length) {
      return 'Known Lark recipients in this chat: none yet.'
    }

    const summaryNames = names.slice(0, MAX_KNOWN_RECIPIENT_SUMMARY_NAMES)
    const remainingCount = names.length - summaryNames.length
    const suffix = remainingCount > 0 ? ` plus ${remainingCount} more recent recipients.` : '.'

    return `Known Lark recipients in this chat (use these exact names with recipient_name): ${summaryNames.join(
      ', '
    )}${suffix}`
  }

  private formatAgentGuidance(
    summary: string,
    directory: Awaited<ReturnType<LarkRecipientDirectoryService['get']>>
  ): string {
    const entries = directory?.entries ?? []
    const duplicateNames = new Set<string>()
    const seenNames = new Set<string>()
    for (const entry of entries) {
      const normalized = normalizeString(entry.name)?.toLocaleLowerCase()
      const displayName = normalizeString(entry.name)
      if (!normalized || !displayName) {
        continue
      }
      if (seenNames.has(normalized)) {
        duplicateNames.add(displayName)
      } else {
        seenNames.add(normalized)
      }
    }

    const lines = [
      'Lark notify operating rules:',
      '- Default to lark_send_text_notification or lark_send_rich_notification for message notifications.',
      '- Use lark_send_file for generated or edited workspace files. Never paste a local or workspace path into the user-facing reply.',
      '- Prefer recipient_name and real display names from the current group context.',
      `- ${summary}`,
      '- Do not ask the user for open_id and do not expose open_id in normal conversation.',
      '- Do not call lark_list_users as the default discovery step.',
      '- If the target person is not known in this chat yet, ask the user to @mention that person first.'
    ]

    if (duplicateNames.size > 0) {
      lines.push(
        `- These names are currently ambiguous in this chat: ${Array.from(duplicateNames).join(
          ', '
        )}. If the user refers to one of them, ask the user to @mention the target person again.`
      )
    } else {
      lines.push('- If multiple people might match the same name, ask the user to @mention the target person again.')
    }

    return lines.join('\n')
  }

  private async resolveRecipientsByName(
    directoryKey: string | null,
    names: string[]
  ): Promise<LarkRecipientNameResolution[]> {
    const normalizedNames = normalizeNameValues(names)
    if (!normalizedNames.length) {
      return []
    }

    const resolutions: LarkRecipientNameResolution[] = []
    for (const name of normalizedNames) {
      const result = await this.recipientDirectoryService.resolveByName(directoryKey, name)
      if (result.status === 'resolved') {
        resolutions.push({
          status: 'resolved',
          recipient: {
            type: 'open_id',
            id: result.entry.openId
          }
        })
        continue
      }

      resolutions.push({
        status: result.status,
        name
      })
    }

    return resolutions
  }

  private async tryBindConversationForRecipient(params: {
    integrationId: string
    recipient: LarkRecipient
    context: IAgentMiddlewareContext
  }): Promise<void> {
    const { integrationId, recipient, context } = params
    if (recipient.type === 'chat_id') {
      this.logger.verbose(
        `[${LARK_NOTIFY_MIDDLEWARE_NAME}] Skip conversation binding for recipient ${recipient.type}:${recipient.id}`
      )
      return
    }

    const conversationId = normalizeString(context?.conversationId)
    if (!conversationId) {
      this.logger.warn(
        `[${LARK_NOTIFY_MIDDLEWARE_NAME}] Skip conversation binding for recipient ${recipient.type}:${recipient.id}: missing context.conversationId`
      )
      return
    }

    const xpertId = this.resolveTargetXpertId(context)
    if (!xpertId) {
      this.logger.warn(
        `[${LARK_NOTIFY_MIDDLEWARE_NAME}] Skip conversation binding for recipient ${recipient.type}:${recipient.id}: missing xpertId`
      )
      return
    }

    // Note: The current notify binding key is recipient.type:id; the webhook continue chat query key is open_id:*. Therefore, to ensure "continued chat is possible after notification", it is recommended that the recipient use open_id.
    const conversationUserKey = toRecipientConversationUserKey(recipient?.type, recipient?.id)
    if (!conversationUserKey) {
      this.logger.warn(
        `[${LARK_NOTIFY_MIDDLEWARE_NAME}] Skip conversation binding for recipient ${recipient.type}:${recipient.id}: recipient key is invalid`
      )
      return
    }

    try {
      await this.conversationService.setConversation(conversationUserKey, xpertId, conversationId)
      this.logger.log(
        `[${LARK_NOTIFY_MIDDLEWARE_NAME}] Bound "${conversationUserKey}" to conversation "${conversationId}" for xpert "${xpertId}" (integration: ${integrationId})`
      )
    } catch (error) {
      this.logger.warn(
        `[${LARK_NOTIFY_MIDDLEWARE_NAME}] Failed to bind recipient ${recipient.type}:${
          recipient.id
        } to conversation "${conversationId}": ${formatError(error)}`
      )
    }
  }

  meta: TAgentMiddlewareMeta = {
    name: LARK_NOTIFY_MIDDLEWARE_NAME,
    builtin: true,
    icon: {
      type: 'image',
      value: iconImage
    },
    label: {
      en_US: 'Lark Notify Middleware',
      zh_Hans: '飞书通知中间件'
    },
    description: {
      en_US:
        'Provides Lark notification and workspace file sending tools. File sends use the trusted current conversation or configured scheduled recipient. Prefer sending message notifications by recipient_name instead of exposing open_id.',
      zh_Hans:
        '提供飞书通知和 workspace 文件发送工具。文件只发送到可信的当前会话或定时任务预配置接收人；消息通知优先基于当前对话中的真实姓名发送，而不是直接暴露 open_id。'
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
            en_US: 'Default integration used by notify tools',
            zh_Hans: '通知工具默认使用的飞书集成。'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/integration/select-options?provider=lark',
            variable: true,
            span: 2
          }
        },
        // TODO: 当前 UI 先只支持 open_id。
        // 其他接收类型后续可以在不改后端能力的前提下补进 UI。
        recipient_type: {
          type: 'string',
          // 目前先限制为 open_id，保证配置与工具调用一致。
          enum: ['open_id'],
          default: 'open_id',
          title: {
            en_US: 'Recipient type',
            zh_Hans: '接收方类型'
          },
          description: {
            en_US: 'Currently only open_id is supported in UI. Backend supports other types via configuration.',
            zh_Hans: '当前 UI 仅支持 open_id。后端仍可通过配置使用其他类型。'
          }
        },
        recipient_id: {
          type: 'string',
          description: {
            en_US:
              'Optional fallback recipient ID. For normal conversations, prefer recipient_name so the model can work with real names instead of open_id.',
            zh_Hans:
              '可选的兜底接收方 ID。普通对话中优先使用 recipient_name，让模型基于真实姓名工作，而不是直接依赖 open_id。'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: '/api/lark/user-select-options?integration=lark',
            variable: true,
            depends: [
              {
                name: 'integrationId',
                alias: 'integration'
              }
            ]
          }
        },
        template: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              default: true,
              title: {
                en_US: 'Enable Mustache Template',
                zh_Hans: '启用 Mustache 模板'
              }
            },
            strict: {
              type: 'boolean',
              default: false,
              title: {
                en_US: 'Strict Template Mode',
                zh_Hans: '严格模板模式'
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
            postLocale: {
              type: 'string',
              enum: ['en_us', 'zh_cn', 'ja_jp'],
              default: DEFAULT_POST_LOCALE,
              title: {
                en_US: 'Post Locale',
                zh_Hans: '消息语言'
              }
            },
            timeoutMs: {
              type: 'number',
              default: DEFAULT_TIMEOUT_MS,
              minimum: 100,
              title: {
                en_US: 'Timeout (ms)',
                zh_Hans: '超时（毫秒）'
              }
            }
          },
          'x-ui': {
            span: 2
          }
        },
        lookupTools: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              default: false,
              title: {
                en_US: 'Enable Lookup Tools',
                zh_Hans: '启用查询工具'
              },
              description: {
                en_US:
                  'Expose list users/chats tools for admin or debugging only. Keep disabled for normal name-based chat flows.',
                zh_Hans: '仅为管理或调试场景暴露用户/群组列表工具。普通基于姓名的对话流程建议保持关闭。'
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
    options: LarkNotifyMiddlewareConfig,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const { data, error } = interopSafeParse(middlewareConfigSchema, options ?? {})
    if (error) {
      throw new Error(`LarkNotifyMiddleware configuration error: ${error.message}`)
    }

    const parsed = data!
    const templateOptions = {
      enabled: parsed.template?.enabled !== false,
      strict: parsed.template?.strict === true
    }
    const lookupToolsEnabled = parsed.lookupTools?.enabled === true

    /**
     * 解析工具输入与中间件默认配置。
     * 1. 中间件可预置 recipient_type + recipient_id。
     * 2. tool call 的 recipient_id 当前默认按 open_id 处理。
     * 3. 如果后续需要更多类型，再扩展 recipient_type override。
     */
    const resolveInput = <T extends Record<string, unknown>>(value: T, config?: unknown) => {
      const state = getCurrentStateSafe()
      const trustedRuntimeContext = resolveLarkFileRuntimeContext(config, state, true)
      const renderedInput = renderTemplateValue(value, state, templateOptions)
      const renderedDefaults = renderTemplateValue(parsed.defaults, state, templateOptions)
      const renderedIntegration = renderTemplateValue(parsed.integrationId, state, templateOptions)
      const integrationId =
        trustedRuntimeContext.integrationId ??
        (parsed.trustedTriggerOnly
          ? null
          : resolveRuntimeIntegrationId(state) ?? resolveStateBackedString(renderedIntegration, state))
      const recipientDirectoryKey = this.resolveRecipientDirectoryKey(state)
      const timeoutMs = normalizeTimeout(
        (renderedInput as Record<string, unknown>)?.timeoutMs,
        normalizeTimeout(renderedDefaults.timeoutMs, DEFAULT_TIMEOUT_MS)
      )

      // 中间件级默认接收人配置。
      // 当前 recipient_id 按 recipient_type 指定的类型解释，默认是 open_id。
      let renderedRecipients: unknown = null
      if (parsed.recipient_id) {
        const recipientType = parsed.recipient_type || 'open_id'
        renderedRecipients = renderTemplateValue(
          [{ type: recipientType, id: parsed.recipient_id }],
          state,
          templateOptions
        )
      }

      return {
        state,
        renderedInput,
        renderedRecipients,
        renderedDefaults,
        integrationId,
        trustedRuntimeContext,
        recipientDirectoryKey,
        timeoutMs
      }
    }

    /**
     * 解析最终接收人。
     * 1. 优先根据当前会话中的姓名解析接收人。
     * 2. 如果没有姓名，再回退到 middleware 或 tool call 中的 recipient_id。
     */
    const resolveRecipients = async (
      renderedRecipients: unknown,
      toolRecipientNames: unknown,
      toolRecipientId: unknown,
      state: Record<string, unknown>,
      recipientDirectoryKey: string | null
    ): Promise<LarkRecipient[]> => {
      // 姓名解析优先于 middleware 默认接收人。
      const nameResolutions = await this.resolveRecipientsByName(
        recipientDirectoryKey,
        normalizeNameValues(toolRecipientNames)
      )
      const unresolved = nameResolutions.filter((item) => item.status !== 'resolved')
      if (unresolved.length > 0) {
        const [first] = unresolved
        if (first.status === 'ambiguous') {
          throw new Error(`无法唯一定位接收人 ${first.name}。请让用户在当前会话里通过 @ 明确指向该成员。`)
        }
        throw new Error(`找不到接收人 ${first.name}。请先让用户在当前会话中 @ ${first.name}。`)
      }
      const nameRecipients = nameResolutions
        .filter(
          (item): item is Extract<LarkRecipientNameResolution, { status: 'resolved' }> => item.status === 'resolved'
        )
        .map((item) => item.recipient)
      if (nameRecipients.length > 0) {
        return nameRecipients
      }

      // 再回退到 tool call 的 recipient_id。
      // TODO: 如果未来需要，可支持在 tool call 中覆盖 recipient_type。
      const middlewareRecipients = normalizeRecipients(renderedRecipients, state)
      if (middlewareRecipients.length > 0) {
        return middlewareRecipients
      }

      const toolRecipientIdStr = normalizeString(toolRecipientId)
      if (toolRecipientIdStr) {
        // 允许 recipient_id 指向一个 Mustache 渲染后的状态变量。
        const resolvedValue = getValueByPath(state, toolRecipientIdStr)
        const resolvedIds =
          resolvedValue !== undefined
            ? normalizeRecipientIdValues(resolvedValue)
            : normalizeRecipientIdValues(toolRecipientIdStr)

        if (resolvedIds.length > 0) {
          return resolvedIds.map((id) => ({
            type: 'open_id' as const,
            id
          }))
        }
      }

      return []
    }

    const resolveFileTarget = (
      runtimeContext: LarkFileRuntimeContext,
      configuredIntegrationId: string | null,
      renderedRecipients: unknown,
      state: Record<string, unknown>
    ): {
      source: 'runtime' | 'configured'
      integrationId: string | null
      recipients: LarkRecipient[]
    } => {
      if (runtimeContext.chatId) {
        return {
          source: 'runtime',
          integrationId: runtimeContext.integrationId,
          recipients: [{ type: 'chat_id', id: runtimeContext.chatId }]
        }
      }

      const chatType = runtimeContext.chatType?.toLowerCase()
      if (runtimeContext.senderOpenId && (chatType === 'p2p' || chatType === 'private' || chatType === 'single')) {
        return {
          source: 'runtime',
          integrationId: runtimeContext.integrationId,
          recipients: [{ type: 'open_id', id: runtimeContext.senderOpenId }]
        }
      }

      return {
        source: 'configured',
        integrationId: configuredIntegrationId,
        recipients: normalizeRecipients(renderedRecipients, state)
      }
    }

    const requireFileRecipients = (recipients: LarkRecipient[]) => {
      if (!recipients.length) {
        throw new Error(
          `[${LARK_SEND_FILE_TOOL_NAME}] No trusted Lark file recipient was found. Run this tool from a Lark conversation, or configure a middleware recipient for a scheduled/proactive run.`
        )
      }
      return recipients
    }

    const requireIntegrationId = (integrationId: string | null, toolName: string) => {
      if (!integrationId) {
        throw new Error(`[${toolName}] integrationId is required. Configure middleware integration.`)
      }
      return integrationId
    }

    /**
     * 确保至少有一个有效接收人。
     */
    const requireRecipients = (recipients: LarkRecipient[], toolName: string) => {
      if (!recipients.length) {
        throw new Error(
          `[${toolName}] No valid Lark recipient was found. Prefer recipient_name from the current conversation context. If the target person has not appeared in this group chat yet, ask the user to @mention them first. Use recipient_id only as a fallback when a stable ID is already configured.`
        )
      }
      return recipients
    }

    const getClient = async (integrationId: string, timeoutMs: number, toolName: string) => {
      try {
        return await withTimeout(
          this.larkChannel.getOrCreateLarkClientById(integrationId),
          timeoutMs,
          `[${toolName}] load integration '${integrationId}'`
        )
      } catch (error) {
        throw new Error(`[${toolName}] Integration '${integrationId}' is unavailable: ${formatError(error)}`)
      }
    }

    const buildCommand = <T extends LarkCommandResult>(toolName: string, toolCallId: string, result: T) => {
      return new Command({
        update: {
          lark_notify_last_result: result,
          lark_notify_last_message_ids: collectMessageIds(result),
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

    const buildApplicationPermissionCommand = async (params: {
      error: unknown
      toolName: string
      toolCallId: string
      integrationId: string
      chatId: string | null
      operation: string
    }): Promise<Command | null> => {
      const permissionError = toLarkApplicationPermissionError(params.error, params.toolName, params.operation)
      if (!permissionError) {
        return null
      }

      let permissionGuideSent = false
      let permissionGuideError: string | undefined
      if (params.chatId) {
        try {
          await this.contextToolService.sendApplicationPermissionGuideCard({
            integrationId: params.integrationId,
            chatId: params.chatId,
            scopes: permissionError.scopes,
            toolCallId: params.toolCallId
          })
          permissionGuideSent = true
        } catch (error) {
          permissionGuideError = formatError(error)
        }
      } else {
        permissionGuideError = 'No trusted current Lark chat was available for the permission guide.'
      }

      const result = {
        tool: params.toolName,
        success: false,
        error: 'lark_application_permission_required',
        requiredScopes: permissionError.scopes,
        permissionGuideSent,
        ...(permissionGuideError ? { permissionGuideError } : {}),
        message: permissionGuideSent
          ? 'An administrator permission guide card was sent to the current Lark chat. Do not retry this tool until an administrator enables the permissions and publishes the app.'
          : 'The Lark application is missing required permissions. Ask an administrator to enable the listed scopes and publish the app before retrying.'
      }

      return new Command({
        update: {
          lark_notify_last_result: result,
          messages: [
            new ToolMessage({
              content: JSON.stringify(result),
              name: params.toolName,
              tool_call_id: params.toolCallId,
              status: 'success'
            })
          ]
        },
        ...(permissionGuideSent ? { goto: 'end' } : {})
      })
    }

    const runSendTaskBatch = async (params: {
      integrationId: string
      toolName: string
      toolCallId: string
      permissionGuideChatId: string | null
      operation: string
      recipients: LarkRecipient[]
      timeoutMs: number
      task: (recipient: LarkRecipient) => Promise<{ messageId?: string | null }>
      onSuccess?: (recipient: LarkRecipient, result: { messageId?: string | null }) => Promise<void>
    }) => {
      const results: LarkNotifyResultItem[] = []
      let applicationPermissionCause: unknown

      for (let i = 0; i < params.recipients.length; i += MAX_BATCH_CONCURRENCY) {
        const group = params.recipients.slice(i, i + MAX_BATCH_CONCURRENCY)
        const settled = await Promise.allSettled(
          group.map(async (recipient) => {
            const result = await withTimeout(
              params.task(recipient),
              params.timeoutMs,
              `[${params.toolName}] send to ${recipient.type}:${recipient.id}`
            )
            if (params.onSuccess) {
              try {
                await params.onSuccess(recipient, result)
              } catch (error) {
                this.logger.warn(
                  `[${params.toolName}] post-send hook failed for ${recipient.type}:${recipient.id}: ${formatError(
                    error
                  )}`
                )
              }
            }
            return {
              target: `${recipient.type}:${recipient.id}`,
              success: true,
              messageId: result.messageId ?? null
            } as LarkNotifyResultItem
          })
        )

        settled.forEach((item, index) => {
          const recipient = group[index]
          if (item.status === 'fulfilled') {
            results.push(item.value)
          } else {
            if (
              applicationPermissionCause === undefined &&
              toLarkApplicationPermissionError(item.reason, params.toolName, params.operation)
            ) {
              applicationPermissionCause = item.reason
            }
            results.push({
              target: `${recipient.type}:${recipient.id}`,
              success: false,
              error: formatError(item.reason)
            })
          }
        })

        if (applicationPermissionCause !== undefined) {
          break
        }
      }

      const successCount = results.filter((item) => item.success).length
      const failureCount = results.length - successCount

      this.logger.log(
        `[${params.toolName}] integrationId=${params.integrationId}, recipientCount=${params.recipients.length}, successCount=${successCount}, failureCount=${failureCount}`
      )

      const result: LarkNotifyResult = {
        tool: params.toolName,
        integrationId: params.integrationId,
        successCount,
        failureCount,
        results
      }
      const permissionCommand =
        applicationPermissionCause === undefined
          ? null
          : await buildApplicationPermissionCommand({
              error: applicationPermissionCause,
              toolName: params.toolName,
              toolCallId: params.toolCallId,
              integrationId: params.integrationId,
              chatId: params.permissionGuideChatId,
              operation: params.operation
            })

      return { result, permissionCommand }
    }

    const tools = []
    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'lark_send_text_notification'
          const toolCallId = getToolCallIdFromConfig(config)
          const {
            state,
            renderedInput,
            renderedRecipients,
            integrationId,
            recipientDirectoryKey,
            trustedRuntimeContext,
            timeoutMs
          } = resolveInput(parameters, config)
          const resolvedIntegrationId = requireIntegrationId(integrationId, toolName)
          // 接收人优先级：当前会话姓名 > middleware 默认配置 > tool call recipient_id
          const recipients = requireRecipients(
            await resolveRecipients(
              renderedRecipients,
              [
                (renderedInput as Record<string, unknown>)?.recipient_name,
                (renderedInput as Record<string, unknown>)?.recipient_names
              ],
              (renderedInput as Record<string, unknown>)?.recipient_id,
              state,
              recipientDirectoryKey
            ),
            toolName
          )
          const content = normalizeString(renderedInput.content)

          if (!content) {
            throw new Error(`[${toolName}] content is required`)
          }

          const client = await getClient(resolvedIntegrationId, timeoutMs, toolName)

          const batch = await runSendTaskBatch({
            integrationId: resolvedIntegrationId,
            toolName,
            toolCallId,
            permissionGuideChatId: parsed.trustedTriggerOnly
              ? trustedRuntimeContext.chatId
              : resolveLarkFileRuntimeContext(config, state).chatId,
            operation: 'Failed to send text notification',
            recipients,
            timeoutMs,
            onSuccess: async (recipient) => {
              await this.tryBindConversationForRecipient({
                integrationId: resolvedIntegrationId,
                recipient,
                context
              })
            },
            task: async (recipient) => {
              const response = await client.im.message.create({
                params: {
                  receive_id_type: recipient.type
                },
                data: {
                  receive_id: recipient.id,
                  msg_type: 'text',
                  content: JSON.stringify({ text: content })
                }
              })

              return {
                messageId: response?.data?.message_id ?? null
              }
            }
          })
          if (batch.permissionCommand) {
            return batch.permissionCommand
          }

          return buildCommand(toolName, toolCallId, batch.result)
        },
        {
          name: 'lark_send_text_notification',
          description:
            'Send a text notification in Lark. Prefer recipient_name from the current conversation context, especially names learned from earlier @mentions in this chat. If the person has not been identified in this chat yet, ask the user to @mention them first instead of asking for open_id.',
          schema: sendTextNotificationSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = LARK_SEND_FILE_TOOL_NAME
          const toolCallId = getToolCallIdFromConfig(config)
          const { state, renderedInput, renderedRecipients, integrationId, trustedRuntimeContext, timeoutMs } =
            resolveInput(parameters, config)
          const runtimeContext = parsed.trustedTriggerOnly
            ? trustedRuntimeContext
            : resolveLarkFileRuntimeContext(config, state)
          const fileTarget = resolveFileTarget(runtimeContext, integrationId, renderedRecipients, state)
          if (fileTarget.source === 'runtime' && !fileTarget.integrationId) {
            throw new Error(`[${toolName}] The current Lark conversation is missing its trusted runtime integrationId.`)
          }
          const resolvedIntegrationId = requireIntegrationId(fileTarget.integrationId, toolName)
          const recipients = requireFileRecipients(fileTarget.recipients)
          const workspaceFiles = context.runtime?.capabilities?.get(WorkspaceFilesRuntimeCapability)
          if (!workspaceFiles?.readRuntimeBuffer) {
            throw new Error(
              `[${toolName}] platform.workspace.files runtime capability is required to read workspace files.`
            )
          }

          const file = await resolveLarkSendFileFromWorkspace(
            buildLarkSendFileDescriptor(renderedInput as Record<string, unknown>),
            { workspaceFiles }
          )
          const client = await getClient(resolvedIntegrationId, timeoutMs, toolName)

          let uploadResponse: unknown
          try {
            uploadResponse = await withTimeout(
              client.im.file.create({
                data: {
                  file_type: file.fileType,
                  file_name: file.fileName,
                  file: file.buffer
                }
              }),
              timeoutMs,
              `[${toolName}] upload '${file.fileName}'`
            )
          } catch (error) {
            const permissionCommand = await buildApplicationPermissionCommand({
              error,
              toolName,
              toolCallId,
              integrationId: resolvedIntegrationId,
              chatId: runtimeContext.chatId,
              operation: `Failed to upload '${file.fileName}'`
            })
            if (permissionCommand) {
              return permissionCommand
            }
            throw new Error(`[${toolName}] Failed to upload '${file.fileName}': ${formatError(error)}`)
          }

          const fileKey = readLarkUploadedFileKey(uploadResponse)
          if (!fileKey) {
            throw new Error(`[${toolName}] Lark file upload did not return file_key.`)
          }

          const batch = await runSendTaskBatch({
            integrationId: resolvedIntegrationId,
            toolName,
            toolCallId,
            permissionGuideChatId: runtimeContext.chatId,
            operation: `Failed to send '${file.fileName}'`,
            recipients,
            timeoutMs,
            onSuccess: async (recipient) => {
              await this.tryBindConversationForRecipient({
                integrationId: resolvedIntegrationId,
                recipient,
                context
              })
            },
            task: async (recipient) => {
              const uuid = buildLarkFileSendUuid({
                toolCallId,
                integrationId: resolvedIntegrationId,
                recipientType: recipient.type,
                recipientId: recipient.id,
                sha256: file.sha256
              })
              const response = await client.im.message.create({
                params: {
                  receive_id_type: recipient.type
                },
                data: {
                  receive_id: recipient.id,
                  msg_type: file.messageType,
                  content: JSON.stringify({ file_key: fileKey }),
                  ...(uuid ? { uuid } : {})
                }
              })

              return {
                messageId: response?.data?.message_id ?? null
              }
            }
          })
          if (batch.permissionCommand) {
            return batch.permissionCommand
          }
          const batchResult = batch.result
          const result = {
            file: toLarkSendFileMetadata(file),
            successCount: batchResult.successCount,
            failureCount: batchResult.failureCount,
            results: batchResult.results.map((item, index) => ({
              index: index + 1,
              success: item.success,
              ...(item.messageId ? { messageId: item.messageId } : {}),
              ...(item.error ? { error: item.error } : {})
            }))
          }

          return buildCommand(toolName, toolCallId, result)
        },
        {
          name: LARK_SEND_FILE_TOOL_NAME,
          description:
            'Send a generated, edited, or previously found Xpert workspace file to the trusted current Lark conversation. Scheduled/proactive runs use only the middleware-configured recipient. The tool cannot choose another integration, chat, or user.',
          schema: sendFileSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'lark_send_rich_notification'
          const toolCallId = getToolCallIdFromConfig(config)
          const {
            state,
            renderedInput,
            renderedRecipients,
            renderedDefaults,
            integrationId,
            recipientDirectoryKey,
            trustedRuntimeContext,
            timeoutMs
          } = resolveInput(parameters, config)
          const resolvedIntegrationId = requireIntegrationId(integrationId, toolName)
          // 接收人优先级：当前会话姓名 > middleware 默认配置 > tool call recipient_id
          const recipients = requireRecipients(
            await resolveRecipients(
              renderedRecipients,
              [
                (renderedInput as Record<string, unknown>)?.recipient_name,
                (renderedInput as Record<string, unknown>)?.recipient_names
              ],
              (renderedInput as Record<string, unknown>)?.recipient_id,
              state,
              recipientDirectoryKey
            ),
            toolName
          )
          const mode = renderedInput.mode as 'post' | 'interactive'
          const localeCandidate =
            normalizeString(renderedInput.locale) || normalizeString(renderedDefaults.postLocale) || DEFAULT_POST_LOCALE

          if (!PostLocaleSchema.options.includes(localeCandidate as any)) {
            throw new Error(`[${toolName}] locale must be one of: ${PostLocaleSchema.options.join(', ')}`)
          }
          const locale = localeCandidate as z.infer<typeof PostLocaleSchema>

          const markdown = normalizeString(renderedInput.markdown)
          const card = isPlainObject(renderedInput.card) ? renderedInput.card : null

          if (mode === 'post' && !markdown) {
            throw new Error(`[${toolName}] markdown is required when mode=post`)
          }
          if (mode === 'interactive' && !card && !markdown) {
            throw new Error(`[${toolName}] card or markdown is required when mode=interactive`)
          }
          if (mode === 'interactive') {
            await this.larkChannel.assertCardPayloadSupportedByIntegrationId(
              resolvedIntegrationId,
              card || {
                elements: [{ tag: 'markdown', content: markdown }]
              },
              toolName
            )
          }

          const client = await getClient(resolvedIntegrationId, timeoutMs, toolName)

          const batch = await runSendTaskBatch({
            integrationId: resolvedIntegrationId,
            toolName,
            toolCallId,
            permissionGuideChatId: parsed.trustedTriggerOnly
              ? trustedRuntimeContext.chatId
              : resolveLarkFileRuntimeContext(config, state).chatId,
            operation: 'Failed to send rich notification',
            recipients,
            timeoutMs,
            onSuccess: async (recipient) => {
              await this.tryBindConversationForRecipient({
                integrationId: resolvedIntegrationId,
                recipient,
                context
              })
            },
            task: async (recipient) => {
              const response = await client.im.message.create({
                params: {
                  receive_id_type: recipient.type
                },
                data: {
                  receive_id: recipient.id,
                  msg_type: mode === 'post' ? 'post' : 'interactive',
                  content:
                    mode === 'post'
                      ? JSON.stringify({
                          [locale]: {
                            content: [
                              [
                                {
                                  tag: 'md',
                                  text: markdown
                                }
                              ]
                            ]
                          }
                        })
                      : JSON.stringify(
                          card || {
                            elements: [{ tag: 'markdown', content: markdown }]
                          }
                        )
                }
              })

              return {
                messageId: response?.data?.message_id ?? null
              }
            }
          })
          if (batch.permissionCommand) {
            return batch.permissionCommand
          }

          return buildCommand(toolName, toolCallId, batch.result)
        },
        {
          name: 'lark_send_rich_notification',
          description:
            'Send a rich Lark notification (post or interactive card). Prefer recipient_name from the current conversation context, especially names learned from earlier @mentions in this chat. If the person has not been identified in this chat yet, ask the user to @mention them first instead of asking for open_id.',
          schema: sendRichNotificationSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'lark_update_message'
          const toolCallId = getToolCallIdFromConfig(config)
          const { renderedInput, integrationId, timeoutMs } = resolveInput(parameters, config)
          const resolvedIntegrationId = requireIntegrationId(integrationId, toolName)
          const messageId = normalizeString(renderedInput.messageId)
          const mode = renderedInput.mode as 'text' | 'interactive'

          if (!messageId) {
            throw new Error(`[${toolName}] messageId is required`)
          }

          let content: string = null
          if (mode === 'text') {
            const text = normalizeString(renderedInput.content)
            if (!text) {
              throw new Error(`[${toolName}] content is required when mode=text`)
            }
            content = JSON.stringify({ text })
          } else {
            const card = isPlainObject(renderedInput.card) ? renderedInput.card : null
            const markdown = normalizeString(renderedInput.markdown)
            if (!card && !markdown) {
              throw new Error(`[${toolName}] card or markdown is required when mode=interactive`)
            }
            await this.larkChannel.assertCardPayloadSupportedByIntegrationId(
              resolvedIntegrationId,
              card || {
                elements: [{ tag: 'markdown', content: markdown }]
              },
              toolName
            )
            content = JSON.stringify(
              card || {
                elements: [{ tag: 'markdown', content: markdown }]
              }
            )
          }

          const client = await getClient(resolvedIntegrationId, timeoutMs, toolName)
          try {
            await withTimeout(
              client.im.message.patch({
                path: { message_id: messageId },
                data: { content }
              }),
              timeoutMs,
              `[${toolName}] update message '${messageId}'`
            )
          } catch (error) {
            throw new Error(`[${toolName}] Failed to update message '${messageId}': ${formatError(error)}`)
          }

          const result: LarkNotifyResult = {
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
            ]
          }

          this.logger.log(
            `[${toolName}] integrationId=${resolvedIntegrationId}, recipientCount=1, successCount=1, failureCount=0`
          )

          return buildCommand(toolName, toolCallId, result)
        },
        {
          name: 'lark_update_message',
          description: 'Update an existing Lark message.',
          schema: updateMessageSchema,
          verboseParsingErrors: true
        }
      )
    )

    tools.push(
      tool(
        async (parameters, config) => {
          const toolName = 'lark_recall_message'
          const toolCallId = getToolCallIdFromConfig(config)
          const { renderedInput, integrationId, timeoutMs } = resolveInput(parameters, config)
          const resolvedIntegrationId = requireIntegrationId(integrationId, toolName)
          const messageId = normalizeString(renderedInput.messageId)

          if (!messageId) {
            throw new Error(`[${toolName}] messageId is required`)
          }

          const client = await getClient(resolvedIntegrationId, timeoutMs, toolName)
          try {
            await withTimeout(
              (client.im.message as any).delete({
                path: { message_id: messageId }
              }),
              timeoutMs,
              `[${toolName}] recall message '${messageId}'`
            )
          } catch (error) {
            throw new Error(`[${toolName}] Failed to recall message '${messageId}': ${formatError(error)}`)
          }

          const result: LarkNotifyResult = {
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
            ]
          }

          this.logger.log(
            `[${toolName}] integrationId=${resolvedIntegrationId}, recipientCount=1, successCount=1, failureCount=0`
          )

          return buildCommand(toolName, toolCallId, result)
        },
        {
          name: 'lark_recall_message',
          description: 'Recall an existing Lark message.',
          schema: recallMessageSchema,
          verboseParsingErrors: true
        }
      )
    )

    if (lookupToolsEnabled) {
      tools.push(
        tool(
          async (parameters, config) => {
            const toolName = 'lark_list_users'
            const toolCallId = getToolCallIdFromConfig(config)
            const { renderedInput, integrationId, timeoutMs } = resolveInput(parameters, config)
            const resolvedIntegrationId = requireIntegrationId(integrationId, toolName)
            const keyword = normalizeString(renderedInput.keyword)?.toLowerCase()
            const pageSize = normalizeIntInRange(renderedInput.pageSize, 20, 1, 100)
            const pageToken = normalizeString(renderedInput.pageToken)

            const client = await getClient(resolvedIntegrationId, timeoutMs, toolName)
            let response: Awaited<ReturnType<typeof client.contact.v3.user.findByDepartment>>
            try {
              response = await withTimeout(
                client.contact.v3.user.findByDepartment({
                  params: {
                    user_id_type: 'open_id',
                    department_id_type: 'open_department_id',
                    department_id: '0',
                    page_size: pageSize,
                    page_token: pageToken || undefined
                  }
                }),
                timeoutMs,
                `[${toolName}] list users`
              )
            } catch (error) {
              throw new Error(`[${toolName}] Failed to list users: ${formatError(error)}`)
            }

            const items = (response?.data?.items ?? [])
              .map((item) => ({
                name: item?.name ?? null,
                email: item?.email ?? null,
                mobile: item?.mobile ?? null,
                avatar: item?.avatar?.avatar_240 ?? null
              }))
              .filter((item) => {
                if (!keyword) {
                  return true
                }
                const values = [item.name, item.email, item.mobile]
                return values.some((value) =>
                  String(value || '')
                    .toLowerCase()
                    .includes(keyword)
                )
              })

            const result: LarkNotifyResult = {
              tool: toolName,
              integrationId: resolvedIntegrationId,
              successCount: 1,
              failureCount: 0,
              results: [{ target: 'users', success: true }],
              data: {
                items,
                pageToken: response?.data?.page_token ?? null,
                hasMore: response?.data?.has_more ?? false
              }
            }

            this.logger.log(`[${toolName}] integrationId=${resolvedIntegrationId}, successCount=1, failureCount=0`)

            return buildCommand(toolName, toolCallId, result)
          },
          {
            name: 'lark_list_users',
            description:
              'List users available for Lark notifications. This is a fallback or admin/debug tool, not the primary way to pick recipients during chat. Prefer recipient_name from the current group context when possible.',
            schema: listUsersSchema,
            verboseParsingErrors: true
          }
        )
      )

      tools.push(
        tool(
          async (parameters, config) => {
            const toolName = 'lark_list_chats'
            const toolCallId = getToolCallIdFromConfig(config)
            const { renderedInput, integrationId, timeoutMs } = resolveInput(parameters, config)
            const resolvedIntegrationId = requireIntegrationId(integrationId, toolName)
            const keyword = normalizeString(renderedInput.keyword)?.toLowerCase()
            const pageSize = normalizeIntInRange(renderedInput.pageSize, 20, 1, 100)
            const pageToken = normalizeString(renderedInput.pageToken)

            const client = await getClient(resolvedIntegrationId, timeoutMs, toolName)
            let response: Awaited<ReturnType<typeof client.im.chat.list>>
            try {
              response = await withTimeout(
                client.im.chat.list({
                  params: {
                    page_size: pageSize,
                    page_token: pageToken || undefined
                  }
                }),
                timeoutMs,
                `[${toolName}] list chats`
              )
            } catch (error) {
              throw new Error(`[${toolName}] Failed to list chats: ${formatError(error)}`)
            }

            const items = (response?.data?.items ?? [])
              .map((item) => ({
                ...item,
                chat_id: item?.chat_id ?? null,
                name: item?.name ?? null,
                avatar: item?.avatar ?? null,
                description: item?.description ?? null
              }))
              .filter((item) => {
                if (!keyword) {
                  return true
                }
                const values = [item.name, item.chat_id, item.description]
                return values.some((value) =>
                  String(value || '')
                    .toLowerCase()
                    .includes(keyword)
                )
              })

            const result: LarkNotifyResult = {
              tool: toolName,
              integrationId: resolvedIntegrationId,
              successCount: 1,
              failureCount: 0,
              results: [{ target: 'chats', success: true }],
              data: {
                items,
                pageToken: response?.data?.page_token ?? null,
                hasMore: response?.data?.has_more ?? false
              }
            }

            this.logger.log(`[${toolName}] integrationId=${resolvedIntegrationId}, successCount=1, failureCount=0`)

            return buildCommand(toolName, toolCallId, result)
          },
          {
            name: 'lark_list_chats',
            description:
              'List chats available for Lark notifications. This tool is mainly intended for admin or debugging flows.',
            schema: listChatsSchema,
            verboseParsingErrors: true
          }
        )
      )
    }

    return {
      name: LARK_NOTIFY_MIDDLEWARE_NAME,
      stateSchema: larkNotifyStateSchema,
      beforeAgent: async (state, runtime) => {
        const rootState =
          ((runtime as Record<string, unknown> | undefined)?.state as Record<string, unknown> | undefined) ?? {}
        const recipientDirectoryKey =
          this.resolveRecipientDirectoryKey(rootState) ||
          this.resolveRecipientDirectoryKey((state ?? {}) as Record<string, unknown>)
        const directory = await this.recipientDirectoryService.get(recipientDirectoryKey)
        const summary = this.formatKnownRecipientsSummary(directory)
        const guidance = this.formatAgentGuidance(summary, directory)

        return {
          lark_notify_known_recipients_summary: summary,
          lark_notify_agent_guidance: guidance,
          lark_notify_recipient_directory_key: recipientDirectoryKey ?? ''
        }
      },
      wrapModelCall: async (request, handler) => {
        const guidance = normalizeString((request.state as Record<string, unknown>)?.lark_notify_agent_guidance)
        if (!guidance) {
          return handler(request)
        }

        const baseSystemContent = toSystemMessageText(request.systemMessage?.content).trim()
        const mergedSystemContent = [baseSystemContent, '<lark_notify_guidance>', guidance, '</lark_notify_guidance>']
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

export type { LarkNotifyMiddlewareConfig, LarkNotifyState }
