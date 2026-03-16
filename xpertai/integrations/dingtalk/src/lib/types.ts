import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

export const INTEGRATION_DINGTALK = 'dingtalk'

export const DingTalkName = 'dingtalk'

export const iconImage = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg fill="#4aa4f8" width="800px" height="800px" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" class="icon" stroke="#4aa4f8">
<g id="SVGRepo_bgCarrier" stroke-width="0"/>
<g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"/>
<g id="SVGRepo_iconCarrier"> <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm227 385.3c-1 4.2-3.5 10.4-7 17.8h.1l-.4.7c-20.3 43.1-73.1 127.7-73.1 127.7s-.1-.2-.3-.5l-15.5 26.8h74.5L575.1 810l32.3-128h-58.6l20.4-84.7c-16.5 3.9-35.9 9.4-59 16.8 0 0-31.2 18.2-89.9-35 0 0-39.6-34.7-16.6-43.4 9.8-3.7 47.4-8.4 77-12.3 40-5.4 64.6-8.2 64.6-8.2S422 517 392.7 512.5c-29.3-4.6-66.4-53.1-74.3-95.8 0 0-12.2-23.4 26.3-12.3 38.5 11.1 197.9 43.2 197.9 43.2s-207.4-63.3-221.2-78.7c-13.8-15.4-40.6-84.2-37.1-126.5 0 0 1.5-10.5 12.4-7.7 0 0 153.3 69.7 258.1 107.9 104.8 37.9 195.9 57.3 184.2 106.7z"/> </g>
</svg>`

export type TIntegrationDingTalkOptions = {
  clientId: string
  clientSecret: string
  robotCode?: string
  xpertId?: string
  preferLanguage?: 'zh-Hans' | 'en'
  httpCallbackEnabled: boolean
  callbackToken?: string
  callbackAesKey?: string
  // Deprecated alias for callback decrypt only. Defaults to clientId when empty.
  appKey?: string
  // Optional fallback fields for incoming webhook bot style send.
  webhookAccessToken?: string
  webhookSignSecret?: string
  apiBaseUrl?: string
  legacyApiBaseUrl?: string
}

export type TDingTalkUserProvisionOptions = {
  autoProvision?: boolean
  roleName?: string
}

export type TDingTalkConversationStatus = 'thinking' | 'continuing' | 'waiting' | 'interrupted' | 'end' | 'error'

export const DINGTALK_CONFIRM = 'dingtalk:confirm'
export const DINGTALK_REJECT = 'dingtalk:reject'
export const DINGTALK_END_CONVERSATION = 'dingtalk:end'

export function normalizeDingTalkRobotCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const code = value.trim()
  if (!code || code.toLowerCase() === 'normal') {
    return null
  }
  return code
}

export type DingTalkCardActionValue =
  | string
  | {
      action?: string
      type?: string
      value?: string
      id?: string
      [key: string]: unknown
    }

export function isDingTalkCardActionValue(value: unknown): value is DingTalkCardActionValue {
  return typeof value === 'string' || (!!value && typeof value === 'object')
}

export function resolveDingTalkCardActionValue(value: DingTalkCardActionValue | undefined): string {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return String(value.action ?? value.type ?? value.value ?? value.id ?? '')
}

export function isConfirmAction(value: DingTalkCardActionValue | undefined): boolean {
  return resolveDingTalkCardActionValue(value) === DINGTALK_CONFIRM
}

export function isRejectAction(value: DingTalkCardActionValue | undefined): boolean {
  return resolveDingTalkCardActionValue(value) === DINGTALK_REJECT
}

export function isEndAction(value: DingTalkCardActionValue | undefined): boolean {
  return resolveDingTalkCardActionValue(value) === DINGTALK_END_CONVERSATION
}

export type DingTalkStructuredElement = Record<string, unknown> & {
  tag?: string
}

export type DingTalkRenderElement = DingTalkStructuredElement
export type DingTalkCardElement = DingTalkRenderElement

export type TDingTalkEvent = {
  eventType?: string
  eventId?: string
  timestamp?: number
  robotCode?: string
  conversationId?: string
  chatId?: string
  chatbotUserId?: string
  isInAtList?: boolean
  senderId?: string
  senderName?: string
  text?: string
  sessionWebhook?: string
  /** Expiry time in ms (from sessionWebhookExpiredTime in callback). Used for cache TTL. */
  sessionWebhookExpiredTime?: number
  message?: {
    content?: string
    [key: string]: unknown
  }
  mentions?: Array<{ id: string; name?: string }>
  cardAction?: {
    messageId?: string
    chatId?: string
    userId?: string
    value?: DingTalkCardActionValue
  }
  raw?: unknown
}

export type ChatDingTalkContext<T = TDingTalkEvent> = {
  integrationId: string
  tenant?: unknown
  organizationId?: string
  preferLanguage?: string
  robotCode?: string
  chatId?: string
  chatType?: 'private' | 'group'
  userId?: string
  senderOpenId?: string
  sessionWebhook?: string
  input?: string
  message?: T
  dingtalkChannel?: unknown
}

export type DingTalkMessage = {
  params: {
    receive_id_type: string
  }
  data: {
    receive_id: string
    msg_type: 'text' | 'markdown' | 'interactive'
    content: string
  }
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toStringSafe(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value == null) {
    return ''
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function toNumberSafe(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : -1
}

export interface DingTalkFieldViolation {
  field?: string
  message?: string
  reason?: string
  [key: string]: unknown
}

export interface DingTalkError {
  code: number
  msg: string
  field_violations?: DingTalkFieldViolation[]
  error?: {
    message?: string
    log_id?: string
    troubleshooter?: string
    field_violations?: DingTalkFieldViolation[]
  }
  log_id?: string
  troubleshooter?: string
}

export function parseDingTalkClientError(error: unknown): DingTalkError {
  if (isRecord(error)) {
    const response = isRecord(error.response) ? error.response : undefined
    const data = response && isRecord(response.data) ? response.data : isRecord(error.data) ? error.data : undefined
    const target = data ?? error
    const nestedError = isRecord(target.error) ? target.error : undefined
    // DingTalk uses errcode/errmsg (legacy) or code/msg (v1) or errorCode/errorMessage
    const code = toNumberSafe(
      target.code ?? target.errcode ?? nestedError?.code ?? nestedError?.errorCode ?? (target.code !== undefined ? target.code : undefined)
    )
    const msg = toStringSafe(
      target.msg ??
        target.errmsg ??
        nestedError?.message ??
        target.message ??
        target.errorMessage ??
        nestedError?.errorMessage ??
        error.message ??
        'DingTalk request failed'
    )
    // If we still have no useful message and have response body, append raw body for debugging
    const rawHint =
      (msg === 'DingTalk request failed' || msg === 'Request failed with status code 400') && data
        ? ` Response: ${toStringSafe(data)}`
        : ''

    return {
      code: code !== -1 ? code : toNumberSafe(target.errcode),
      msg: msg + rawHint,
      log_id: toStringSafe(target.log_id ?? nestedError?.log_id),
      troubleshooter: toStringSafe(target.troubleshooter ?? nestedError?.troubleshooter),
      field_violations:
        (Array.isArray(target.field_violations) ? (target.field_violations as DingTalkFieldViolation[]) : undefined) ||
        (Array.isArray(nestedError?.field_violations)
          ? (nestedError.field_violations as DingTalkFieldViolation[])
          : undefined),
      error: nestedError
        ? {
            message: toStringSafe(nestedError.message),
            log_id: toStringSafe(nestedError.log_id),
            troubleshooter: toStringSafe(nestedError.troubleshooter),
            field_violations: Array.isArray(nestedError.field_violations)
              ? (nestedError.field_violations as DingTalkFieldViolation[])
              : undefined
          }
        : undefined
    }
  }

  return {
    code: -1,
    msg: toStringSafe(error)
  }
}

export function formatDingTalkErrorToMarkdown(error: DingTalkError): string {
  const details = error.error?.message || error.msg
  const violations = error.field_violations ?? error.error?.field_violations
  const violationLines =
    violations?.map((item, index) => {
      const field = item.field ? `\`${item.field}\`` : 'unknown'
      const reason = item.message || item.reason || 'invalid'
      return `${index + 1}. ${field}: ${reason}`
    }) ?? []

  return [
    '### DingTalk API Error',
    `- code: ${error.code}`,
    `- message: ${details}`,
    ...(error.log_id ? [`- log_id: ${error.log_id}`] : []),
    ...(error.troubleshooter ? [`- troubleshooter: ${error.troubleshooter}`] : []),
    ...(violationLines.length ? ['- field_violations:', ...violationLines] : [])
  ].join('\n')
}

export function buildEventDedupeKey(params: {
  integrationId: string
  eventId?: string
  timestamp?: number | string
  conversationId?: string
  senderId?: string
}): string {
  return [
    params.integrationId,
    params.eventId || 'no-event-id',
    params.timestamp || 'no-ts',
    params.conversationId || 'no-conversation',
    params.senderId || 'no-sender'
  ].join(':')
}

export function computeDingTalkSignature(params: {
  token: string
  timestamp: string
  nonce: string
  encrypt: string
}): string {
  const values = [params.token, params.timestamp, params.nonce, params.encrypt].sort()
  const content = values.join('')
  return createHash('sha1').update(content).digest('hex')
}

export function verifyDingTalkSignature(params: {
  token?: string
  timestamp?: string
  nonce?: string
  encrypt?: string
  signature?: string
}): boolean {
  if (!params.token || !params.timestamp || !params.nonce || !params.encrypt || !params.signature) {
    return false
  }

  const expected = computeDingTalkSignature({
    token: params.token,
    timestamp: params.timestamp,
    nonce: params.nonce,
    encrypt: params.encrypt
  })

  return expected === params.signature
}

function decodeAesKey(aesKey: string): Buffer {
  // DingTalk callback AES key is Base64 (43 chars without trailing '=')
  const normalized = aesKey.endsWith('=') ? aesKey : `${aesKey}=`
  return Buffer.from(normalized, 'base64')
}

function removePkcs7Padding(buffer: Buffer): Buffer {
  const pad = buffer[buffer.length - 1]
  if (pad < 1 || pad > 32) {
    return buffer
  }
  return buffer.subarray(0, buffer.length - pad)
}

function applyPkcs7Padding(buffer: Buffer, blockSize = 32): Buffer {
  const pad = blockSize - (buffer.length % blockSize || blockSize)
  return Buffer.concat([buffer, Buffer.alloc(pad, pad)])
}

/**
 * Decrypt DingTalk callback encrypted payload.
 * Payload layout is compatible with enterprise callback message framing:
 * random(16) + msgLen(4) + msg + appKey
 */
export function decryptDingTalkEncrypt(params: {
  encrypt: string
  aesKey: string
  appKey?: string
}): string {
  const key = decodeAesKey(params.aesKey)
  const iv = key.subarray(0, 16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  decipher.setAutoPadding(false)

  const encrypted = Buffer.from(params.encrypt, 'base64')
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  const unpadded = removePkcs7Padding(decrypted)

  if (unpadded.length < 20) {
    throw new Error('Invalid decrypted DingTalk payload length')
  }

  const msgLength = unpadded.readUInt32BE(16)
  const msgStart = 20
  const msgEnd = msgStart + msgLength

  if (msgEnd > unpadded.length) {
    throw new Error('Invalid DingTalk payload message length')
  }

  const message = unpadded.subarray(msgStart, msgEnd).toString('utf8')
  const appKey = unpadded.subarray(msgEnd).toString('utf8')

  if (params.appKey && appKey && params.appKey !== appKey) {
    throw new Error('DingTalk callback appKey mismatch')
  }

  return message
}

/**
 * Encrypt DingTalk callback response payload.
 * Payload layout: random(16) + msgLen(4) + msg + appKey
 */
export function encryptDingTalkMessage(params: {
  message: string
  aesKey: string
  appKey: string
}): string {
  const key = decodeAesKey(params.aesKey)
  const iv = key.subarray(0, 16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  cipher.setAutoPadding(false)

  const random = randomBytes(16)
  const msgBuffer = Buffer.from(params.message, 'utf8')
  const msgLength = Buffer.alloc(4)
  msgLength.writeUInt32BE(msgBuffer.length, 0)
  const appKey = Buffer.from(params.appKey, 'utf8')

  const plaintext = applyPkcs7Padding(Buffer.concat([random, msgLength, msgBuffer, appKey]))
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return encrypted.toString('base64')
}
