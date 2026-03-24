import type * as lark from '@larksuiteoapi/node-sdk'
import { Injectable, Logger } from '@nestjs/common'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { Readable } from 'node:stream'
import { normalizeLarkTextWithMentions, parseLarkMentionIdentity } from './lark-message-semantics.js'
import { LarkChannelStrategy } from './lark-channel.strategy.js'
import type {
  LarkMessageResourceType,
  NormalizedMessage,
  NormalizedMessageMention,
  NormalizedMessageResource,
  NormalizedMessageResourceRef
} from './types.js'
import { toLarkApiErrorMessage, toNonEmptyString } from './utils.js'

const DEFAULT_TIMEOUT_MS = 10000
const RESOURCE_INLINE_CONTENT_MODE = 'base64'

type LarkMessageItem = {
  message_id?: string
  root_id?: string
  parent_id?: string
  thread_id?: string
  msg_type?: string
  create_time?: string
  update_time?: string
  deleted?: boolean
  updated?: boolean
  chat_id?: string
  sender?: {
    id?: string
    id_type?: string
    sender_type?: string
    tenant_key?: string
  }
  body?: {
    content?: string
  }
  mentions?: Array<{
    key?: string
    id?: string
    id_type?: string
    name?: string
    tenant_key?: string
  }>
  upper_message_id?: string
}

type LarkMessageResourceDownload = {
  headers?: Record<string, unknown>
  getReadableStream: () => Readable
}

type ListMessagesInput = {
  integrationId: string
  containerIdType: string
  containerId: string
  startTime?: string | null
  endTime?: string | null
  sortType?: 'ByCreateTimeAsc' | 'ByCreateTimeDesc' | null
  pageSize?: number | null
  pageToken?: string | null
  timeoutMs?: number
}

type GetMessageInput = {
  integrationId: string
  messageId: string
  userIdType?: 'open_id' | 'user_id' | 'union_id' | null
  timeoutMs?: number
}

type GetMessageResourceInput = {
  integrationId: string
  messageId: string
  fileKey: string
  type: LarkMessageResourceType | string
  contentMode?: 'metadata' | 'base64' | null
  timeoutMs?: number
}

@Injectable()
export class LarkContextToolService {
  private readonly logger = new Logger(LarkContextToolService.name)

  constructor(private readonly larkChannel: LarkChannelStrategy) {}

  async listMessages(input: ListMessagesInput): Promise<{
    items: NormalizedMessage[]
    pageToken: string | null
    hasMore: boolean
  }> {
    const integrationId = this.requireString(input.integrationId, 'integrationId')
    const containerIdType = this.requireString(input.containerIdType, 'containerIdType')
    const containerId = this.requireString(input.containerId, 'containerId')
    if (containerIdType === 'chat' && containerId.startsWith('om_')) {
      throw new Error(
        `[lark_list_messages] containerIdType=chat requires chat_id (usually starts with 'oc_'), but got a message_id-like value '${containerId}'.`
      )
    }
    const timeoutMs = this.normalizeTimeout(input.timeoutMs)
    const client = await this.getClient(integrationId, timeoutMs, 'list messages')

    let response: Awaited<ReturnType<lark.Client['im']['message']['list']>>
    try {
      response = await withTimeout(
        client.im.message.list({
          params: {
            container_id_type: containerIdType,
            container_id: containerId,
            start_time: toOptionalString(input.startTime),
            end_time: toOptionalString(input.endTime),
            sort_type: input.sortType ?? undefined,
            page_size: this.normalizePageSize(input.pageSize),
            page_token: toOptionalString(input.pageToken)
          }
        }),
        timeoutMs,
        `[lark_list_messages] load messages from ${containerIdType}:${containerId}`
      )
    } catch (error) {
      throw new Error(`[lark_list_messages] Failed to list messages: ${this.formatError(error)}`)
    }

    const items = this.normalizeMessages(response?.data?.items ?? [])
    return {
      items,
      pageToken: toOptionalString(response?.data?.page_token) ?? null,
      hasMore: response?.data?.has_more ?? false
    }
  }

  async getMessage(input: GetMessageInput): Promise<{
    item: NormalizedMessage
  }> {
    const integrationId = this.requireString(input.integrationId, 'integrationId')
    const messageId = this.requireString(input.messageId, 'messageId')
    const timeoutMs = this.normalizeTimeout(input.timeoutMs)
    const client = await this.getClient(integrationId, timeoutMs, 'get message')

    let response: Awaited<ReturnType<lark.Client['im']['message']['get']>>
    try {
      response = await withTimeout(
        client.im.message.get({
          params: {
            user_id_type: input.userIdType ?? undefined
          },
          path: {
            message_id: messageId
          }
        }),
        timeoutMs,
        `[lark_get_message] load message '${messageId}'`
      )
    } catch (error) {
      throw new Error(`[lark_get_message] Failed to get message '${messageId}': ${this.formatError(error)}`)
    }

    const item = (response?.data?.items ?? [])[0] as LarkMessageItem | undefined
    if (!item?.message_id) {
      throw new Error(`[lark_get_message] Message '${messageId}' was not found`)
    }

    return {
      item: this.normalizeMessage(item)
    }
  }

  async getMessageResource(input: GetMessageResourceInput): Promise<{
    item: NormalizedMessageResource
  }> {
    const integrationId = this.requireString(input.integrationId, 'integrationId')
    const messageId = this.requireString(input.messageId, 'messageId')
    const fileKey = this.requireString(input.fileKey, 'fileKey')
    const resourceType = this.requireString(input.type, 'type')
    const timeoutMs = this.normalizeTimeout(input.timeoutMs)
    const contentMode = input.contentMode === RESOURCE_INLINE_CONTENT_MODE ? RESOURCE_INLINE_CONTENT_MODE : 'metadata'
    const client = await this.getClient(integrationId, timeoutMs, 'get message resource')

    const message = await this.getMessage({
      integrationId,
      messageId,
      timeoutMs
    })

    let response: LarkMessageResourceDownload
    try {
      response = (await withTimeout(
        client.im.messageResource.get({
          params: {
            type: resourceType
          },
          path: {
            message_id: messageId,
            file_key: fileKey
          }
        }),
        timeoutMs,
        `[lark_get_message_resource] load resource '${fileKey}' from message '${messageId}'`
      )) as LarkMessageResourceDownload
    } catch (error) {
      throw new Error(
        `[lark_get_message_resource] Failed to get resource '${fileKey}' from message '${messageId}': ${this.formatError(error)}`
      )
    }

    const headers = normalizeHeaders(response?.headers)
    const stream = response?.getReadableStream?.()
    let buffer: Buffer | null = null

    if (contentMode === RESOURCE_INLINE_CONTENT_MODE) {
      if (!stream) {
        throw new Error(
          `[lark_get_message_resource] Resource '${fileKey}' from message '${messageId}' did not return a readable stream`
        )
      }
      buffer = await readStreamAsBuffer(stream)
    } else if (stream) {
      stream.destroy?.()
    }

    const matchedRef = message.item.resourceRefs?.find((item) => item.fileKey === fileKey)
    const mimeType = headers['content-type']
    const size = buffer?.length ?? parseHeaderNumber(headers['content-length'])
    const name = parseContentDispositionFilename(headers['content-disposition']) ?? matchedRef?.name

    return {
      item: {
        messageId,
        fileKey,
        type: resourceType,
        name,
        mimeType,
        size,
        contentEncoding: buffer ? 'base64' : undefined,
        contentBase64: buffer ? buffer.toString('base64') : undefined
      }
    }
  }

  private async getClient(
    integrationId: string,
    timeoutMs: number,
    operation: string
  ): Promise<lark.Client> {
    try {
      return await withTimeout(
        this.larkChannel.getOrCreateLarkClientById(integrationId),
        timeoutMs,
        `[lark-context] load integration '${integrationId}' for ${operation}`
      )
    } catch (error) {
      throw new Error(`[lark-context] Integration '${integrationId}' is unavailable: ${this.formatError(error)}`)
    }
  }

  private normalizeMessages(items: LarkMessageItem[]): NormalizedMessage[] {
    return items
      .map((item) => this.normalizeMessage(item))
      .filter((item): item is NormalizedMessage => Boolean(item?.messageId))
  }

  private normalizeMessage(item: LarkMessageItem): NormalizedMessage {
    const msgType = toOptionalString(item?.msg_type) ?? 'unknown'
    const bodyContent = toOptionalString(item?.body?.content) ?? ''
    const parsedBodyContent = safeJsonParse(bodyContent)
    const mentions = this.normalizeMentions(item?.mentions)
    const text = this.extractText(msgType, bodyContent, parsedBodyContent, item?.mentions ?? [])
    const resourceRefs = this.extractResourceRefs(parsedBodyContent, msgType)
    const senderOpenId =
      item?.sender?.id_type === 'open_id'
        ? toOptionalString(item?.sender?.id) ?? undefined
        : undefined

    return {
      messageId: item?.message_id ?? '',
      chatId: toOptionalString(item?.chat_id) ?? undefined,
      senderOpenId,
      msgType,
      text: text ?? undefined,
      mentions: mentions.length ? mentions : undefined,
      parentId: toOptionalString(item?.parent_id) ?? undefined,
      rootId: toOptionalString(item?.root_id) ?? undefined,
      createTime: toOptionalString(item?.create_time) ?? undefined,
      hasResource: resourceRefs.length > 0,
      resourceRefs: resourceRefs.length ? resourceRefs : undefined
    }
  }

  private normalizeMentions(rawMentions: LarkMessageItem['mentions']): NormalizedMessageMention[] {
    return (rawMentions ?? [])
      .map((mention) => parseLarkMentionIdentity(mention))
      .filter((mention): mention is NonNullable<ReturnType<typeof parseLarkMentionIdentity>> => Boolean(mention?.id))
      .map((mention) => ({
        openId: mention.id!,
        name: mention.name ?? undefined,
        isBot: mention.isBot ?? undefined
      }))
  }

  private extractText(
    msgType: string,
    rawBodyContent: string,
    parsedBodyContent: unknown,
    rawMentions: LarkMessageItem['mentions']
  ): string | null {
    const mentionIdentities = (rawMentions ?? [])
      .map((mention) => parseLarkMentionIdentity(mention))
      .filter((mention): mention is NonNullable<ReturnType<typeof parseLarkMentionIdentity>> => Boolean(mention))

    if (msgType === 'text') {
      const rawText =
        toOptionalString((parsedBodyContent as Record<string, unknown> | null)?.text) ??
        toOptionalString(rawBodyContent) ??
        ''
      return normalizeLarkTextWithMentions(rawText, mentionIdentities).displayText || null
    }

    const fragments =
      msgType === 'post'
        ? collectTextFragments(parsedBodyContent, new Set(['text', 'title', 'content']))
        : collectTextFragments(parsedBodyContent, new Set(['text', 'title', 'content', 'name', 'label']))

    const mergedText = dedupeStrings(fragments).join('\n').trim()
    if (!mergedText) {
      return null
    }

    return normalizeLarkTextWithMentions(mergedText, mentionIdentities).displayText || null
  }

  private extractResourceRefs(
    parsedBodyContent: unknown,
    msgType: string
  ): NormalizedMessageResourceRef[] {
    const refs = new Map<string, NormalizedMessageResourceRef>()

    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') {
        return
      }
      if (Array.isArray(value)) {
        value.forEach(visit)
        return
      }

      const record = value as Record<string, unknown>
      const resourceName =
        toOptionalString(record.file_name) ??
        toOptionalString(record.name) ??
        toOptionalString(record.title) ??
        undefined

      const candidates: Array<{ key: string; type: LarkMessageResourceType | string }> = []
      if (toOptionalString(record.file_key)) {
        candidates.push({
          key: record.file_key as string,
          type: msgType === 'audio' ? 'audio' : msgType === 'media' ? 'media' : 'file'
        })
      }
      if (toOptionalString(record.image_key)) {
        candidates.push({
          key: record.image_key as string,
          type: 'image'
        })
      }
      if (toOptionalString(record.audio_key)) {
        candidates.push({
          key: record.audio_key as string,
          type: 'audio'
        })
      }
      if (toOptionalString(record.media_key)) {
        candidates.push({
          key: record.media_key as string,
          type: 'media'
        })
      }
      if (toOptionalString(record.video_key)) {
        candidates.push({
          key: record.video_key as string,
          type: 'media'
        })
      }

      candidates.forEach(({ key, type }) => {
        if (!refs.has(key)) {
          refs.set(key, {
            fileKey: key,
            type,
            name: resourceName
          })
        }
      })

      Object.values(record).forEach(visit)
    }

    visit(parsedBodyContent)
    return Array.from(refs.values())
  }

  private normalizeTimeout(value: unknown): number {
    const timeout = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(timeout) && timeout >= 100) {
      return timeout
    }
    return DEFAULT_TIMEOUT_MS
  }

  private normalizePageSize(value: unknown): number | undefined {
    const pageSize = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(pageSize)) {
      return undefined
    }

    const normalized = Math.floor(pageSize)
    if (normalized < 1 || normalized > 100) {
      return undefined
    }

    return normalized
  }

  private requireString(value: unknown, fieldName: string): string {
    const normalized = toOptionalString(value)
    if (!normalized) {
      throw new Error(`${fieldName} is required`)
    }
    return normalized
  }

  private formatError(error: unknown): string {
    return toLarkApiErrorMessage(error) || getErrorMessage(error) || 'Unknown error'
  }
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

function safeJsonParse(value: string): unknown {
  if (!value?.trim()) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function toOptionalString(value: unknown): string | null {
  return toNonEmptyString(value)
}

function collectTextFragments(
  value: unknown,
  allowedKeys: Set<string>,
  depth = 0,
  fragments: string[] = []
): string[] {
  if (depth > 6 || value == null) {
    return fragments
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized) {
      fragments.push(normalized)
    }
    return fragments
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextFragments(item, allowedKeys, depth + 1, fragments))
    return fragments
  }

  if (typeof value !== 'object') {
    return fragments
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (typeof child === 'string' && allowedKeys.has(key)) {
      const normalized = child.trim()
      if (normalized) {
        fragments.push(normalized)
      }
      return
    }
    collectTextFragments(child, allowedKeys, depth + 1, fragments)
  })

  return fragments
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(
    new Map(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value, value])
    ).values()
  )
}

function normalizeHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
  if (!headers) {
    return {}
  }

  return Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
    if (Array.isArray(value)) {
      acc[key.toLowerCase()] = value.map((item) => String(item)).join(', ')
      return acc
    }

    if (value != null) {
      acc[key.toLowerCase()] = String(value)
    }

    return acc
  }, {})
}

function parseHeaderNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseContentDispositionFilename(contentDisposition: string | undefined): string | undefined {
  if (!contentDisposition) {
    return undefined
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1]
}

async function readStreamAsBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []

  return new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}
