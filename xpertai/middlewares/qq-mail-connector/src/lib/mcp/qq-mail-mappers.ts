import { convert } from 'html-to-text'
import { createHash } from 'node:crypto'
import { QQ_MAIL_MAX_DOWNLOAD_ATTACHMENT_BYTES } from '../constants.js'
import { QqMailConnectorError } from '../errors.js'
import type { QqMailAccount, QqMailAlias, QqMailMcpPayload, QqMailMcpToolFailure } from './types.js'

export type QqMailAttachmentContent = {
  attachmentId: string
  fileName: string
  mimeType: string
  size: number
  sha1?: string
  buffer: Buffer
}

export function mapAccount(payload: QqMailMcpPayload): QqMailAccount {
  const data = unwrapData(payload)
  const aliases: QqMailAlias[] = []
  for (const alias of readRecordArray(data.aliases)) {
    const aliasId = readString(alias.alias_id)
    const email = readString(alias.email)
    if (aliasId && email) {
      aliases.push({ aliasId, email, name: readString(alias.name), isPrimary: alias.is_primary === true })
    }
  }
  if (!aliases.length) throw new QqMailConnectorError('MCP_TOOL_FAILED', 'QQ Mail GetMe returned no usable aliases')
  const rateLimits = readRecord(data.rate_limits)
  const constraints = readRecord(data.constraints)
  return {
    scopes: readStringArray(data.scopes),
    aliases,
    rateLimits: {
      requestsPerMinute: readNonNegativeInteger(rateLimits?.requests_per_minute),
      requestsPerHour: readNonNegativeInteger(rateLimits?.requests_per_hour),
      dailySendQuota: readNonNegativeInteger(rateLimits?.daily_send_quota)
    },
    constraints: {
      maxAttachmentSizeBytes: readPositiveInteger(constraints?.max_attachment_size_bytes),
      maxTotalAttachmentsSizeBytes: readPositiveInteger(constraints?.max_total_attachments_size_bytes),
      maxAttachmentCount: readPositiveInteger(constraints?.max_attachment_count)
    }
  }
}

export function accountDto(account: QqMailAccount) {
  return {
    accounts: account.aliases.map((alias) => ({
      email: alias.email,
      name: alias.name,
      isPrimary: alias.isPrimary
    })),
    scopes: [...account.scopes],
    rateLimits: account.rateLimits,
    constraints: account.constraints
  }
}

export function mapMessagePage(payload: QqMailMcpPayload) {
  const data = unwrapData(payload)
  const messages = readRecordArray(data.messages).length ? readRecordArray(data.messages) : readRecordArray(data.items)
  return {
    items: messages.slice(0, 50).map(mapMessageSummary),
    nextCursor: readString(data.next_cursor) ?? readString(data.cursor),
    hasMore: readBoolean(data.has_more) ?? !!readString(data.next_cursor)
  }
}

export function mapMessage(payload: QqMailMcpPayload) {
  const data = unwrapData(payload)
  const message = readRecord(data.message) ?? data
  const bodyFormat = (readString(message.body_format) ?? readString(message.format) ?? 'PLAIN').toUpperCase()
  const rawBody =
    readString(message.body_text) ??
    readString(message.text) ??
    readString(message.body) ??
    readString(message.body_html) ??
    readString(message.html) ??
    ''
  const textBody =
    bodyFormat === 'HTML' || !!readString(message.body_html) || !!readString(message.html)
      ? htmlToPlainText(rawBody)
      : rawBody
  return {
    ...mapMessageSummary(message),
    to: mapRecipients(message.to),
    cc: mapRecipients(message.cc),
    bcc: mapRecipients(message.bcc),
    textBody: bounded(textBody, 50_000),
    contentTruncated: textBody.length > 50_000,
    untrustedContent: true,
    attachments: mapAttachmentRecords(message.attachments)
  }
}

export function mapAttachments(payload: QqMailMcpPayload) {
  const data = unwrapData(payload)
  const attachments = readRecordArray(data.attachments).length
    ? readRecordArray(data.attachments)
    : readRecordArray(data.items)
  return { items: mapAttachmentRecords(attachments) }
}

export function decodeAttachment(payload: QqMailMcpPayload): QqMailAttachmentContent {
  const data = unwrapData(payload)
  const attachment = readRecord(data.attachment) ?? data
  const encoded = readString(attachment.content) ?? readString(attachment.data)
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new QqMailConnectorError('ATTACHMENT_INTEGRITY_FAILED', 'QQ Mail returned invalid attachment content')
  }
  if (encoded.length > Math.ceil(QQ_MAIL_MAX_DOWNLOAD_ATTACHMENT_BYTES / 3) * 4 + 4) {
    throw new QqMailConnectorError(
      'ATTACHMENT_TOO_LARGE',
      `QQ Mail attachment exceeds the ${QQ_MAIL_MAX_DOWNLOAD_ATTACHMENT_BYTES}-byte download safety limit`
    )
  }
  const buffer = Buffer.from(encoded, 'base64')
  if (buffer.length > QQ_MAIL_MAX_DOWNLOAD_ATTACHMENT_BYTES) {
    throw new QqMailConnectorError(
      'ATTACHMENT_TOO_LARGE',
      `QQ Mail attachment exceeds the ${QQ_MAIL_MAX_DOWNLOAD_ATTACHMENT_BYTES}-byte download safety limit`
    )
  }
  const declaredSize = readNonNegativeInteger(attachment.size)
  if (declaredSize !== undefined && declaredSize !== buffer.length) {
    throw new QqMailConnectorError('ATTACHMENT_INTEGRITY_FAILED', 'QQ Mail attachment size verification failed')
  }
  const sha1 = readString(attachment.sha1)?.toLowerCase()
  if (sha1 && createHash('sha1').update(buffer).digest('hex') !== sha1) {
    throw new QqMailConnectorError('ATTACHMENT_INTEGRITY_FAILED', 'QQ Mail attachment SHA-1 verification failed')
  }
  return {
    attachmentId: requireMappedString(attachment.attachment_id ?? attachment.id, 'attachment ID'),
    fileName: safeFileName(readString(attachment.filename) ?? readString(attachment.name) ?? 'attachment'),
    mimeType: readString(attachment.content_type) ?? readString(attachment.mime_type) ?? 'application/octet-stream',
    size: buffer.length,
    sha1,
    buffer
  }
}

export function mapMutationReceipt(payload: QqMailMcpPayload, operation: 'send' | 'reply' | 'forward' | 'delete') {
  const data = unwrapData(payload)
  return {
    status: 'completed' as const,
    operation,
    messageId: readString(data.message_id) ?? readString(data.id),
    threadId: readString(data.thread_id),
    movedTo: operation === 'delete' ? readString(data.dir) ?? 'trash' : undefined
  }
}

export function extractToolFailure(payload: QqMailMcpPayload): QqMailMcpToolFailure {
  const error = readRecord(payload.error) ?? payload
  const rawCode = error.code
  const code = typeof rawCode === 'number' ? rawCode : typeof rawCode === 'string' ? Number(rawCode) : undefined
  return {
    code: Number.isFinite(code) ? code : undefined,
    message: bounded(readString(error.message) ?? 'QQ Mail MCP tool call failed', 500),
    details: readRecord(error.details)
  }
}

export function mapOperationSummary(value: unknown) {
  const summary = readRecord(value) ?? {}
  return {
    action: readString(summary.action) ?? readString(summary.operation),
    from: readString(summary.from),
    to: readAddressList(summary.to),
    cc: readAddressList(summary.cc),
    bcc: readAddressList(summary.bcc),
    subject: bounded(readString(summary.subject) ?? '', 998),
    messageId: readString(summary.message_id),
    attachmentCount: readNonNegativeInteger(summary.attachment_count) ?? 0
  }
}

export function unwrapData(payload: QqMailMcpPayload): Record<string, unknown> {
  return readRecord(payload.data) ?? payload
}

function mapMessageSummary(message: Record<string, unknown>) {
  return {
    messageId: requireMappedString(message.message_id ?? message.id, 'message ID'),
    subject: bounded(readString(message.subject) ?? '', 998),
    from: mapRecipient(message.from),
    receivedAt:
      readString(message.received_at) ??
      readString(message.sent_at) ??
      readString(message.date) ??
      readString(message.timestamp),
    preview: bounded(readString(message.preview) ?? readString(message.snippet) ?? '', 1000),
    isRead: readBoolean(message.is_read),
    hasAttachments: readBoolean(message.has_attachments) ?? (readNonNegativeInteger(message.attachment_count) ?? 0) > 0,
    attachmentCount: readNonNegativeInteger(message.attachment_count)
  }
}

function mapAttachmentRecords(value: unknown) {
  const records = Array.isArray(value) ? value.filter(isRecord) : []
  return records.slice(0, 100).map((attachment) => ({
    attachmentId: requireMappedString(attachment.attachment_id ?? attachment.id, 'attachment ID'),
    fileName: safeFileName(readString(attachment.filename) ?? readString(attachment.name) ?? 'attachment'),
    mimeType: readString(attachment.content_type) ?? readString(attachment.mime_type),
    size: readNonNegativeInteger(attachment.size),
    sha1: readString(attachment.sha1)?.toLowerCase()
  }))
}

function mapRecipients(value: unknown) {
  if (!Array.isArray(value)) return value == null ? [] : [mapRecipient(value)].filter(Boolean)
  return value
    .slice(0, 100)
    .map(mapRecipient)
    .filter((recipient): recipient is { email: string; name?: string } => !!recipient)
}

function mapRecipient(value: unknown): { email: string; name?: string } | undefined {
  if (typeof value === 'string') return value.trim() ? { email: bounded(value.trim(), 320) } : undefined
  const record = readRecord(value)
  if (!record) return undefined
  const email = readString(record.email) ?? readString(record.address)
  return email ? { email: bounded(email, 320), name: boundedOptional(readString(record.name), 200) } : undefined
}

function readAddressList(value: unknown) {
  return mapRecipients(value).map((recipient) => recipient.email)
}

function htmlToPlainText(value: string) {
  return convert(value.slice(0, 200_000), {
    wordwrap: false,
    selectors: [
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'img', format: 'skip' }
    ]
  }).trim()
}

function safeFileName(value: string) {
  const normalized = value
    .replace(/[\\/\0]/g, '_')
    .replace(/^\.+$/, '_')
    .trim()
  return bounded(normalized || 'attachment', 240)
}

function requireMappedString(value: unknown, field: string) {
  const result = readString(value)
  if (!result) throw new QqMailConnectorError('MCP_TOOL_FAILED', `QQ Mail response is missing ${field}`)
  return bounded(result, 512)
}

function bounded(value: string, limit: number) {
  return value.length > limit ? value.slice(0, limit) : value
}

function boundedOptional(value: string | undefined, limit: number) {
  return value ? bounded(value, limit) : undefined
}

function readRecord(value: unknown) {
  return isRecord(value) ? value : undefined
}

function readRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(readString).filter((item): item is string => !!item))].slice(0, 50)
    : []
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function readPositiveInteger(value: unknown) {
  const number = toNumber(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function readNonNegativeInteger(value: unknown) {
  const number = toNumber(value)
  return Number.isInteger(number) && number >= 0 ? number : undefined
}

function toNumber(value: unknown) {
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
