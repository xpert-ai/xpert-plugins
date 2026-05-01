import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const moduleDir = dirname(__filename)

export const iconImage = `data:image/png;base64,${readFileSync(join(moduleDir, '../_assets/icon.png')).toString('base64')}`

export const INTEGRATION_WECOM = 'wecom'
export const INTEGRATION_WECOM_LONG = 'wecom_long'

export type TIntegrationWeComShortOptions = {
  token: string
  encodingAesKey: string
  preferLanguage?: 'en' | 'zh-Hans'
  timeoutMs?: number
}

export type TIntegrationWeComLongOptions = {
  botId: string
  secret: string
  wsOrigin?: string
  preferLanguage?: 'en' | 'zh-Hans'
  timeoutMs?: number
}

export type TIntegrationWeComOptions = {
  // short mode
  token?: string
  encodingAesKey?: string
  // long mode
  botId?: string
  secret?: string
  wsOrigin?: string
  // shared
  preferLanguage?: 'en' | 'zh-Hans'
  timeoutMs?: number
  // deprecated openapi fields (kept only for backward compatibility with saved integrations)
  corpId?: string
  corpSecret?: string
  agentId?: number
}

export type TWeComConnectionMode = 'webhook' | 'long_connection'

export type TWeComLongRuntimeState = 'idle' | 'connecting' | 'connected' | 'retrying' | 'unhealthy'

export type TWeComLongDisabledReason =
  | 'manual_disconnect'
  | 'integration_disabled'
  | 'xpert_unbound'
  | 'config_invalid'
  | 'lease_conflict'
  | 'runtime_error'
  | 'restore_skipped'

export type TWeComRuntimeStatus = {
  integrationId: string
  connectionMode: TWeComConnectionMode
  connected: boolean
  state: TWeComLongRuntimeState
  shouldRun?: boolean
  ownerInstanceId?: string | null
  lastConnectedAt?: number | null
  lastDisconnectedAt?: number | null
  lastError?: string | null
  failureCount?: number
  reconnectAttempts?: number
  nextReconnectAt?: number | null
  disabledReason?: TWeComLongDisabledReason | null
  lastCallbackAt?: number | null
  lastPingAt?: number | null
}

export type TWeComLegacyLongConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export type TWeComLegacyLongConnectionStatus = {
  integrationId: string
  state: TWeComLegacyLongConnectionState
  connected: boolean
  shouldRun: boolean
  connectedAt?: number
  disconnectedAt?: number
  reconnectAttempts: number
  lastError?: string
  disabledReason?: TWeComLongDisabledReason | null
}

export type TWeComEvent = {
  msgType?: string
  eventType?: string
  cmd?: string
  reqId?: string
  messageId?: string
  chatId: string
  chatType?: 'private' | 'group' | 'channel' | 'thread'
  senderId: string
  senderName?: string
  content: string
  responseUrl?: string
  timestamp: number
  mentions?: Array<{ id: string; name?: string }>
  raw?: unknown
}

export function computeWeComSignature(params: {
  token: string
  timestamp: string
  nonce: string
  encrypt: string
}): string {
  const values = [params.token, params.timestamp, params.nonce, params.encrypt].sort()
  return createHash('sha1').update(values.join('')).digest('hex')
}

export function verifyWeComSignature(params: {
  token?: string
  timestamp?: string
  nonce?: string
  encrypt?: string
  signature?: string
}): boolean {
  if (!params.token || !params.timestamp || !params.nonce || !params.encrypt || !params.signature) {
    return false
  }

  const expected = computeWeComSignature({
    token: params.token,
    timestamp: params.timestamp,
    nonce: params.nonce,
    encrypt: params.encrypt
  })

  return expected === params.signature
}

function decodeAesKey(aesKey: string): Buffer {
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

export function decryptWeComMessage(params: {
  encrypt: string
  aesKey: string
  receiveId?: string
}): string {
  const key = decodeAesKey(params.aesKey)
  const iv = key.subarray(0, 16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  decipher.setAutoPadding(false)

  const encrypted = Buffer.from(params.encrypt, 'base64')
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  const unpadded = removePkcs7Padding(decrypted)

  if (unpadded.length < 20) {
    throw new Error('Invalid decrypted WeCom payload length')
  }

  const msgLength = unpadded.readUInt32BE(16)
  const msgStart = 20
  const msgEnd = msgStart + msgLength

  if (msgEnd > unpadded.length) {
    throw new Error('Invalid WeCom payload message length')
  }

  const message = unpadded.subarray(msgStart, msgEnd).toString('utf8')
  const receiveId = unpadded.subarray(msgEnd).toString('utf8')

  if (params.receiveId && receiveId && params.receiveId !== receiveId) {
    throw new Error('WeCom callback receiveId mismatch')
  }

  return message
}

export function encryptWeComMessage(params: {
  message: string
  aesKey: string
  receiveId: string
}): string {
  const key = decodeAesKey(params.aesKey)
  const iv = key.subarray(0, 16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  cipher.setAutoPadding(false)

  const random = randomBytes(16)
  const msgBuffer = Buffer.from(params.message, 'utf8')
  const msgLength = Buffer.alloc(4)
  msgLength.writeUInt32BE(msgBuffer.length, 0)
  const receiveId = Buffer.from(params.receiveId, 'utf8')

  const plaintext = applyPkcs7Padding(Buffer.concat([random, msgLength, msgBuffer, receiveId]))
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return encrypted.toString('base64')
}
