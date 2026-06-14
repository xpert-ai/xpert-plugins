import { WECHAT_PERSONAL_PROVIDER_KEY } from './constants.js'

export type WechatPersonalGroupTriggerMode =
  | 'mention_or_keywords'
  | 'all'
  | 'mentions'
  | 'keywords'
  | 'off'

export interface TIntegrationWechatPersonalOptions {
  baseUrl: string
  apiVersion?: string
  timeoutMs?: number
  apiToken?: string
  preferLanguage?: 'en' | 'zh-Hans'
  callbackSecret?: string
  groupTriggerMode?: WechatPersonalGroupTriggerMode
  groupKeywords?: string[]
  ignoreSelfMessages?: boolean
  fallbackToLegacySendText?: boolean
}

export interface WechatPersonalInboundEvent {
  source: 'legacy_callback' | 'message_webhook'
  uuid: string
  ownerWxid?: string
  ownerName?: string
  contactId: string
  contactName?: string
  senderId: string
  senderName?: string
  chatId: string
  chatType: 'private' | 'group'
  messageId: string
  msgType?: number
  content: string
  displayText?: string
  timestamp: number
  isSelf: boolean
  raw: Record<string, unknown>
  rawPayload: unknown
}

export interface WechatPersonalDispatchableMessage extends WechatPersonalInboundEvent {
  input: string
  triggerReason: 'private' | 'group_all' | 'mention' | 'keyword'
}

type Dict = Record<string, unknown>

export function isWechatPersonalProviderValue(value: unknown): boolean {
  return value === WECHAT_PERSONAL_PROVIDER_KEY
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

export function normalizeTimeoutMs(value: unknown, defaultValue = 10000): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
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

export function normalizeGroupTriggerMode(value: unknown): WechatPersonalGroupTriggerMode {
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

export function normalizeWechatPersonalInboundPayload(payload: unknown): WechatPersonalInboundEvent | null {
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

export function shouldDispatchWechatPersonalMessage(
  event: WechatPersonalInboundEvent,
  options?: Pick<
    TIntegrationWechatPersonalOptions,
    'ignoreSelfMessages' | 'groupTriggerMode' | 'groupKeywords'
  >
): WechatPersonalDispatchableMessage | null {
  if ((options?.ignoreSelfMessages ?? true) && event.isSelf) {
    return null
  }
  if (!isTextLikeMessage(event.msgType)) {
    return null
  }

  const input = normalizeAgentInput(event)
  if (!input) {
    return null
  }

  if (event.chatType !== 'group') {
    return {
      ...event,
      input,
      triggerReason: 'private'
    }
  }

  const mode = normalizeGroupTriggerMode(options?.groupTriggerMode)
  if (mode === 'off') {
    return null
  }
  if (mode === 'all') {
    return {
      ...event,
      input,
      triggerReason: 'group_all'
    }
  }

  const mentioned = isMentioned(event)
  const keyword = matchKeyword(input, normalizeKeywords(options?.groupKeywords))

  if ((mode === 'mentions' || mode === 'mention_or_keywords') && mentioned) {
    return {
      ...event,
      input: stripLeadingMention(input),
      triggerReason: 'mention'
    }
  }

  if ((mode === 'keywords' || mode === 'mention_or_keywords') && keyword) {
    return {
      ...event,
      input,
      triggerReason: 'keyword'
    }
  }

  return null
}

export function summarizePayload(payload: unknown, maxLength = 4000): string {
  try {
    const text = JSON.stringify(payload)
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  } catch {
    return '[unserializable payload]'
  }
}

function normalizeLegacyCallback(wrapper: Dict, rawPayload: unknown): WechatPersonalInboundEvent | null {
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
  const msgId = normalizeString(message.new_msg_id || message.newMsgId || message.NewMsgId) ||
    normalizeString(message.msg_id || message.msgId || message.MsgId)
  const timestamp = normalizeTimestamp(message.create_time || message.createTime || message.CreateTime)
  const isGroup = isGroupContact(fromUser) || isGroupContact(toUser)
  const ownerWxid = resolveLegacyOwnerWxid(fromUser, toUser, content, isGroup)
  const contactId = resolveContactId(fromUser, toUser, ownerWxid)
  const parsed = parseGroupSender(content, isGroup, ownerWxid)
  const senderId = parsed.senderId || (!isGroup && fromUser ? fromUser : ownerWxid) || contactId
  const body = parsed.body || content
  const isSelf = isGroup ? senderId === ownerWxid : fromUser === ownerWxid

  if (!uuid || !contactId || !senderId || !msgId) {
    return null
  }

  return {
    source: 'legacy_callback',
    uuid,
    ownerWxid,
    contactId,
    senderId,
    chatId: contactId,
    chatType: isGroup ? 'group' : 'private',
    messageId: msgId,
    msgType,
    content: body,
    displayText: pushContent || body,
    timestamp,
    isSelf,
    raw: message,
    rawPayload
  }
}

function normalizeMessageWebhook(payload: Dict, rawPayload: unknown): WechatPersonalInboundEvent | null {
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
  const rawContent = normalizeString(payload.content || payload.Content)
  const pushContent = normalizeString(payload.pushcontent || payload.pushContent || payload.Pushcontent)
  const isGroup = normalizeChatType(payload.chattype || payload.chatType || payload.Chattype, contactId) === 'group'
  const content = stripGroupSenderPrefix(rawContent || pushContent, isGroup).body
  const messageId =
    normalizeString(payload.newmsgid || payload.newMsgId || payload.Newmsgid) ||
    normalizeString(payload.msgid || payload.msgId || payload.Msgid)
  const timestamp = normalizeTimestamp(payload.createtime || payload.createTime || payload.Createtime)

  if (!uuid || !contactId || !senderId || !messageId) {
    return null
  }

  return {
    source: 'message_webhook',
    uuid,
    ownerWxid,
    ownerName: normalizeContactName(ownerInfo),
    contactId,
    contactName: normalizeContactName(contactInfo),
    senderId,
    senderName: normalizeContactName(senderInfo),
    chatId: contactId,
    chatType: isGroup ? 'group' : 'private',
    messageId,
    msgType,
    content,
    displayText: pushContent || content,
    timestamp,
    isSelf: normalizeBoolean(payload.isself || payload.isSelf || payload.Isself),
    raw: payload,
    rawPayload
  }
}

function normalizeAgentInput(event: WechatPersonalInboundEvent): string {
  const text = normalizeString(event.content || event.displayText)
  if (!text) {
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

function matchKeyword(input: string, keywords: string[]): string | null {
  const lowered = input.toLowerCase()
  return keywords.find((keyword) => lowered.includes(keyword.toLowerCase())) || null
}

function isMentioned(event: WechatPersonalInboundEvent): boolean {
  const rawText = summarizePayload(event.raw, 2000)
  const ownerWxid = normalizeString(event.ownerWxid)
  if (ownerWxid && rawText.includes(ownerWxid) && /atuserlist|atuser|@/i.test(rawText)) {
    return true
  }
  const content = `${event.content}\n${event.displayText || ''}`
  if (ownerWxid && content.includes(`@${ownerWxid}`)) {
    return true
  }
  return /(^|\s)@[^\s]{1,32}/.test(content)
}

function stripLeadingMention(input: string): string {
  return input.replace(/^@[^\s]+\s*/, '').trim() || input
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
