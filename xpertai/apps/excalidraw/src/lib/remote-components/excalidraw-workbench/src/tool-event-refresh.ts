export const CREATE_DRAWING_TOOL_NAME = 'excalidraw_create_drawing'
export const ADD_ELEMENTS_TOOL_NAME = 'excalidraw_add_elements'
export const SAVE_SCENE_VERSION_TOOL_NAME = 'excalidraw_save_scene_version'
export const PATCH_SCENE_TOOL_NAME = 'excalidraw_patch_scene'
export const SAVE_MERMAID_DRAFT_TOOL_NAME = 'excalidraw_save_mermaid_draft'
export const SEARCH_DRAWINGS_TOOL_NAME = 'excalidraw_search_drawings'
export const GET_DRAWING_TOOL_NAME = 'excalidraw_get_drawing'
export const UPDATE_DRAWING_STATUS_TOOL_NAME = 'excalidraw_update_drawing_status'
export const REPORT_FAILURE_TOOL_NAME = 'excalidraw_report_failure'

export const EXCALIDRAW_TOOL_NAMES = new Set([
  CREATE_DRAWING_TOOL_NAME,
  ADD_ELEMENTS_TOOL_NAME,
  SAVE_SCENE_VERSION_TOOL_NAME,
  PATCH_SCENE_TOOL_NAME,
  SAVE_MERMAID_DRAFT_TOOL_NAME,
  SEARCH_DRAWINGS_TOOL_NAME,
  GET_DRAWING_TOOL_NAME,
  UPDATE_DRAWING_STATUS_TOOL_NAME,
  REPORT_FAILURE_TOOL_NAME
])

export const EXCALIDRAW_MUTATION_TOOL_NAMES = new Set([
  CREATE_DRAWING_TOOL_NAME,
  ADD_ELEMENTS_TOOL_NAME,
  SAVE_SCENE_VERSION_TOOL_NAME,
  PATCH_SCENE_TOOL_NAME,
  SAVE_MERMAID_DRAFT_TOOL_NAME,
  UPDATE_DRAWING_STATUS_TOOL_NAME,
  REPORT_FAILURE_TOOL_NAME
])

export interface NormalizedToolCompletedEvent {
  toolName: string
  drawingId?: string
  versionId?: string
  versionNumber?: number
  isMutation: boolean
  isCreateDrawing: boolean
  isMermaidDraft: boolean
}

export interface ToolEventRefreshDecision {
  shouldReloadList: boolean
  shouldSelectDrawing: boolean
  shouldNotify: boolean
  shouldQueueMermaidPreview: boolean
  shouldProtectDirtyScene: boolean
  shouldLoadProtectedDetail: boolean
  targetDrawingId?: string
}

export function normalizeToolCompletedEvent(event: unknown): NormalizedToolCompletedEvent | null {
  const toolName = extractToolNameFromHostEvent(event)
  if (!toolName || !EXCALIDRAW_TOOL_NAMES.has(toolName)) {
    return null
  }

  return {
    toolName,
    drawingId: extractDrawingIdFromHostEvent(event),
    versionId: extractVersionIdFromHostEvent(event),
    versionNumber: extractVersionNumberFromHostEvent(event),
    isMutation: EXCALIDRAW_MUTATION_TOOL_NAMES.has(toolName),
    isCreateDrawing: toolName === CREATE_DRAWING_TOOL_NAME,
    isMermaidDraft: toolName === SAVE_MERMAID_DRAFT_TOOL_NAME
  }
}

export function decideToolEventRefresh(
  event: NormalizedToolCompletedEvent | null,
  options: { selectedDrawingId?: string | null; isDirty?: boolean; canReplaceDirtyScene?: boolean } = {}
): ToolEventRefreshDecision {
  if (!event?.isMutation) {
    return {
      shouldReloadList: false,
      shouldSelectDrawing: false,
      shouldNotify: false,
      shouldQueueMermaidPreview: false,
      shouldProtectDirtyScene: false,
      shouldLoadProtectedDetail: false
    }
  }

  const selectedDrawingId = cleanString(options.selectedDrawingId)
  // Do not guess a drawing target from the current selection or list order; missing ids only refresh metadata.
  const targetDrawingId = event.drawingId
  const shouldProtectDirtyScene = Boolean(options.isDirty && !options.canReplaceDirtyScene && selectedDrawingId && targetDrawingId)
  return {
    shouldReloadList: true,
    shouldSelectDrawing: Boolean(targetDrawingId && !shouldProtectDirtyScene),
    shouldNotify: true,
    shouldQueueMermaidPreview: event.isMermaidDraft && Boolean(targetDrawingId && !shouldProtectDirtyScene),
    shouldProtectDirtyScene,
    shouldLoadProtectedDetail: shouldProtectDirtyScene && targetDrawingId === selectedDrawingId,
    targetDrawingId: targetDrawingId || undefined
  }
}

function extractToolNameFromHostEvent(event: unknown) {
  for (const candidate of expandHostEventCandidates(event)) {
    if (!isObject(candidate)) {
      continue
    }

    const direct = readString(candidate, 'toolName') ?? readString(candidate, 'tool_name') ?? readString(candidate, 'name')
    if (direct && EXCALIDRAW_TOOL_NAMES.has(direct)) {
      return direct
    }

    const tool = candidate.tool
    if (isObject(tool)) {
      const toolName = readString(tool, 'name') ?? readString(tool, 'toolName') ?? readString(tool, 'tool_name')
      if (toolName && EXCALIDRAW_TOOL_NAMES.has(toolName)) {
        return toolName
      }
    }

    const fn = candidate.function
    if (isObject(fn)) {
      const toolName = readString(fn, 'name') ?? readString(fn, 'toolName') ?? readString(fn, 'tool_name')
      if (toolName && EXCALIDRAW_TOOL_NAMES.has(toolName)) {
        return toolName
      }
    }

    const toolCall = candidate.toolCall ?? candidate.tool_call
    if (isObject(toolCall)) {
      const toolName =
        readString(toolCall, 'name') ??
        readString(toolCall, 'toolName') ??
        readString(toolCall, 'tool_name') ??
        (isObject(toolCall.function) ? readString(toolCall.function, 'name') : null)
      if (toolName && EXCALIDRAW_TOOL_NAMES.has(toolName)) {
        return toolName
      }
    }
  }
  return null
}

function extractDrawingIdFromHostEvent(event: unknown) {
  for (const candidate of expandHostEventCandidates(event)) {
    if (typeof candidate === 'string') {
      // ChatKit argsPreview may be truncated, so pull explicit fields even when full JSON parsing fails.
      const textDrawingId = readJsonStringField(candidate, 'drawingId') ?? readJsonStringField(candidate, 'drawing_id')
      if (textDrawingId) {
        return textDrawingId
      }
    }
    if (!isObject(candidate)) {
      continue
    }

    const direct = readString(candidate, 'drawingId') ?? readString(candidate, 'drawing_id')
    if (direct) {
      return direct
    }

    if (isObject(candidate.item)) {
      const itemId = readString(candidate.item, 'id')
      if (itemId) {
        return itemId
      }
    }

    if (isObject(candidate.drawing)) {
      const drawingId =
        readString(candidate.drawing, 'drawingId') ??
        readString(candidate.drawing, 'drawing_id') ??
        readString(candidate.drawing, 'id') ??
        (isObject(candidate.drawing.item) ? readString(candidate.drawing.item, 'id') : null)
      if (drawingId) {
        return drawingId
      }
    }

    const versionDrawingId = readDrawingIdFromVersionLike(candidate.currentVersion) ?? readDrawingIdFromVersionLike(candidate.version)
    if (versionDrawingId) {
      return versionDrawingId
    }

    if (isObject(candidate.log)) {
      const drawingId = readString(candidate.log, 'drawingId') ?? readString(candidate.log, 'drawing_id')
      if (drawingId) {
        return drawingId
      }
    }
  }
  return undefined
}

function extractVersionIdFromHostEvent(event: unknown) {
  for (const candidate of expandHostEventCandidates(event)) {
    if (typeof candidate === 'string') {
      const textVersionId = readJsonStringField(candidate, 'versionId') ?? readJsonStringField(candidate, 'version_id')
      if (textVersionId) {
        return textVersionId
      }
    }
    if (!isObject(candidate)) {
      continue
    }

    const direct = readString(candidate, 'versionId') ?? readString(candidate, 'version_id')
    if (direct) {
      return direct
    }

    const versionId = readVersionIdFromVersionLike(candidate.currentVersion) ?? readVersionIdFromVersionLike(candidate.version)
    if (versionId) {
      return versionId
    }

    if (isObject(candidate.item)) {
      const itemVersionId = readString(candidate.item, 'currentVersionId') ?? readString(candidate.item, 'current_version_id')
      if (itemVersionId) {
        return itemVersionId
      }
    }

    if (isObject(candidate.log)) {
      const logVersionId = readString(candidate.log, 'versionId') ?? readString(candidate.log, 'version_id')
      if (logVersionId) {
        return logVersionId
      }
    }
  }
  return undefined
}

function extractVersionNumberFromHostEvent(event: unknown) {
  for (const candidate of expandHostEventCandidates(event)) {
    if (!isObject(candidate)) {
      continue
    }

    const direct = readNumber(candidate, 'versionNumber') ?? readNumber(candidate, 'version_number')
    if (direct !== undefined) {
      return direct
    }

    const versionNumber =
      readVersionNumberFromVersionLike(candidate.currentVersion) ?? readVersionNumberFromVersionLike(candidate.version)
    if (versionNumber !== undefined) {
      return versionNumber
    }

    if (isObject(candidate.item)) {
      const itemVersionNumber =
        readNumber(candidate.item, 'currentVersionNumber') ?? readNumber(candidate.item, 'current_version_number')
      if (itemVersionNumber !== undefined) {
        return itemVersionNumber
      }
    }
  }
  return undefined
}

function readDrawingIdFromVersionLike(value: unknown) {
  return isObject(value) ? readString(value, 'drawingId') ?? readString(value, 'drawing_id') : null
}

function readVersionIdFromVersionLike(value: unknown) {
  return isObject(value) ? readString(value, 'id') ?? readString(value, 'versionId') ?? readString(value, 'version_id') : null
}

function readVersionNumberFromVersionLike(value: unknown) {
  return isObject(value) ? readNumber(value, 'versionNumber') ?? readNumber(value, 'version_number') : undefined
}

function expandHostEventCandidates(event: unknown) {
  const candidates: unknown[] = []
  collectHostEventCandidates(event, candidates, 0, new WeakSet<object>())
  return candidates
}

function collectHostEventCandidates(value: unknown, candidates: unknown[], depth: number, seen: WeakSet<object>) {
  if (depth > 7 || value == null) {
    return
  }

  const normalized = parseJsonLike(value)
  if ((isObject(normalized) || Array.isArray(normalized)) && seen.has(normalized)) {
    return
  }
  if (isObject(normalized) || Array.isArray(normalized)) {
    seen.add(normalized)
  }

  candidates.push(normalized)

  if (Array.isArray(normalized)) {
    normalized.forEach((item) => collectHostEventCandidates(item, candidates, depth + 1, seen))
    return
  }

  if (!isObject(normalized)) {
    return
  }

  // The host bridge keeps tool payloads opaque; Excalidraw inspects common containers locally.
  ;[
    'payload',
    'metadata',
    'data',
    'result',
    'output',
    'outputs',
    'content',
    'text',
    'message',
    'detail',
    'response',
    'toolResult',
    'tool_result',
    'returnValue',
    'return_value',
    'artifact',
    'tool',
    'toolCall',
    'tool_call',
    'function',
    'arguments',
    'argsPreview',
    'args',
    'input',
    'currentVersion',
    'current_version',
    'version',
    'drawing',
    'item',
    'log'
  ].forEach((key) => collectHostEventCandidates(normalized[key], candidates, depth + 1, seen))
}

function parseJsonLike(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function readString(record: Record<string, unknown>, key: string) {
  return cleanString(record[key])
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined
  }
  return undefined
}

function readJsonStringField(value: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`"${escapedKey}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(value)
  if (!match) {
    return null
  }

  try {
    const parsed = JSON.parse(`"${match[1]}"`)
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null
  } catch {
    return match[1].trim() || null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
