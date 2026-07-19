const CANVAS_REFRESH_TOOL_NAMES = new Set([
  'canvas_create_document',
  'canvas_save_snapshot',
  'canvas_patch_records',
  'canvas_insert_image',
  'canvas_update_document_status',
  'canvas_report_failure'
])

const CANVAS_READ_ONLY_TOOL_NAMES = new Set(['canvas_search_documents', 'canvas_get_document', 'canvas_list_records', 'canvas_get_record'])

export type CanvasToolEventIgnoredReason = 'missing_tool_name' | 'non_canvas_tool' | 'read_only_canvas_tool' | 'unsupported_canvas_tool'

export interface CanvasToolRefreshEvent {
  toolName: string
  documentId?: string
}

export type CanvasToolEventNormalization = CanvasToolEventMatchedNormalization | CanvasToolEventIgnoredNormalization

export interface CanvasToolEventMatchedNormalization {
  matched: true
  toolName: string
  documentId?: string
  source?: string
  candidateCount: number
  matchedPath: string
}

export interface CanvasToolEventIgnoredNormalization {
  matched: false
  toolName?: string
  documentId?: string
  source?: string
  candidateCount: number
  matchedPath?: string
  ignoredReason: CanvasToolEventIgnoredReason
}

type CanvasToolEventCandidate =
  | CanvasToolEventObject
  | CanvasToolEventCandidate[]
  | ArrayBuffer
  | string
  | number
  | boolean
  | null
  | undefined

interface CanvasToolEventObject {
  [key: string]: CanvasToolEventCandidate
}

interface ExpandedCandidate {
  value: CanvasToolEventCandidate
  path: string
}

interface StringMatch {
  value: string
  path: string
}

const TOOL_NAME_KEYS = ['toolName', 'tool_name', 'tool', 'name', 'toolCallName', 'tool_call_name']
const DOCUMENT_ID_KEYS = ['documentId', 'document_id', 'canvasDocumentId', 'canvas_document_id']
const NESTED_EVENT_KEYS = [
  'payload',
  'data',
  'event',
  'detail',
  'result',
  'output',
  'response',
  'content',
  'argsPreview',
  'input',
  'args',
  'arguments',
  'target',
  'document',
  'item',
  'currentVersion',
  'version',
  'log',
  'tool',
  'function',
  'toolCall',
  'tool_call'
]

export function normalizeCanvasToolEvent(event: CanvasToolEventCandidate): CanvasToolEventNormalization {
  const candidates = expandHostEventCandidates(event)
  const toolName = extractToolName(candidates)
  const source = extractSource(candidates)
  const documentId = extractCanvasDocumentId(candidates)

  if (!toolName) {
    return {
      matched: false,
      source,
      documentId,
      candidateCount: candidates.length,
      ignoredReason: 'missing_tool_name'
    }
  }

  if (CANVAS_READ_ONLY_TOOL_NAMES.has(toolName.value)) {
    return {
      matched: false,
      toolName: toolName.value,
      documentId,
      source,
      candidateCount: candidates.length,
      matchedPath: toolName.path,
      ignoredReason: 'read_only_canvas_tool'
    }
  }

  if (!toolName.value.startsWith('canvas_')) {
    return {
      matched: false,
      toolName: toolName.value,
      documentId,
      source,
      candidateCount: candidates.length,
      matchedPath: toolName.path,
      ignoredReason: 'non_canvas_tool'
    }
  }

  if (!CANVAS_REFRESH_TOOL_NAMES.has(toolName.value)) {
    return {
      matched: false,
      toolName: toolName.value,
      documentId,
      source,
      candidateCount: candidates.length,
      matchedPath: toolName.path,
      ignoredReason: 'unsupported_canvas_tool'
    }
  }

  return {
    matched: true,
    toolName: toolName.value,
    documentId,
    source,
    candidateCount: candidates.length,
    matchedPath: toolName.path
  }
}

export function getCanvasToolRefreshEvent(event: CanvasToolEventCandidate): CanvasToolRefreshEvent | null {
  const normalized = normalizeCanvasToolEvent(event)
  if (!normalized.matched) {
    return null
  }
  return {
    toolName: normalized.toolName,
    documentId: normalized.documentId
  }
}

export function shouldRefreshForCanvasToolEvent(event: CanvasToolEventCandidate) {
  return normalizeCanvasToolEvent(event).matched
}

function extractToolName(candidates: ExpandedCandidate[]) {
  for (const candidate of candidates) {
    const textToolName = readStringCandidate(candidate, ['toolName', 'tool_name', 'name'])
    if (textToolName && isToolNameLike(textToolName.value)) {
      return textToolName
    }

    if (!isToolEventObject(candidate.value)) {
      continue
    }

    for (const key of TOOL_NAME_KEYS) {
      const value = readString(candidate.value, key, `${candidate.path}.${key}`)
      if (value && isToolNameLike(value.value)) {
        return value
      }
    }

    const tool = readNestedToolName(candidate.value.tool, `${candidate.path}.tool`)
    if (tool && isToolNameLike(tool.value)) {
      return tool
    }

    const fn = readNestedToolName(candidate.value.function, `${candidate.path}.function`)
    if (fn && isToolNameLike(fn.value)) {
      return fn
    }

    const toolCall = readToolCallName(candidate.value.toolCall, `${candidate.path}.toolCall`) ?? readToolCallName(candidate.value.tool_call, `${candidate.path}.tool_call`)
    if (toolCall && isToolNameLike(toolCall.value)) {
      return toolCall
    }
  }
  return null
}

function extractCanvasDocumentId(candidates: ExpandedCandidate[]) {
  for (const candidate of candidates) {
    const textDocumentId = readStringCandidate(candidate, DOCUMENT_ID_KEYS)
    if (textDocumentId) {
      return textDocumentId.value
    }

    if (!isToolEventObject(candidate.value)) {
      continue
    }

    const direct = readFirstString(candidate.value, DOCUMENT_ID_KEYS, candidate.path)
    if (direct) {
      return direct.value
    }

    const itemId = readNestedId(candidate.value.item, `${candidate.path}.item`)
    if (itemId) {
      return itemId.value
    }

    const documentId = readDocumentLikeId(candidate.value.document, `${candidate.path}.document`)
    if (documentId) {
      return documentId.value
    }

    const targetDocumentId = readDocumentLikeId(candidate.value.target, `${candidate.path}.target`)
    if (targetDocumentId) {
      return targetDocumentId.value
    }

    const currentVersionDocumentId = readFirstString(candidate.value.currentVersion, DOCUMENT_ID_KEYS, `${candidate.path}.currentVersion`)
    if (currentVersionDocumentId) {
      return currentVersionDocumentId.value
    }

    const versionDocumentId = readFirstString(candidate.value.version, DOCUMENT_ID_KEYS, `${candidate.path}.version`)
    if (versionDocumentId) {
      return versionDocumentId.value
    }

    const logDocumentId = readFirstString(candidate.value.log, DOCUMENT_ID_KEYS, `${candidate.path}.log`)
    if (logDocumentId) {
      return logDocumentId.value
    }
  }
  return undefined
}

function extractSource(candidates: ExpandedCandidate[]) {
  for (const candidate of candidates) {
    if (!isToolEventObject(candidate.value)) {
      continue
    }
    const source = readString(candidate.value, 'source', `${candidate.path}.source`)
    if (source) {
      return source.value
    }
  }
  return undefined
}

function expandHostEventCandidates(event: CanvasToolEventCandidate) {
  const candidates: ExpandedCandidate[] = []
  const queue: ExpandedCandidate[] = [{ value: event, path: '$' }]
  const seen = new Set<CanvasToolEventObject>()

  while (queue.length && candidates.length < 120) {
    const candidate = queue.shift()
    if (!candidate || candidate.value === undefined || candidate.value === null) {
      continue
    }
    candidates.push(candidate)

    if (typeof candidate.value === 'string') {
      const parsed = parseJsonCandidate(candidate.value)
      if (parsed !== null) {
        queue.push({ value: parsed, path: `${candidate.path}<json>` })
      }
      continue
    }

    if (Array.isArray(candidate.value)) {
      candidate.value.forEach((value, index) => queue.push({ value, path: `${candidate.path}[${index}]` }))
      continue
    }

    if (!isToolEventObject(candidate.value) || seen.has(candidate.value)) {
      continue
    }

    seen.add(candidate.value)
    for (const key of NESTED_EVENT_KEYS) {
      const nested = candidate.value[key]
      if (nested !== undefined) {
        queue.push({ value: nested, path: `${candidate.path}.${key}` })
      }
    }
  }

  return candidates
}

function parseJsonCandidate(text: string): CanvasToolEventCandidate | null {
  const trimmed = text.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null
  }
  try {
    const parsed: CanvasToolEventCandidate = JSON.parse(trimmed)
    return parsed
  } catch {
    return null
  }
}

function readStringCandidate(candidate: ExpandedCandidate, keys: string[]) {
  if (typeof candidate.value !== 'string') {
    return null
  }
  for (const key of keys) {
    const value = readJsonStringField(candidate.value, key)
    if (value) {
      return {
        value,
        path: `${candidate.path}#${key}`
      }
    }
  }
  return null
}

function readNestedToolName(value: CanvasToolEventCandidate, path: string) {
  if (!isToolEventObject(value)) {
    return null
  }
  return readString(value, 'name', `${path}.name`) ?? readString(value, 'toolName', `${path}.toolName`) ?? readString(value, 'tool_name', `${path}.tool_name`)
}

function readToolCallName(value: CanvasToolEventCandidate, path: string) {
  if (!isToolEventObject(value)) {
    return null
  }
  return (
    readString(value, 'name', `${path}.name`) ??
    readString(value, 'toolName', `${path}.toolName`) ??
    readString(value, 'tool_name', `${path}.tool_name`) ??
    readString(value.function, 'name', `${path}.function.name`)
  )
}

function readString(object: CanvasToolEventCandidate, key: string, path: string): StringMatch | null {
  if (!isToolEventObject(object)) {
    return null
  }
  const value = object[key]
  return typeof value === 'string' && value.trim() ? { value: value.trim(), path } : null
}

function readFirstString(object: CanvasToolEventCandidate, keys: string[], path: string) {
  for (const key of keys) {
    const value = readString(object, key, `${path}.${key}`)
    if (value) {
      return value
    }
  }
  return null
}

function readDocumentLikeId(value: CanvasToolEventCandidate, path: string) {
  const direct = readFirstString(value, DOCUMENT_ID_KEYS, path)
  if (direct) {
    return direct
  }
  return readNestedId(value, path)
}

function readNestedId(value: CanvasToolEventCandidate, path: string): StringMatch | null {
  if (!isToolEventObject(value)) {
    return null
  }
  const id = readString(value, 'id', `${path}.id`)
  if (id) {
    return id
  }
  return readNestedId(value.item, `${path}.item`)
}

function readJsonStringField(text: string, field: string) {
  const pattern = new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`)
  const match = pattern.exec(text)
  if (!match?.[1]) {
    return null
  }
  return unescapeJsonString(match[1])
}

function isToolNameLike(value: string) {
  return value.includes('_') || value.startsWith('canvas')
}

function unescapeJsonString(value: string) {
  try {
    const parsed: string = JSON.parse(`"${value}"`)
    return parsed.trim() ? parsed.trim() : null
  } catch {
    return value.trim() ? value.trim() : null
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isToolEventObject(event: CanvasToolEventCandidate): event is CanvasToolEventObject {
  return Boolean(event && typeof event === 'object' && !Array.isArray(event) && !(event instanceof ArrayBuffer))
}
