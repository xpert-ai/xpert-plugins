import type { JsonObject, JsonValue } from './types'

const MUTATION_TOOL_NAMES = new Set([
  'presentation_create_deck',
  'presentation_prepare_theme',
  'presentation_update_theme_progress',
  'presentation_register_theme',
  'presentation_report_theme_failure',
  'presentation_add_slide',
  'presentation_patch_slide',
  'presentation_reorder_slides',
  'presentation_add_asset',
  'presentation_finalize_deck',
  'presentation_request_export',
  'presentation_update_status'
])

const TOOL_NAME_KEYS = ['toolName', 'tool_name', 'toolCallName', 'tool_call_name']
const DECK_ID_KEYS = ['deckId', 'deck_id', 'presentationStudioDeckId']
const SLIDE_ID_KEYS = ['slideId', 'slide_id', 'presentationStudioSlideId']
const NESTED_KEYS = [
  'event',
  'payload',
  'data',
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
  'item',
  'tool',
  'function',
  'toolCall',
  'tool_call'
]

export interface PresentationToolRefreshEvent {
  toolName: string
  deckId?: string
  slideId?: string
  eventKey?: string
}

interface Candidate {
  value: JsonValue | undefined
  path: string
}

/** Normalizes the host and ChatKit tool-event wrappers used by Remote Components. */
export function normalizePresentationToolEvent(value: JsonValue): PresentationToolRefreshEvent | null {
  const candidates = expandCandidates(value)
  const toolName = findToolName(candidates)
  if (!toolName || !MUTATION_TOOL_NAMES.has(toolName)) return null

  return {
    toolName,
    deckId: findIdentifier(candidates, DECK_ID_KEYS),
    slideId: findIdentifier(candidates, SLIDE_ID_KEYS),
    eventKey: findEventKey(candidates)
  }
}

function expandCandidates(value: JsonValue): Candidate[] {
  const output: Candidate[] = []
  const seen = new Set<JsonObject>()

  function visit(current: JsonValue | undefined, path: string, depth: number) {
    if (current === undefined || depth > 8) return
    output.push({ value: current, path })

    if (typeof current === 'string') {
      const parsed = parseJson(current)
      if (parsed !== undefined) visit(parsed, `${path}#json`, depth + 1)
      return
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1))
      return
    }
    if (!isObject(current) || seen.has(current)) return
    seen.add(current)
    for (const key of NESTED_KEYS) {
      if (current[key] !== undefined) visit(current[key], `${path}.${key}`, depth + 1)
    }
  }

  visit(value, '$', 0)
  return output
}

function findToolName(candidates: Candidate[]) {
  for (const candidate of candidates) {
    if (typeof candidate.value === 'string' && isToolName(candidate.value)) return candidate.value.trim()
    if (!isObject(candidate.value)) continue

    for (const key of TOOL_NAME_KEYS) {
      const value = candidate.value[key]
      if (typeof value === 'string' && isToolName(value)) return value.trim()
    }
    for (const key of ['name', 'tool']) {
      const value = candidate.value[key]
      if (typeof value === 'string' && isToolName(value)) return value.trim()
    }
  }
  return undefined
}

function findIdentifier(candidates: Candidate[], keys: string[]) {
  for (const candidate of candidates) {
    if (isObject(candidate.value)) {
      for (const key of keys) {
        const value = candidate.value[key]
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
    }
    if (typeof candidate.value === 'string') {
      const extracted = extractJsonStringField(candidate.value, keys)
      if (extracted) return extracted
    }
  }
  return undefined
}

function findEventKey(candidates: Candidate[]) {
  for (const candidate of candidates) {
    if (!isObject(candidate.value)) continue
    for (const key of ['id', 'toolCallId', 'tool_call_id', 'runId']) {
      const value = candidate.value[key]
      if (typeof value === 'string' && value.trim()) return `${key}:${value.trim()}`
    }
  }
  return undefined
}

function extractJsonStringField(value: string, keys: string[]) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = value.match(new RegExp(`["']${escaped}["']\\s*:\\s*["']([^"']+)["']`))
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

function parseJson(value: string): JsonValue | undefined {
  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return undefined
  try {
    return JSON.parse(trimmed) as JsonValue
  } catch {
    return undefined
  }
}

function isToolName(value: string) {
  return value.trim().startsWith('presentation_')
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
