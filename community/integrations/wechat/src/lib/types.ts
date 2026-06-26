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
export type WechatInboundMessageKind = 'text' | 'image' | 'voice' | 'unsupported'
export type WechatSelfMessagePolicy = 'history_only' | 'ignore' | 'dispatch'

export type WechatOutboundOverflowAction = 'reject' | 'pause_until_manual_resume'

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

export interface TIntegrationWechatOptions {
  connectionMode?: WechatConnectionMode
  baseUrl?: string
  tunnelClientId?: string
  apiVersion?: string
  timeoutMs?: number
  apiToken?: string
  preferLanguage?: 'en' | 'zh-Hans'
  webhookCredential?: WechatWebhookCredentialRecord | null
  fallbackToLegacySendText?: boolean
  fallbackToLegacySendImage?: boolean
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
}

export type WechatChatRequestFile = NonNullable<TChatRequestHuman['files']>[number]

export type WechatInboundFile = WechatChatRequestFile & {
  id?: string
  fileUrl: string
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

export interface WechatInboundEvent {
  source: 'legacy_callback' | 'message_webhook'
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

export interface WechatBatchTriggerItem {
  input: string
  messageKind: WechatInboundMessageKind
  chatType?: 'private' | 'group'
  mentioned?: boolean
  groupKeywordMatched?: boolean
}

export interface WechatBatchDispatchDecision {
  inputParts: string[]
  triggerReason: WechatTriggerReason
}

export type WechatVoiceTranscriptionDecision = {
  triggerReason: 'private' | 'group_all' | 'mention' | 'keyword_candidate'
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

  if (asRecord(record.message)) {
    return normalizeLegacyCallback(record, payload)
  }

  if (normalizeString(record.uuid || record.UUID) && normalizeString(record.contactid || record.Contactid)) {
    return normalizeMessageWebhook(record, payload)
  }

  return null
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
  if (!input && event.messageKind !== 'image') {
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

  const mentioned = isMentioned(event, normalizeMentionFallbackNames(options?.mentionFallbackNames))
  const keyword = matchKeyword(input, normalizeKeywords(options?.groupKeywords))

  if ((mode === 'mentions' || mode === 'mention_or_keywords') && mentioned) {
    const dispatchable: WechatDispatchableMessage = {
      ...event,
      input: stripLeadingMention(input),
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
  input: string = normalizeWechatAgentInput(event)
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
      : false
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
    return Boolean(normalizeString(item.input)) || item.messageKind === 'image'
  })
  if (!candidates.length) {
    return null
  }

  const inputParts = candidates.map((item) => normalizeString(item.input))
  const aggregatedInput = inputParts.join('\n')
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
    const strippedInputParts = candidates.map((item) =>
      item.mentioned ? stripLeadingMention(normalizeString(item.input)) : normalizeString(item.input)
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

function normalizeLegacyCallback(wrapper: Dict, rawPayload: unknown): WechatInboundEvent | null {
  const message = asRecord(wrapper.message)
  if (!message) {
    return null
  }

  const uuid = normalizeString(wrapper.key || wrapper.uuid || wrapper.UUID)
  const fromUser = builtinString(message.from_user_name || message.fromUserName || message.FromUserName)
  const toUser = builtinString(message.to_user_name || message.toUserName || message.ToUserName)
  const content = builtinString(message.content || message.Content)
  const pushContent = normalizeString(message.push_content || message.pushContent || message.PushContent)
  const msgType = normalizeNumber(message.msg_type || message.msgType || message.MsgType)
  const numericMsgId = normalizeNumber(message.msg_id || message.msgId || message.MsgId)
  const newMsgId = normalizeString(message.new_msg_id || message.newMsgId || message.NewMsgId)
  const msgId = newMsgId || normalizeString(numericMsgId)
  const timestamp = normalizeTimestamp(message.create_time || message.createTime || message.CreateTime)
  const isGroup = isGroupContact(fromUser) || isGroupContact(toUser)
  const ownerWxid = resolveLegacyOwnerWxid(fromUser, toUser, content, isGroup)
  const contactId = resolveContactId(fromUser, toUser, ownerWxid)
  const parsed = parseGroupSender(content, isGroup, ownerWxid)
  const senderId = parsed.senderId || (!isGroup && fromUser ? fromUser : ownerWxid) || contactId
  const body = parsed.body || content
  const isSelf = isGroup ? senderId === ownerWxid : fromUser === ownerWxid
  const messageKind = resolveInboundMessageKind(msgType)
  const imageRef = buildInboundImageRef({
    uuid,
    newMsgId: msgId,
    msgContent: content,
    msgType,
    contactId,
    fromUser,
    toUser,
    msgId: numericMsgId,
    isSelf
  })
  const voiceRef = buildInboundVoiceRef({
    uuid,
    newMsgId: msgId,
    msgContent: content,
    msgType,
    contactId,
    fromUser,
    toUser,
    msgId: numericMsgId,
    isSelf
  })
  const mediaSignature = buildMediaSignature({
    uuid,
    messageKind,
    messageId: msgId,
    msgType,
    msgContent: content,
    imageRef,
    voiceRef
  })

  if (!uuid || !contactId || !senderId || !msgId) {
    return null
  }

  return {
    source: 'legacy_callback',
    uuid,
    ownerWxid,
    fromUser,
    toUser,
    contactId,
    senderId,
    chatId: contactId,
    chatType: isGroup ? 'group' : 'private',
    messageId: msgId,
    msgType,
    messageKind,
    content: body,
    displayText: messageKind === 'image' || messageKind === 'voice' ? pushContent : pushContent || body,
    imageRef,
    voiceRef,
    mediaSignature,
    timestamp,
    isSelf,
    raw: message,
    rawPayload
  }
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
  const messageKind = resolveInboundMessageKind(msgType)
  const numericMsgId = normalizeNumber(payload.msgid || payload.msgId || payload.Msgid)
  const rawContent = normalizeString(payload.content || payload.Content)
  const pushContent = normalizeString(payload.pushcontent || payload.pushContent || payload.Pushcontent)
  const isGroup = normalizeChatType(payload.chattype || payload.chatType || payload.Chattype, contactId) === 'group'
  const content = stripGroupSenderPrefix(
    messageKind === 'image' || messageKind === 'voice' ? rawContent : rawContent || pushContent,
    isGroup
  ).body
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
  const mediaSignature = buildMediaSignature({
    uuid,
    messageKind,
    messageId,
    msgType,
    msgContent: rawContent || content,
    imageRef,
    voiceRef
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
    content,
    displayText: messageKind === 'image' || messageKind === 'voice' ? pushContent : pushContent || content,
    imageRef,
    voiceRef,
    mediaSignature,
    timestamp,
    isSelf: normalizeBoolean(payload.isself || payload.isSelf || payload.Isself),
    raw: payload,
    rawPayload
  }
}

export function normalizeWechatAgentInput(event: WechatInboundEvent): string {
  if (event.messageKind === 'image') {
    return ''
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

function resolveInboundMessageKind(msgType: number | undefined): WechatInboundMessageKind {
  if (isImageMessage(msgType)) {
    return 'image'
  }
  if (isVoiceMessage(msgType)) {
    return 'voice'
  }
  if (isTextLikeMessage(msgType)) {
    return 'text'
  }
  return 'unsupported'
}

export function isWechatDispatchableMessageKind(event: WechatInboundEvent): boolean {
  return event.messageKind === 'text' || event.messageKind === 'image' || event.messageKind === 'voice'
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

function buildMediaSignature(params: {
  uuid: string
  messageKind: WechatInboundMessageKind
  messageId: string
  msgType?: number
  msgContent?: string
  imageRef?: WechatInboundImageRef
  voiceRef?: WechatInboundVoiceRef
}): string | undefined {
  if (params.messageKind !== 'image' && params.messageKind !== 'voice') {
    return undefined
  }
  const ref = params.messageKind === 'voice' ? params.voiceRef : params.imageRef
  const content = normalizeString(params.msgContent).slice(0, 256)
  return [
    params.messageKind,
    params.uuid,
    ref?.newMsgId || params.messageId,
    params.msgType ?? '',
    ref?.contactId || '',
    ref?.fromUser || '',
    ref?.toUser || '',
    content
  ].join(':')
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
    event.messageKind === 'image' || event.messageKind === 'voice'
      ? normalizeString(event.displayText)
      : `${event.content}\n${event.displayText || ''}`
  if (ownerWxid && content.includes(`@${ownerWxid}`)) {
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

function stripLeadingMention(input: string): string {
  return input.replace(/^@[^\s]+\s*/, '').trim() || input
}

function hasConfiguredMentionName(content: string, names: string[]): boolean {
  if (!names.length) {
    return false
  }
  const lowered = content.toLowerCase()
  return names.some((name) => {
    const token = `@${name}`.toLowerCase()
    let index = lowered.indexOf(token)
    while (index >= 0) {
      const next = content[index + token.length]
      if (!next || /[\s,，.。:：;；!！?？)）]/.test(next)) {
        return true
      }
      index = lowered.indexOf(token, index + 1)
    }
    return false
  })
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

function parseGroupSender(content: string, isGroup: boolean, ownerWxid?: string): { senderId?: string; body: string } {
  if (!isGroup) {
    return { body: content }
  }
  const parsed = stripGroupSenderPrefix(content, true)
  const senderId = parsed.senderId || ownerWxid
  return {
    senderId,
    body: parsed.body
  }
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

function resolveLegacyOwnerWxid(fromUser: string, toUser: string, content: string, isGroup: boolean): string {
  if (isGroup) {
    if (isGroupContact(fromUser)) {
      return toUser
    }
    if (isGroupContact(toUser)) {
      return fromUser
    }
  }
  if (toUser && !isGroupContact(toUser)) {
    return toUser
  }
  const sender = stripGroupSenderPrefix(content, isGroup).senderId
  if (sender && fromUser && sender === fromUser) {
    return toUser
  }
  return toUser || fromUser
}

function resolveContactId(fromUser: string, toUser: string, ownerWxid: string): string {
  if (isGroupContact(fromUser)) {
    return fromUser
  }
  if (isGroupContact(toUser)) {
    return toUser
  }
  if (fromUser === ownerWxid) {
    return toUser
  }
  if (toUser === ownerWxid) {
    return fromUser
  }
  return fromUser || toUser
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

function builtinString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  const record = asRecord(value)
  if (!record) {
    return ''
  }
  return normalizeString(record.str || record.Str || record.string || record.String)
}

function asRecord(value: unknown): Dict | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Dict
}
