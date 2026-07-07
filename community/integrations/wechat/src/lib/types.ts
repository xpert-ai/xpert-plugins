import type { TChatRequestHuman } from '@xpert-ai/contracts'
import type { PluginWebhookCredentialRecord } from '@xpert-ai/plugin-sdk'
import { WECHAT_PROVIDER_KEY } from './constants.js'

export type WechatGroupTriggerMode =
  | 'mention_or_keywords'
  | 'all'
  | 'mentions'
  | 'keywords'
  | 'off'

export type WechatConnectionMode = 'direct_http' | 'reverse_tunnel'
export type WechatChatFilterMode = 'all' | 'private_only' | 'group_only'
export type WechatInboundMessageKind = 'text' | 'image' | 'voice' | 'file' | 'unsupported'
export type WechatSelfMessagePolicy = 'history_only' | 'ignore' | 'dispatch'

export type WechatOutboundOverflowAction = 'reject' | 'pause_until_manual_resume'

export const DEFAULT_GROUP_JOIN_WELCOME_PROMPT =
  '微信群有新成员加入：{names}。请生成一句简短、友好的中文欢迎语回复群聊，不要提及系统消息。'
export const WECHAT_MIB_BYTES = 1024 * 1024
export const DEFAULT_INBOUND_FILE_MAX_SIZE_MB = 2
export const MAX_INBOUND_FILE_MAX_SIZE_MB = 25
export const DEFAULT_OUTBOUND_QUEUE_OPTIONS = {
  enabled: true,
  initialDelayMs: 0,
  globalMinIntervalMs: 0,
  perAccountMinIntervalMs: 500,
  perContactMinIntervalMs: 1000,
  perAccountMaxPerMinute: 60,
  perAccountMaxPerHour: 1000,
  perAccountMaxPerDay: 5000,
  perContactMaxPerHour: 120,
  maxPendingPerAccount: 100,
  maxPendingPerContact: 20,
  maxAttempts: 4
} as const
const WECHAT_REFERENCE_APPMSG_TYPE = 57
const WECHAT_MENTION_SEPARATOR_CLASS = '\\s\\u2005\\u2002\\u2003\\u2004\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000'

export interface WechatGroupTriggerOverride {
  groupId: string
  groupTriggerMode?: WechatGroupTriggerMode
  groupKeywords?: string[]
  mentionFallbackNames?: string[]
}

export type WechatWebhookCredentialRecord = PluginWebhookCredentialRecord

export interface WechatOutboundQueueOptions {
  enabled?: boolean
  initialDelayMs?: number
  globalMinIntervalMs?: number
  perAccountMinIntervalMs?: number
  perContactMinIntervalMs?: number
  perAccountMaxPerMinute?: number
  perAccountMaxPerHour?: number
  perAccountMaxPerDay?: number
  perContactMaxPerHour?: number
  maxPendingPerAccount?: number
  maxPendingPerContact?: number
  maxAttempts?: number
  retryBackoffMs?: number[]
  lockTtlMs?: number
  overflowAction?: WechatOutboundOverflowAction
  failureGuard?: {
    threshold?: number
    windowSeconds?: number
    action?: 'pause_until_manual_resume'
  }
  quietHours?: Array<{
    start: string
    end: string
    timezone?: string
  }>
}

export interface WechatInboundFileRulesOptions {
  maxSizeMb?: number
}

export interface TIntegrationWechatOptions {
  connectionMode?: WechatConnectionMode
  baseUrl?: string
  tunnelClientId?: string
  apiVersion?: string
  timeoutMs?: number
  apiToken?: string
  preferLanguage?: 'en' | 'zh-Hans'
  agentCallbackIntermediateTextEnabled?: boolean
  webhookCredential?: WechatWebhookCredentialRecord | null
  fallbackToLegacySendText?: boolean
  fallbackToLegacySendImage?: boolean
  inboundFileRules?: WechatInboundFileRulesOptions
  outboundQueue?: WechatOutboundQueueOptions
}

export interface WechatInboundTriggerOptions {
  ignoreSelfMessages?: boolean
  selfMessagePolicy?: WechatSelfMessagePolicy
  chatFilterMode?: WechatChatFilterMode
  allowedContactIds?: string[] | string
  blockedContactIds?: string[] | string
  allowedGroupIds?: string[] | string
  blockedGroupIds?: string[] | string
  allowedSenderIds?: string[] | string
  blockedSenderIds?: string[] | string
  allowedKeywords?: string[] | string
  groupTriggerMode?: WechatGroupTriggerMode
  groupKeywords?: string[] | string
  mentionFallbackNames?: string[] | string
  groupTriggerOverrides?: WechatGroupTriggerOverride[]
  groupJoinWelcomeEnabled?: boolean
  groupJoinWelcomePrompt?: string
}

export type WechatChatRequestFile = NonNullable<TChatRequestHuman['files']>[number]

export type WechatInboundFile = WechatChatRequestFile & {
  id?: string
  fileUrl?: string
  url?: string
  mimeType?: string
  mimetype?: string
  originalName?: string
  name?: string
  fileKey?: string
  fileId?: string
  fileAssetId?: string
  storageFileId?: string
  filePath?: string
  workspacePath?: string
  size?: number
  extension?: string
}

export interface WechatInboundImageRef {
  uuid: string
  newMsgId: string
  msgContent: string
  msgType: 3
  contactId: string
  fromUser?: string
  toUser?: string
  msgId?: number
  isSelf?: boolean
  preferHd?: boolean
  fileKey?: string
  originalName?: string
}

export interface WechatInboundVoiceRef {
  uuid: string
  newMsgId: string
  msgContent: string
  msgType: 34
  contactId: string
  fromUser?: string
  toUser?: string
  msgId?: number
  isSelf?: boolean
  fileKey?: string
  originalName?: string
  bufId?: string
  durationMs?: number
  format?: string
  byteLength?: number
}

export interface WechatInboundFileRef {
  uuid: string
  newMsgId: string
  msgContent: string
  msgType: number
  contactId: string
  fromUser?: string
  toUser?: string
  msgId?: number
  isSelf?: boolean
  fileKey?: string
  originalName?: string
  extension?: string
  size?: number
  attachId?: string
  cdnAttachUrl?: string
  aesKey?: string
}

export interface WechatPendingInboundFile {
  kind: 'image' | 'file'
  messageLogId?: string
  messageId?: string
  uuid: string
  ownerWxid?: string
  contactId: string
  senderId?: string
  senderName?: string
  chatType?: 'private' | 'group'
  originalName?: string
  mimeType?: string
  size?: number
  extension?: string
  imageRef?: WechatInboundImageRef
  fileRef?: WechatInboundFileRef
}

export interface WechatInboundEvent {
  source: 'message_webhook'
  uuid: string
  ownerWxid?: string
  ownerName?: string
  fromUser?: string
  toUser?: string
  contactId: string
  contactName?: string
  senderId: string
  senderName?: string
  chatId: string
  chatType: 'private' | 'group'
  messageId: string
  msgType?: number
  messageKind: WechatInboundMessageKind
  content: string
  displayText?: string
  files?: WechatInboundFile[]
  imageRef?: WechatInboundImageRef
  voiceRef?: WechatInboundVoiceRef
  fileRef?: WechatInboundFileRef
  mediaSignature?: string
  timestamp: number
  isSelf: boolean
  raw: Record<string, unknown>
  rawPayload: unknown
}

export interface WechatDispatchableMessage extends WechatInboundEvent {
  input: string
  triggerReason: 'private' | 'group_all' | 'mention' | 'keyword'
}

export type WechatTriggerReason = WechatDispatchableMessage['triggerReason']
export type WechatBatchTriggerReason = WechatTriggerReason | 'group_join_welcome'

export interface WechatBatchTriggerItem {
  input: string
  messageKind: WechatInboundMessageKind
  chatType?: 'private' | 'group'
  mentioned?: boolean
  groupKeywordMatched?: boolean
  bypassTriggerPolicy?: boolean
  triggerReason?: WechatBatchTriggerReason
}

export interface WechatBatchDispatchDecision {
  inputParts: string[]
  triggerReason: WechatBatchTriggerReason
}

export type WechatVoiceTranscriptionDecision = {
  triggerReason: 'private' | 'group_all' | 'mention' | 'keyword_candidate'
}

export type WechatGroupJoinWelcomeInfo = {
  names: string[]
  rawText: string
}

type Dict = Record<string, unknown>

export function isWechatProviderValue(value: unknown): boolean {
  return value === WECHAT_PROVIDER_KEY
}

export function normalizeApiVersion(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return '/v1/'
  }
  let text = value.trim()
  if (!text.startsWith('/')) {
    text = `/${text}`
  }
  if (!text.endsWith('/')) {
    text = `${text}/`
  }
  return text
}

export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().replace(/\/+$/, '')
}

export function normalizeWechatConnectionMode(value: unknown): WechatConnectionMode {
  return value === 'reverse_tunnel' ? 'reverse_tunnel' : 'direct_http'
}

export function normalizeChatFilterMode(value: unknown): WechatChatFilterMode {
  return value === 'private_only' || value === 'group_only' ? value : 'all'
}

export function normalizeSelfMessagePolicy(
  value: unknown,
  legacyIgnoreSelfMessages?: unknown
): WechatSelfMessagePolicy {
  if (value === 'history_only' || value === 'ignore' || value === 'dispatch') {
    return value
  }
  return legacyIgnoreSelfMessages === false ? 'dispatch' : 'history_only'
}

export function normalizeTimeoutMs(value: unknown, defaultValue = 10000): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  return defaultValue
}

export function normalizeInboundFileRules(value: unknown): Required<WechatInboundFileRulesOptions> {
  const record = value && typeof value === 'object' ? value as { maxSizeMb?: unknown } : undefined
  return {
    maxSizeMb: normalizeInboundFileMaxSizeMb(record?.maxSizeMb)
  }
}

export function resolveInboundFileMaxBytes(
  options?: Pick<TIntegrationWechatOptions, 'inboundFileRules'> | null
): number {
  return normalizeInboundFileRules(options?.inboundFileRules).maxSizeMb * WECHAT_MIB_BYTES
}

function normalizeInboundFileMaxSizeMb(value: unknown): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric) || numeric < 1) {
    return DEFAULT_INBOUND_FILE_MAX_SIZE_MB
  }
  return Math.min(Math.floor(numeric), MAX_INBOUND_FILE_MAX_SIZE_MB)
}

export function normalizePositiveInt(value: unknown, defaultValue: number, maxValue = Number.MAX_SAFE_INTEGER): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.min(Math.floor(numeric), maxValue)
  }
  return defaultValue
}

export function normalizeNonNegativeInt(value: unknown, defaultValue: number, maxValue = Number.MAX_SAFE_INTEGER): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.min(Math.floor(numeric), maxValue)
  }
  return defaultValue
}

export function normalizeString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return ''
}

export function normalizeGroupJoinWelcomePrompt(value: unknown): string {
  return normalizeString(value) || DEFAULT_GROUP_JOIN_WELCOME_PROMPT
}

export function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  return false
}

export function normalizeGroupTriggerMode(value: unknown): WechatGroupTriggerMode {
  if (
    value === 'mention_or_keywords' ||
    value === 'all' ||
    value === 'mentions' ||
    value === 'keywords' ||
    value === 'off'
  ) {
    return value
  }
  return 'mention_or_keywords'
}

export function normalizeKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\n，]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export function normalizeIdList(value: unknown): string[] {
  return Array.from(new Set(normalizeKeywords(value)))
}

export function normalizeGroupTriggerOverrides(value: unknown): WechatGroupTriggerOverride[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  return value
    .map((item) => {
      const record = asRecord(item)
      const groupId = normalizeString(record?.groupId || record?.contactId || record?.chatId)
      if (!groupId || seen.has(groupId)) {
        return null
      }
      seen.add(groupId)
      const override: WechatGroupTriggerOverride = {
        groupId
      }
      if (record && Object.prototype.hasOwnProperty.call(record, 'groupTriggerMode')) {
        override.groupTriggerMode = normalizeGroupTriggerMode(record.groupTriggerMode)
      }
      if (record && Object.prototype.hasOwnProperty.call(record, 'groupKeywords')) {
        override.groupKeywords = normalizeKeywords(record.groupKeywords)
      }
      if (record && Object.prototype.hasOwnProperty.call(record, 'mentionFallbackNames')) {
        override.mentionFallbackNames = normalizeKeywords(record.mentionFallbackNames)
      }
      return override
    })
    .filter((item): item is WechatGroupTriggerOverride => Boolean(item))
}

export function normalizeWechatInboundPayload(payload: unknown): WechatInboundEvent | null {
  const record = asRecord(payload)
  if (!record) {
    return null
  }

  if (isWechatHardExcludedInboundPayload(record)) {
    return null
  }

  if (normalizeString(record.uuid || record.UUID) && normalizeString(record.contactid || record.Contactid)) {
    return normalizeMessageWebhook(record, payload)
  }

  return null
}

export function isWechatHardExcludedInboundPayload(payload: unknown): boolean {
  const record = asRecord(payload)
  if (!record) {
    return false
  }
  return [
    record.sendusername,
    record.sendUserName,
    record.senderId,
    record.Sendusername,
    record.fromusername,
    record.fromUserName,
    record.Fromusername,
    record.contactid,
    record.contactId,
    record.Contactid
  ].some(isWeixinIdentifier)
}

export function isWechatHardExcludedInboundEvent(event: Pick<WechatInboundEvent, 'senderId' | 'fromUser' | 'contactId'>): boolean {
  return [event.senderId, event.fromUser, event.contactId].some(isWeixinIdentifier)
}

export function resolveWechatGroupJoinWelcomeInfo(event: WechatInboundEvent): WechatGroupJoinWelcomeInfo | null {
  if (event.chatType !== 'group' || !isWechatGroupJoinSystemMessageType(event.msgType)) {
    return null
  }
  const sourceText = normalizeString(event.content || event.displayText)
  const rawText = normalizeWechatSystemText(sourceText)
  if (!rawText) {
    return null
  }
  const names = extractWechatGroupJoinNames(sourceText)
  if (!names.length) {
    return null
  }
  return {
    names,
    rawText
  }
}

function isWechatGroupJoinSystemMessageType(msgType: number | undefined): boolean {
  return msgType === 10000 || msgType === 10002
}

export function shouldDispatchWechatMessage(
  event: WechatInboundEvent,
  options?: WechatInboundTriggerOptions
): WechatDispatchableMessage | null {
  const selfMessagePolicy = normalizeSelfMessagePolicy(options?.selfMessagePolicy, options?.ignoreSelfMessages)
  if (event.isSelf && selfMessagePolicy !== 'dispatch') {
    return null
  }
  if (!matchesWechatMessageFilter(event, options)) {
    return null
  }
  if (!isWechatDispatchableMessageKind(event)) {
    return null
  }

  const input = normalizeWechatAgentInput(event)
  if (!input && event.messageKind !== 'image' && event.messageKind !== 'file') {
    return null
  }

  if (event.chatType !== 'group') {
    const dispatchable: WechatDispatchableMessage = {
      ...event,
      input,
      triggerReason: 'private'
    }
    return matchesWechatAllowedKeywords(dispatchable.input, options) ? dispatchable : null
  }

  const mode = normalizeGroupTriggerMode(options?.groupTriggerMode)
  if (mode === 'off') {
    return null
  }
  if (mode === 'all') {
    const dispatchable: WechatDispatchableMessage = {
      ...event,
      input,
      triggerReason: 'group_all'
    }
    return matchesWechatAllowedKeywords(dispatchable.input, options) ? dispatchable : null
  }

  const mentionFallbackNames = normalizeMentionFallbackNames(options?.mentionFallbackNames)
  const mentioned = isMentioned(event, mentionFallbackNames)
  const keyword = matchKeyword(input, normalizeKeywords(options?.groupKeywords))

  if ((mode === 'mentions' || mode === 'mention_or_keywords') && mentioned) {
    const dispatchable: WechatDispatchableMessage = {
      ...event,
      input: stripLeadingMention(input, mentionFallbackNames),
      triggerReason: 'mention'
    }
    return matchesWechatAllowedKeywords(dispatchable.input, options) ? dispatchable : null
  }

  if ((mode === 'keywords' || mode === 'mention_or_keywords') && keyword) {
    const dispatchable: WechatDispatchableMessage = {
      ...event,
      input,
      triggerReason: 'keyword'
    }
    return matchesWechatAllowedKeywords(dispatchable.input, options) ? dispatchable : null
  }

  return null
}

export function buildWechatBatchTriggerItem(
  event: WechatInboundEvent,
  options?: WechatInboundTriggerOptions,
  input: string = normalizeWechatAgentInput(event),
  metadata?: Pick<WechatBatchTriggerItem, 'bypassTriggerPolicy' | 'triggerReason'>
): WechatBatchTriggerItem {
  return {
    input,
    messageKind: event.messageKind,
    chatType: event.chatType,
    mentioned: event.chatType === 'group'
      ? isMentioned(event, normalizeMentionFallbackNames(options?.mentionFallbackNames))
      : false,
    groupKeywordMatched: event.chatType === 'group'
      ? !!matchKeyword(input, normalizeKeywords(options?.groupKeywords))
      : false,
    ...(metadata ?? {})
  }
}

export function shouldDispatchWechatBatch(
  items: WechatBatchTriggerItem[],
  options?: WechatInboundTriggerOptions
): WechatBatchDispatchDecision | null {
  const candidates = (Array.isArray(items) ? items : []).filter((item) => {
    if (!isWechatDispatchableMessageKind({ messageKind: item.messageKind } as WechatInboundEvent)) {
      return false
    }
    return Boolean(normalizeString(item.input)) || item.messageKind === 'image' || item.messageKind === 'file'
  })
  if (!candidates.length) {
    return null
  }

  const inputParts = candidates.map((item) => normalizeString(item.input))
  const aggregatedInput = inputParts.join('\n')
  const bypassPolicyItem = candidates.find((item) => item.bypassTriggerPolicy)
  if (bypassPolicyItem) {
    return {
      inputParts,
      triggerReason: bypassPolicyItem.triggerReason ?? 'group_join_welcome'
    }
  }
  const first = candidates[0]

  if (first.chatType !== 'group') {
    return matchesWechatAllowedKeywords(aggregatedInput, options)
      ? {
          inputParts,
          triggerReason: 'private'
        }
      : null
  }

  const mode = normalizeGroupTriggerMode(options?.groupTriggerMode)
  if (mode === 'off') {
    return null
  }
  if (mode === 'all') {
    return matchesWechatAllowedKeywords(aggregatedInput, options)
      ? {
          inputParts,
          triggerReason: 'group_all'
        }
      : null
  }

  if ((mode === 'mentions' || mode === 'mention_or_keywords') && candidates.some((item) => item.mentioned)) {
    const mentionFallbackNames = normalizeMentionFallbackNames(options?.mentionFallbackNames)
    const strippedInputParts = candidates.map((item) =>
      item.mentioned ? stripLeadingMention(normalizeString(item.input), mentionFallbackNames) : normalizeString(item.input)
    )
    return matchesWechatAllowedKeywords(strippedInputParts.join('\n'), options)
      ? {
          inputParts: strippedInputParts,
          triggerReason: 'mention'
        }
      : null
  }

  if (
    (mode === 'keywords' || mode === 'mention_or_keywords') &&
    candidates.some((item) => item.groupKeywordMatched)
  ) {
    return matchesWechatAllowedKeywords(aggregatedInput, options)
      ? {
          inputParts,
          triggerReason: 'keyword'
        }
      : null
  }

  return null
}

export function shouldAttemptWechatVoiceTranscription(
  event: WechatInboundEvent,
  options?: WechatInboundTriggerOptions
): WechatVoiceTranscriptionDecision | null {
  if (event.messageKind !== 'voice') {
    return null
  }
  const selfMessagePolicy = normalizeSelfMessagePolicy(options?.selfMessagePolicy, options?.ignoreSelfMessages)
  if (event.isSelf && selfMessagePolicy !== 'dispatch') {
    return null
  }
  if (!matchesWechatMessageFilter(event, options)) {
    return null
  }

  if (event.chatType !== 'group') {
    return { triggerReason: 'private' }
  }

  const mode = normalizeGroupTriggerMode(options?.groupTriggerMode)
  if (mode === 'off') {
    return null
  }
  if (mode === 'all') {
    return { triggerReason: 'group_all' }
  }

  const mentioned = isMentioned(event, normalizeMentionFallbackNames(options?.mentionFallbackNames))
  if ((mode === 'mentions' || mode === 'mention_or_keywords') && mentioned) {
    return { triggerReason: 'mention' }
  }

  const keywords = normalizeKeywords(options?.groupKeywords)
  if ((mode === 'keywords' || mode === 'mention_or_keywords') && keywords.length) {
    return { triggerReason: 'keyword_candidate' }
  }

  return null
}

export function matchesWechatAllowedKeywords(
  input: string,
  options?: Pick<WechatInboundTriggerOptions, 'allowedKeywords'> | null
): boolean {
  const keywords = normalizeKeywords(options?.allowedKeywords)
  if (!keywords.length) {
    return true
  }
  return !!matchKeyword(input, keywords)
}

export function matchesWechatMessageFilter(
  event: WechatInboundEvent,
  options?: Pick<
    WechatInboundTriggerOptions,
    | 'chatFilterMode'
    | 'allowedContactIds'
    | 'blockedContactIds'
    | 'allowedGroupIds'
    | 'blockedGroupIds'
    | 'allowedSenderIds'
    | 'blockedSenderIds'
  > | null
): boolean {
  const mode = normalizeChatFilterMode(options?.chatFilterMode)
  if (mode === 'private_only' && event.chatType !== 'private') {
    return false
  }
  if (mode === 'group_only' && event.chatType !== 'group') {
    return false
  }

  const contactId = normalizeString(event.contactId)
  const senderId = normalizeString(event.senderId)
  const allowedContactIds = normalizeIdList(options?.allowedContactIds)
  const blockedContactIds = normalizeIdList(options?.blockedContactIds)
  const allowedSenderIds = normalizeIdList(options?.allowedSenderIds)
  const blockedSenderIds = normalizeIdList(options?.blockedSenderIds)

  if (allowedContactIds.length && !allowedContactIds.includes(contactId)) {
    return false
  }
  if (blockedContactIds.includes(contactId)) {
    return false
  }
  if (allowedSenderIds.length && !allowedSenderIds.includes(senderId)) {
    return false
  }
  if (blockedSenderIds.includes(senderId)) {
    return false
  }

  if (event.chatType === 'group') {
    const allowedGroupIds = normalizeIdList(options?.allowedGroupIds)
    const blockedGroupIds = normalizeIdList(options?.blockedGroupIds)
    if (allowedGroupIds.length && !allowedGroupIds.includes(contactId)) {
      return false
    }
    if (blockedGroupIds.includes(contactId)) {
      return false
    }
  }

  return true
}

export function summarizePayload(payload: unknown, maxLength = 4000): string {
  try {
    const text = JSON.stringify(redactPayload(payload))
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  } catch {
    return '[unserializable payload]'
  }
}

function redactPayload(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) {
      return '[redacted image data url]'
    }
    if (value.startsWith('data:audio/')) {
      return '[redacted audio data url]'
    }
    if (looksLikeLongBase64(value)) {
      return `[redacted base64 length=${value.length}]`
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPayload(item))
  }
  const record = asRecord(value)
  if (!record) {
    return value
  }
  const next: Dict = {}
  for (const [key, item] of Object.entries(record)) {
    if (/^(imgbuf|img_buf|voicebuf|voice_buf|filedata|file_data|imagecontent|image_content|audiodata|audio_data)$/i.test(key)) {
      next[key] = typeof item === 'string' ? `[redacted ${key} length=${item.length}]` : '[redacted]'
      continue
    }
    next[key] = redactPayload(item)
  }
  return next
}

function looksLikeLongBase64(value: string): boolean {
  return value.length > 512 && /^[A-Za-z0-9+/=\r\n]+$/.test(value)
}

function isWeixinIdentifier(value: unknown): boolean {
  return normalizeString(value).toLowerCase() === 'weixin'
}

function normalizeWechatSystemText(value: unknown): string {
  return normalizeString(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractWechatGroupJoinNames(rawText: string): string[] {
  const templateNames = extractWechatSysmsgTemplateJoinNames(rawText)
  if (templateNames.length) {
    return templateNames
  }

  const text = normalizeWechatSystemText(rawText)
  if (!text) {
    return []
  }

  const privacyMatch = text.match(/["“]([^"”]{1,80})["”]与群里其他人都不是朋友关系/)
  if (privacyMatch) {
    return normalizeWechatMemberNames(privacyMatch[1])
  }

  const invitedMatch = text.match(/(?:邀请|邀請)([^，,。；;]{1,120})(?:加入了?群聊|加入群聊)/)
  if (invitedMatch) {
    return normalizeWechatMemberNames(invitedMatch[1])
  }

  const joinedMatch = text.match(/([^，,。；;]{1,120})(?:加入了?群聊|加入群聊)/)
  if (joinedMatch) {
    return normalizeWechatMemberNames(joinedMatch[1])
  }

  return []
}

function extractWechatSysmsgTemplateJoinNames(rawText: string): string[] {
  const source = normalizeString(rawText)
  if (!source || !/<sysmsg\b/i.test(source)) {
    return []
  }

  const normalizedText = normalizeWechatSystemText(source)
  if (!/(加入了?群聊|加入群聊)/.test(normalizedText)) {
    return []
  }

  const names: string[] = []
  const joinLinkNames = extractWechatSysmsgTemplateJoinLinkNames(source, normalizedText)
  for (const linkName of joinLinkNames) {
    names.push(...extractWechatSysmsgTemplateLinkNicknames(source, linkName))
  }

  if (!names.length) {
    const adderNames = extractWechatSysmsgTemplateLinkNicknames(source, 'adder')
    names.push(...adderNames)
  }

  if (!names.length) {
    const memberNames = extractWechatSysmsgTemplateMemberNicknames(source)
    if (memberNames.length === 1) {
      names.push(...memberNames)
    }
  }

  return normalizeWechatMemberNames(names.join('、'))
}

function extractWechatSysmsgTemplateJoinLinkNames(source: string, normalizedText: string): string[] {
  const templateTexts = [
    ...extractWechatXmlElementTexts(source, 'template'),
    ...extractWechatXmlElementTexts(source, 'plain')
  ]
  const texts = templateTexts.length ? templateTexts : [normalizedText]
  const linkNames: string[] = []

  for (const text of texts) {
    const inviteMatches = text.matchAll(/(?:邀请|邀請)([\s\S]{1,160}?)(?:加入了?群聊|加入群聊)/g)
    for (const match of inviteMatches) {
      linkNames.push(...extractWechatTemplatePlaceholderNames(match[1]))
    }
  }

  if (linkNames.length) {
    return Array.from(new Set(linkNames))
  }

  for (const text of texts) {
    const joinedMatch = text.match(/^\s*(["“'‘]?\$[^$]+\$["”'’]?)(?:通过[\s\S]{0,80})?(?:加入了?群聊|加入群聊)/)
    if (joinedMatch) {
      linkNames.push(...extractWechatTemplatePlaceholderNames(joinedMatch[1]))
    }
  }

  return Array.from(new Set(linkNames))
}

function extractWechatTemplatePlaceholderNames(value: string): string[] {
  const names: string[] = []
  for (const match of value.matchAll(/\$([^$\s]{1,80})\$/g)) {
    names.push(match[1])
  }
  return names
}

function extractWechatSysmsgTemplateLinkNicknames(source: string, linkName: string): string[] {
  const escapedName = escapeRegExp(linkName)
  const linkPattern = new RegExp(`<link\\b(?=[^>]*\\bname=["']${escapedName}["'])[^>]*>([\\s\\S]*?)<\\/link>`, 'gi')
  const names: string[] = []
  for (const match of source.matchAll(linkPattern)) {
    names.push(...extractWechatXmlElementTexts(match[1], 'nickname'))
  }
  return names
}

function extractWechatSysmsgTemplateMemberNicknames(source: string): string[] {
  const memberPattern = /<member\b[^>]*>([\s\S]*?)<\/member>/gi
  const names: string[] = []
  for (const match of source.matchAll(memberPattern)) {
    names.push(...extractWechatXmlElementTexts(match[1], 'nickname'))
  }
  return normalizeWechatMemberNames(names.join('、'))
}

function extractWechatXmlElementTexts(xml: string, elementName: string): string[] {
  const escapedName = escapeRegExp(elementName)
  const pattern = new RegExp(`<${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedName}>`, 'gi')
  const values: string[] = []
  for (const match of xml.matchAll(pattern)) {
    const value = normalizeWechatSystemText(match[1])
    if (value) {
      values.push(value)
    }
  }
  return values
}

function escapeRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

function normalizeWechatMemberNames(value: string): string[] {
  const text = normalizeWechatMemberName(value)
  if (!text) {
    return []
  }
  const parts = text
    .split(/[、,，]/)
    .map(normalizeWechatMemberName)
    .filter(Boolean)
  return Array.from(new Set(parts))
}

function normalizeWechatMemberName(value: string): string {
  const text = normalizeString(value)
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .replace(/^(?:群成员|新成员|成员)\s*/, '')
    .replace(/^(?:你|您)?邀请/, '')
    .replace(/通过.+$/, '')
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .trim()
  return /^\$[^$]+\$$/.test(text) ? '' : text
}

function normalizeMessageWebhook(payload: Dict, rawPayload: unknown): WechatInboundEvent | null {
  const uuid = normalizeString(payload.uuid || payload.UUID)
  const ownerWxid = normalizeString(payload.ownerwxid || payload.ownerWxid || payload.Ownerwxid)
  const ownerInfo = asRecord(payload.ownerinfo || payload.ownerInfo || payload.Ownerinfo)
  const contactId = normalizeString(payload.contactid || payload.contactId || payload.Contactid)
  const contactInfo = asRecord(payload.contactinfo || payload.contactInfo || payload.Contactinfo)
  const senderId =
    normalizeString(payload.sendusername || payload.sendUserName || payload.senderId || payload.Sendusername) ||
    normalizeString(payload.fromusername || payload.fromUserName || payload.Fromusername) ||
    contactId
  const senderInfo = asRecord(payload.sendcontactinfo || payload.sendContactInfo || payload.Sendcontactinfo)
  const msgType = normalizeNumber(payload.msgtype || payload.msgType || payload.Msgtype)
  const numericMsgId = normalizeNumber(payload.msgid || payload.msgId || payload.Msgid)
  const rawContent = normalizeString(payload.content || payload.Content)
  const pushContent = normalizeString(payload.pushcontent || payload.pushContent || payload.Pushcontent)
  const messageKind = resolveInboundMessageKind(msgType, rawContent)
  const isGroup = normalizeChatType(payload.chattype || payload.chatType || payload.Chattype, contactId) === 'group'
  const content = stripGroupSenderPrefix(
    messageKind === 'image' || messageKind === 'voice' || messageKind === 'file' ? rawContent : rawContent || pushContent,
    isGroup
  ).body
  const displayContent = isReferencedAppMessage(msgType, content) ? resolveReferencedAppMessageTitle(content) || content : content
  const messageId =
    normalizeString(payload.newmsgid || payload.newMsgId || payload.Newmsgid) ||
    normalizeString(numericMsgId)
  const timestamp = normalizeTimestamp(payload.createtime || payload.createTime || payload.Createtime)
  const fromUser = normalizeString(payload.fromusername || payload.fromUserName || payload.Fromusername)
  const toUser = normalizeString(payload.tousername || payload.toUserName || payload.Tousername)
  const fileInfo = asRecord(payload.fileinfo || payload.fileInfo || payload.Fileinfo)
  const imageRef = buildInboundImageRef({
    uuid,
    newMsgId: messageId,
    msgContent: rawContent || content,
    msgType,
    contactId,
    fromUser,
    toUser,
    msgId: numericMsgId,
    isSelf: normalizeBoolean(payload.isself || payload.isSelf || payload.Isself),
    fileKey: normalizeString(fileInfo?.fileurl || fileInfo?.fileUrl || fileInfo?.Fileurl) || undefined,
    originalName:
      normalizeString(fileInfo?.filename || fileInfo?.fileName || fileInfo?.Filename) ||
      normalizeString(fileInfo?.filetitle || fileInfo?.fileTitle || fileInfo?.Filetitle) ||
      undefined
  })
  const voiceRef = buildInboundVoiceRef({
    uuid,
    newMsgId: messageId,
    msgContent: rawContent || content,
    msgType,
    contactId,
    fromUser,
    toUser,
    msgId: numericMsgId,
    isSelf: normalizeBoolean(payload.isself || payload.isSelf || payload.Isself),
    fileKey: normalizeString(fileInfo?.fileurl || fileInfo?.fileUrl || fileInfo?.Fileurl) || undefined,
    originalName:
      normalizeString(fileInfo?.filename || fileInfo?.fileName || fileInfo?.Filename) ||
      normalizeString(fileInfo?.filetitle || fileInfo?.fileTitle || fileInfo?.Filetitle) ||
      undefined
  })
  const fileRef = buildInboundFileRef({
    uuid,
    newMsgId: messageId,
    msgContent: rawContent || content,
    msgType,
    contactId,
    fromUser,
    toUser,
    msgId: numericMsgId,
    isSelf: normalizeBoolean(payload.isself || payload.isSelf || payload.Isself),
    fileKey:
      normalizeString(fileInfo?.fileurl || fileInfo?.fileUrl || fileInfo?.Fileurl) ||
      resolveFileAttachId(rawContent || content) ||
      undefined,
    originalName:
      normalizeString(fileInfo?.filename || fileInfo?.fileName || fileInfo?.Filename) ||
      normalizeString(fileInfo?.filetitle || fileInfo?.fileTitle || fileInfo?.Filetitle) ||
      resolveFileTitle(rawContent || content) ||
      undefined
  })
  const mediaSignature = buildMediaSignature({
    uuid,
    messageKind,
    messageId,
    msgType,
    msgContent: rawContent || content,
    imageRef,
    voiceRef,
    fileRef
  })

  if (!uuid || !contactId || !senderId || !messageId) {
    return null
  }

  return {
    source: 'message_webhook',
    uuid,
    ownerWxid,
    ownerName: normalizeContactName(ownerInfo),
    fromUser,
    toUser,
    contactId,
    contactName: normalizeContactName(contactInfo),
    senderId,
    senderName: normalizeContactName(senderInfo),
    chatId: contactId,
    chatType: isGroup ? 'group' : 'private',
    messageId,
    msgType,
    messageKind,
    content: displayContent,
    displayText:
      messageKind === 'image' || messageKind === 'voice'
        ? pushContent
        : messageKind === 'file'
          ? pushContent || fileRef?.originalName
          : pushContent || displayContent,
    imageRef,
    voiceRef,
    fileRef,
    mediaSignature,
    timestamp,
    isSelf: normalizeBoolean(payload.isself || payload.isSelf || payload.Isself),
    raw: payload,
    rawPayload
  }
}

export function normalizeWechatAgentInput(event: WechatInboundEvent): string {
  if (event.messageKind === 'image' || event.messageKind === 'file') {
    return ''
  }
  const appMsgContent = resolveWechatEventAppMsgContent(event)
  if (isReferencedAppMessage(event.msgType, appMsgContent)) {
    return resolveReferencedAppMessageInput(appMsgContent)
  }
  const text = normalizeString(event.content || event.displayText)
  if (!text) {
    return ''
  }
  if (event.messageKind === 'voice' && looksLikeVoiceXml(text)) {
    return ''
  }
  if (/^\[[^\]]+\]$/.test(text)) {
    return ''
  }
  return text
}

function isTextLikeMessage(msgType: number | undefined): boolean {
  return msgType === undefined || msgType === 0 || msgType === 1
}

function isImageMessage(msgType: number | undefined): msgType is 3 {
  return msgType === 3
}

function isVoiceMessage(msgType: number | undefined): msgType is 34 {
  return msgType === 34
}

function isFileMessage(msgType: number | undefined, content?: string): boolean {
  if (msgType === 6 || msgType === 74) {
    return true
  }
  if (msgType === 49) {
    const appMsgType = resolveAppMsgType(content)
    return appMsgType === 6 || appMsgType === 74
  }
  return false
}

function isReferencedAppMessage(msgType: number | undefined, content?: string): boolean {
  return msgType === 49 && resolveAppMsgType(content) === WECHAT_REFERENCE_APPMSG_TYPE
}

function resolveInboundMessageKind(msgType: number | undefined, content?: string): WechatInboundMessageKind {
  if (isImageMessage(msgType)) {
    return 'image'
  }
  if (isVoiceMessage(msgType)) {
    return 'voice'
  }
  if (isFileMessage(msgType, content)) {
    return 'file'
  }
  if (isReferencedAppMessage(msgType, content)) {
    return 'text'
  }
  if (isTextLikeMessage(msgType)) {
    return 'text'
  }
  return 'unsupported'
}

export function isWechatDispatchableMessageKind(event: WechatInboundEvent): boolean {
  return event.messageKind === 'text' || event.messageKind === 'image' || event.messageKind === 'voice' || event.messageKind === 'file'
}

function buildInboundImageRef(params: {
  uuid: string
  newMsgId: string
  msgContent: string
  msgType?: number
  contactId: string
  fromUser?: string
  toUser?: string
  msgId?: number
  isSelf?: boolean
  fileKey?: string
  originalName?: string
}): WechatInboundImageRef | undefined {
  if (!isImageMessage(params.msgType) || !params.uuid || !params.newMsgId || !params.contactId) {
    return undefined
  }
  return {
    uuid: params.uuid,
    newMsgId: params.newMsgId,
    msgContent: params.msgContent,
    msgType: 3,
    contactId: params.contactId,
    fromUser: params.fromUser || undefined,
    toUser: params.toUser || undefined,
    msgId: params.msgId,
    isSelf: params.isSelf,
    preferHd: true,
    fileKey: params.fileKey || params.newMsgId,
    originalName: params.originalName
  }
}

function buildInboundVoiceRef(params: {
  uuid: string
  newMsgId: string
  msgContent: string
  msgType?: number
  contactId: string
  fromUser?: string
  toUser?: string
  msgId?: number
  isSelf?: boolean
  fileKey?: string
  originalName?: string
}): WechatInboundVoiceRef | undefined {
  if (!isVoiceMessage(params.msgType) || !params.uuid || !params.newMsgId || !params.contactId) {
    return undefined
  }
  return {
    uuid: params.uuid,
    newMsgId: params.newMsgId,
    msgContent: params.msgContent,
    msgType: 34,
    contactId: params.contactId,
    fromUser: params.fromUser || undefined,
    toUser: params.toUser || undefined,
    msgId: params.msgId,
    isSelf: params.isSelf,
    fileKey: params.fileKey || params.newMsgId,
    originalName: params.originalName,
    bufId: resolveVoiceBufId(params.msgContent),
    durationMs: resolveVoiceDurationMs(params.msgContent),
    format: resolveVoiceFormat(params.msgContent),
    byteLength: resolveVoiceByteLength(params.msgContent)
  }
}

function buildInboundFileRef(params: {
  uuid: string
  newMsgId: string
  msgContent: string
  msgType?: number
  contactId: string
  fromUser?: string
  toUser?: string
  msgId?: number
  isSelf?: boolean
  fileKey?: string
  originalName?: string
}): WechatInboundFileRef | undefined {
  if (!isFileMessage(params.msgType, params.msgContent) || !params.uuid || !params.newMsgId || !params.contactId) {
    return undefined
  }
  const originalName = params.originalName || resolveFileTitle(params.msgContent)
  const extension = resolveFileExtension(params.msgContent, originalName)
  const attachId = resolveFileAttachId(params.msgContent)
  return {
    uuid: params.uuid,
    newMsgId: params.newMsgId,
    msgContent: params.msgContent,
    msgType: params.msgType ?? resolveAppMsgType(params.msgContent) ?? 49,
    contactId: params.contactId,
    fromUser: params.fromUser || undefined,
    toUser: params.toUser || undefined,
    msgId: params.msgId,
    isSelf: params.isSelf,
    fileKey: params.fileKey || attachId || params.newMsgId,
    originalName,
    extension,
    size: resolveFileSize(params.msgContent),
    attachId,
    cdnAttachUrl: resolveFileAppAttachText(params.msgContent, 'cdnattachurl'),
    aesKey: resolveFileAppAttachText(params.msgContent, 'aeskey')
  }
}

function buildMediaSignature(params: {
  uuid: string
  messageKind: WechatInboundMessageKind
  messageId: string
  msgType?: number
  msgContent?: string
  imageRef?: WechatInboundImageRef
  voiceRef?: WechatInboundVoiceRef
  fileRef?: WechatInboundFileRef
}): string | undefined {
  if (params.messageKind !== 'image' && params.messageKind !== 'voice' && params.messageKind !== 'file') {
    return undefined
  }
  const ref =
    params.messageKind === 'voice'
      ? params.voiceRef
      : params.messageKind === 'file'
        ? params.fileRef
        : params.imageRef
  const mediaId = normalizeString(ref?.msgId) || normalizeString(ref?.newMsgId || params.messageId)
  const content = normalizeString(params.msgContent).slice(0, 256)
  return [
    params.messageKind,
    params.uuid,
    mediaId,
    params.msgType ?? '',
    ref?.contactId || '',
    ref?.fromUser || '',
    ref?.toUser || '',
    content
  ].join(':')
}

function resolveAppMsgType(content?: string): number | undefined {
  return normalizeNumber(extractXmlElementText(content, 'type'))
}

function resolveReferencedAppMessageTitle(content?: string): string | undefined {
  return normalizeString(extractXmlElementText(content, 'title')) || undefined
}

function resolveReferencedAppMessageInput(content?: string): string {
  const title = resolveReferencedAppMessageTitle(content) || ''
  const quoted = resolveReferencedAppMessageQuote(content)
  if (!quoted) {
    return title
  }
  return [title, `[引用消息]\n${quoted}`].filter(Boolean).join('\n\n')
}

function resolveReferencedAppMessageQuote(content?: string): string {
  const referMsg = extractXmlElementText(content, 'refermsg', { decode: false })
  if (!referMsg) {
    return ''
  }
  const displayName = normalizeString(extractXmlElementText(referMsg, 'displayname'))
  const quotedContent = normalizeString(extractXmlElementText(referMsg, 'content'))
  if (!quotedContent) {
    return ''
  }
  return displayName ? `${displayName}: ${quotedContent}` : quotedContent
}

function isReferencedAppMessageFromOwner(event: WechatInboundEvent, ownerWxid: string): boolean {
  const content = resolveWechatEventAppMsgContent(event)
  if (!isReferencedAppMessage(event.msgType, content)) {
    return false
  }
  const referMsg = extractXmlElementText(content, 'refermsg', { decode: false })
  if (!referMsg) {
    return false
  }
  return [
    extractXmlElementText(referMsg, 'chatusr'),
    extractXmlElementText(referMsg, 'fromusr')
  ]
    .map(normalizeString)
    .some((value) => value === ownerWxid)
}

function resolveWechatEventAppMsgContent(event: WechatInboundEvent): string {
  const raw = asRecord(event.raw)
  const rawContent = normalizeString(raw?.content || raw?.Content)
  if (rawContent) {
    return stripGroupSenderPrefix(rawContent, event.chatType === 'group').body
  }
  return normalizeString(event.content)
}

function resolveFileTitle(content?: string): string | undefined {
  return normalizeString(extractXmlElementText(content, 'title')) || undefined
}

function resolveFileExtension(content?: string, originalName?: string): string | undefined {
  const explicit = normalizeString(resolveFileAppAttachText(content, 'fileext')).replace(/^\./, '')
  if (explicit) {
    return explicit
  }
  const name = normalizeString(originalName)
  const match = name.match(/\.([A-Za-z0-9]{1,16})$/)
  return match?.[1]
}

function resolveFileSize(content?: string): number | undefined {
  const value = normalizeNumber(resolveFileAppAttachText(content, 'totallen') || extractXmlElementText(content, 'totallen'))
  return value && value > 0 ? value : undefined
}

function resolveFileAttachId(content?: string): string | undefined {
  return (
    normalizeString(resolveFileAppAttachText(content, 'attachid')) ||
    normalizeString(resolveFileAppAttachText(content, 'filekey')) ||
    normalizeString(resolveFileAppAttachText(content, 'fileid')) ||
    undefined
  )
}

function resolveFileAppAttachText(content: string | undefined, elementName: string): string | undefined {
  const appAttach = extractXmlElementText(content, 'appattach', { decode: false })
  return normalizeString(extractXmlElementText(appAttach, elementName)) || undefined
}

function extractXmlElementText(
  content: string | undefined,
  elementName: string,
  options: { decode?: boolean } = {}
): string {
  const source = normalizeString(content)
  if (!source) {
    return ''
  }
  const escapedName = elementName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const pattern = new RegExp(`<${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedName}>`, 'i')
  const value = source.match(pattern)?.[1]
  if (!value) {
    return ''
  }
  return options.decode === false ? value : decodeXmlText(value)
}

function decodeXmlText(value: string): string {
  return normalizeString(value)
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/g, '$1')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function matchKeyword(input: string, keywords: string[]): string | null {
  const lowered = input.toLowerCase()
  return keywords.find((keyword) => lowered.includes(keyword.toLowerCase())) || null
}

function normalizeMentionFallbackNames(value: unknown): string[] {
  return Array.from(
    new Set(
      normalizeKeywords(value)
        .map((name) => name.replace(/^@+/, '').trim())
        .filter(Boolean)
    )
  )
}

function isMentioned(event: WechatInboundEvent, fallbackNames: string[]): boolean {
  const ownerWxid = normalizeString(event.ownerWxid)
  if (ownerWxid && extractAtUserList(event.raw).includes(ownerWxid)) {
    return true
  }
  const content =
    event.messageKind === 'image' || event.messageKind === 'voice' || event.messageKind === 'file'
      ? normalizeString(event.displayText)
      : `${event.content}\n${event.displayText || ''}`
  if (ownerWxid && content.includes(`@${ownerWxid}`)) {
    return true
  }
  if (ownerWxid && isReferencedAppMessageFromOwner(event, ownerWxid)) {
    return true
  }
  return hasConfiguredMentionName(content, fallbackNames)
}

function looksLikeVoiceXml(value: string): boolean {
  return /<voicemsg\b/i.test(value) || /<msg>\s*<voicemsg\b/i.test(value)
}

function resolveVoiceDurationMs(content: string): number | undefined {
  const value = normalizeNumber(extractXmlAttribute(content, 'voicelength') || extractXmlAttribute(content, 'playlength'))
  return value && value > 0 ? value : undefined
}

function resolveVoiceByteLength(content: string): number | undefined {
  const value = normalizeNumber(extractXmlAttribute(content, 'length'))
  return value && value > 0 ? value : undefined
}

function resolveVoiceFormat(content: string): string | undefined {
  return normalizeString(extractXmlAttribute(content, 'voiceformat')) || undefined
}

function resolveVoiceBufId(content: string): string | undefined {
  return normalizeString(extractXmlAttribute(content, 'bufid')) || undefined
}

function extractXmlAttribute(content: string, name: string): string {
  const escapedName = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const pattern = new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*["']([^"']+)["']`, 'i')
  return normalizeString(content.match(pattern)?.[1])
}

function stripLeadingMention(input: string, fallbackNames: string[] = []): string {
  const text = normalizeString(input)
  for (const name of [...fallbackNames].sort((left, right) => right.length - left.length)) {
    const pattern = createMentionNamePattern(name, true)
    if (!pattern) {
      continue
    }
    const stripped = text.replace(pattern, '').trim()
    if (stripped !== text) {
      return stripped || input
    }
  }
  return text.replace(new RegExp(`^@[^${WECHAT_MENTION_SEPARATOR_CLASS}]+[${WECHAT_MENTION_SEPARATOR_CLASS}]*`), '').trim() || input
}

function hasConfiguredMentionName(content: string, names: string[]): boolean {
  if (!names.length) {
    return false
  }
  return names.some((name) => {
    const pattern = createMentionNamePattern(name, false)
    return pattern ? pattern.test(content) : false
  })
}

function createMentionNamePattern(name: string, leadingOnly: boolean): RegExp | null {
  const parts = normalizeString(name)
    .split(new RegExp(`[${WECHAT_MENTION_SEPARATOR_CLASS}]+`))
    .filter(Boolean)
  if (!parts.length) {
    return null
  }
  const body = parts.map(escapeRegExp).join(`[${WECHAT_MENTION_SEPARATOR_CLASS}]+`)
  const prefix = leadingOnly ? '^' : ''
  const boundary = `(?=$|[${WECHAT_MENTION_SEPARATOR_CLASS},，.。:：;；!！?？)）])`
  const suffix = leadingOnly ? `[${WECHAT_MENTION_SEPARATOR_CLASS}]*` : ''
  return new RegExp(`${prefix}@${body}${boundary}${suffix}`, 'i')
}

function extractAtUserList(raw: Record<string, unknown>): string[] {
  const values: string[] = []
  collectAtUserValues(raw, values)
  return Array.from(
    new Set(
      values
        .flatMap((value) => {
          const xmlMatch =
            value.match(/<atuserlist><!\[CDATA\[([\s\S]*?)\]\]><\/atuserlist>/i) ||
            value.match(/<atuserlist>([\s\S]*?)<\/atuserlist>/i)
          const text = xmlMatch?.[1] || value
          return text.split(/[,\s;；，]+/)
        })
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function collectAtUserValues(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    if (/<atuserlist/i.test(value)) {
      output.push(value)
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAtUserValues(item, output)
    }
    return
  }
  const record = asRecord(value)
  if (!record) {
    return
  }
  for (const [key, item] of Object.entries(record)) {
    if (/^(atuserlist|at_user_list|atusers?|beatusers?)$/i.test(key)) {
      if (Array.isArray(item)) {
        output.push(...item.map((entry) => normalizeString(entry)).filter(Boolean))
      } else {
        const text = normalizeString(item)
        if (text) {
          output.push(text)
        }
      }
      continue
    }
    collectAtUserValues(item, output)
  }
}

function normalizeContactName(record: Dict | null): string | undefined {
  if (!record) {
    return undefined
  }
  return (
    normalizeString(record.displayname || record.displayName || record.Displayname) ||
    normalizeString(record.nickname || record.nickName || record.Nickname) ||
    undefined
  )
}

function stripGroupSenderPrefix(content: string, isGroup: boolean): { senderId?: string; body: string } {
  if (!isGroup) {
    return { body: content }
  }
  const match = content.match(/^([^:\n]{2,128}):\n?([\s\S]*)$/)
  if (!match) {
    return { body: content }
  }
  return {
    senderId: match[1].trim(),
    body: match[2].trim()
  }
}

function normalizeChatType(value: unknown, contactId: string): 'private' | 'group' {
  const text = normalizeString(value).toLowerCase()
  if (text === 'room' || text === 'group') {
    return 'group'
  }
  return isGroupContact(contactId) ? 'group' : 'private'
}

function isGroupContact(value: string): boolean {
  return value.endsWith('@chatroom')
}

function normalizeTimestamp(value: unknown): number {
  const number = normalizeNumber(value)
  if (!number) {
    return Date.now()
  }
  return number > 10_000_000_000 ? number : number * 1000
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function asRecord(value: unknown): Dict | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Dict
}
