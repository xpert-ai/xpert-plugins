/**
 * Conversation ingestion — the format adapter layer.
 *
 * In production the conversations come from where they already live: a WeCom conversation-archive
 * API, a CRM export, a call-transcription service. A salesperson pasting one conversation at a
 * time into a form is not an input path, it is the absence of one, and it caps the whole workbench
 * at whatever a person is willing to retype.
 *
 * This module is the seam that makes the source swappable. It takes bytes from *some* source and
 * produces `ConversationImportRow[]`; nothing downstream knows or cares where they came from. The
 * two adapters here — a JSON payload shaped like an API response, and a CSV/spreadsheet export —
 * are the two shapes available without credentials to a real system. A WeCom connector would be a
 * third function in this file returning the same rows.
 *
 * Parsing lives on the server, not in the iframe, for the same reason: that is where a real
 * connector would live. The browser only reads the file into a string.
 */
import type { ConversationImportFormat, ConversationImportRow, ConversationImportSkip } from './types'

export interface ConversationImportParseResult {
  rows: ConversationImportRow[]
  /** Entries the parser could see but could not map onto a conversation. */
  skipped: ConversationImportSkip[]
}

/**
 * Field aliases.
 *
 * A real export never uses the names you would have chosen. Rather than force the user to rename
 * columns before importing — which is exactly the manual step this feature exists to remove — each
 * logical field accepts the handful of names these exports actually use, in both languages. The
 * canonical name is listed first and is what the README documents.
 */
const CUSTOMER_KEYS = ['customername', 'customer', 'client', 'account', '客户名称', '客户', '客户名']
const CONVERSATION_KEYS = ['conversation', 'content', 'text', 'transcript', 'body', '沟通记录', '会话内容', '内容']
const MESSAGES_KEYS = ['messages', 'records', 'dialogue', 'turns', '消息', '消息列表']
const EXTERNAL_ID_KEYS = ['externalid', 'id', 'msgid', 'sessionid', 'conversationid', '会话id', '记录id']
/**
 * The customer's own id, as opposed to `EXTERNAL_ID_KEYS` above which identifies the *conversation*.
 * Distinct column so a same-named customer pair from the source system is not merged — see
 * `customer-identity.ts`.
 */
const CUSTOMER_ID_KEYS = ['customerid', 'custid', 'accountid', '客户id', '客户编号', '客户编码']
const OCCURRED_AT_KEYS = ['occurredat', 'time', 'timestamp', 'date', 'datetime', '沟通时间', '时间', '日期']

/** Where the rows live when the payload is an envelope rather than a bare array. */
const ENVELOPE_KEYS = ['records', 'data', 'items', 'list', 'conversations', 'rows']

/** Speaker and text keys inside one message of a `messages` array. */
const SPEAKER_KEYS = ['speaker', 'role', 'sender', 'from', 'name', '发言人', '角色', '说话人']
const MESSAGE_TEXT_KEYS = ['text', 'content', 'message', 'body', '内容', '消息']

export function detectImportFormat(fileName: string | undefined): ConversationImportFormat | undefined {
  const name = (fileName ?? '').trim().toLowerCase()
  if (name.endsWith('.json')) {
    return 'json'
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return 'csv'
  }
  return undefined
}

export function parseConversations(content: string, format: ConversationImportFormat): ConversationImportParseResult {
  const text = stripBom(content ?? '')
  if (!text.trim()) {
    throw new Error('导入文件是空的')
  }
  return format === 'json' ? parseJsonConversations(text) : parseCsvConversations(text)
}

// --------------------------------------------------------------------------- json

/**
 * The JSON adapter. Accepts a bare array or an envelope, because an API returns the latter and a
 * hand-written fixture is usually the former, and rejecting either would just make the user edit
 * the file by hand.
 */
function parseJsonConversations(text: string): ConversationImportParseResult {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch (error) {
    throw new Error(`JSON 解析失败：${(error as Error).message}`)
  }

  const list = toRecordList(payload)
  if (!list) {
    throw new Error(
      `JSON 结构无法识别：需要一个数组，或一个包含 ${ENVELOPE_KEYS.join(' / ')} 字段的对象。`
    )
  }

  const rows: ConversationImportRow[] = []
  const skipped: ConversationImportSkip[] = []

  list.forEach((entry, index) => {
    const row = index + 1
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      skipped.push({ row, reason: '不是一个对象' })
      return
    }
    const item = entry as Record<string, unknown>
    const customerName = pickString(item, CUSTOMER_KEYS)
    const conversation = pickString(item, CONVERSATION_KEYS) ?? joinMessages(pickValue(item, MESSAGES_KEYS))

    if (!customerName && !conversation) {
      skipped.push({ row, reason: `没有识别出客户名称和沟通内容（字段：${Object.keys(item).join(', ')}）` })
      return
    }
    rows.push({
      customerName,
      conversation,
      externalId: pickString(item, EXTERNAL_ID_KEYS),
      customerExternalId: pickString(item, CUSTOMER_ID_KEYS),
      occurredAt: parseDate(pickValue(item, OCCURRED_AT_KEYS))
    })
  })

  return { rows, skipped }
}

function toRecordList(payload: unknown): unknown[] | undefined {
  if (Array.isArray(payload)) {
    return payload
  }
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const envelope = payload as Record<string, unknown>
  for (const key of Object.keys(envelope)) {
    if (ENVELOPE_KEYS.includes(key.toLowerCase()) && Array.isArray(envelope[key])) {
      return envelope[key] as unknown[]
    }
  }
  return undefined
}

/**
 * Flatten a message array into the same plain transcript a salesperson would have pasted.
 *
 * The rest of the app treats a conversation as text on purpose — the model reads it, the reviewer
 * reads it, and `evidence` quotes have to be findable in it. Keeping a structured message list
 * alongside would mean two representations that can disagree.
 */
function joinMessages(value: unknown): string | undefined {
  if (!Array.isArray(value) || !value.length) {
    return undefined
  }
  const lines = value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim()
      }
      if (!entry || typeof entry !== 'object') {
        return ''
      }
      const message = entry as Record<string, unknown>
      const speaker = pickString(message, SPEAKER_KEYS)
      const body = pickString(message, MESSAGE_TEXT_KEYS)
      if (!body) {
        return ''
      }
      return speaker ? `${speaker}：${body}` : body
    })
    .filter(Boolean)
  return lines.length ? lines.join('\n') : undefined
}

// ---------------------------------------------------------------------------- csv

/**
 * The CSV adapter, for the spreadsheet an operations colleague exports.
 *
 * Written out rather than pulled from a library because the one thing that actually matters here —
 * a conversation containing commas, quotes and line breaks inside a single cell — is precisely
 * what a naive `split(',')` gets wrong, and it is about thirty lines to get right.
 *
 * `.tsv` is handled by sniffing the delimiter from the header, so a tab-separated export does not
 * need a separate adapter.
 */
function parseCsvConversations(text: string): ConversationImportParseResult {
  const delimiter = sniffDelimiter(text)
  const table = parseDelimited(text, delimiter)
  if (!table.length) {
    throw new Error('CSV 里没有任何内容')
  }

  const header = table[0].map((cell) => cell.trim().toLowerCase())
  const customerIndex = findColumn(header, CUSTOMER_KEYS)
  const conversationIndex = findColumn(header, CONVERSATION_KEYS)
  if (customerIndex < 0 || conversationIndex < 0) {
    throw new Error(
      `CSV 需要客户名称与沟通内容两列，未找到。当前表头：${table[0].join(' | ')}。` +
        `客户列可用 ${CUSTOMER_KEYS.slice(0, 3).join(' / ')}，内容列可用 ${CONVERSATION_KEYS.slice(0, 3).join(' / ')}。`
    )
  }
  const externalIdIndex = findColumn(header, EXTERNAL_ID_KEYS)
  const customerIdIndex = findColumn(header, CUSTOMER_ID_KEYS)
  const occurredAtIndex = findColumn(header, OCCURRED_AT_KEYS)

  const rows: ConversationImportRow[] = []
  const skipped: ConversationImportSkip[] = []

  table.slice(1).forEach((cells, index) => {
    const row = index + 1
    // A trailing newline produces one empty tuple; that is not a user error worth reporting.
    if (cells.every((cell) => !cell.trim())) {
      return
    }
    const customerName = trimToUndefined(cells[customerIndex])
    const conversation = trimToUndefined(cells[conversationIndex])
    if (!customerName && !conversation) {
      skipped.push({ row, reason: '客户名称与沟通内容都是空的' })
      return
    }
    rows.push({
      customerName,
      conversation,
      externalId: externalIdIndex >= 0 ? trimToUndefined(cells[externalIdIndex]) : undefined,
      customerExternalId: customerIdIndex >= 0 ? trimToUndefined(cells[customerIdIndex]) : undefined,
      occurredAt: occurredAtIndex >= 0 ? parseDate(cells[occurredAtIndex]) : undefined
    })
  })

  return { rows, skipped }
}

/** Compare the header's first line only — a tab inside a quoted conversation must not win. */
function sniffDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  return (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ','
}

/** RFC4180-style scan: quoted fields may contain the delimiter, newlines and doubled quotes. */
function parseDelimited(text: string, delimiter: string) {
  const table: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      table.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  // Whatever is still buffered is the last row; an unterminated quote is tolerated rather than
  // throwing away every row that parsed cleanly before it.
  if (field || row.length) {
    row.push(field)
    table.push(row)
  }
  return table
}

function findColumn(header: string[], keys: string[]) {
  return header.findIndex((cell) => keys.includes(cell))
}

// ------------------------------------------------------------------------- shared

function pickValue(item: Record<string, unknown>, keys: string[]) {
  for (const key of Object.keys(item)) {
    if (keys.includes(key.toLowerCase())) {
      return item[key]
    }
  }
  return undefined
}

function pickString(item: Record<string, unknown>, keys: string[]) {
  const value = pickValue(item, keys)
  if (typeof value === 'string') {
    return trimToUndefined(value)
  }
  return typeof value === 'number' ? String(value) : undefined
}

/**
 * Accepts the formats exports actually carry: ISO strings, epoch seconds and epoch milliseconds.
 * An unparseable value yields `undefined` rather than an error — a bad timestamp is not a reason
 * to drop a conversation, it only means the record falls back to its import time.
 */
function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Ten-digit values are seconds; anything longer is already milliseconds.
    return new Date(value < 1e11 ? value * 1000 : value)
  }
  const text = trimToUndefined(typeof value === 'string' ? value : undefined)
  if (!text) {
    return undefined
  }
  if (/^\d+$/.test(text)) {
    return parseDate(Number(text))
  }
  // `2026-09-16 14:30` is what spreadsheets write; Safari and some engines want the `T`.
  const parsed = new Date(text.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function trimToUndefined(value: string | undefined | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
