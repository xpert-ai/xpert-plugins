import { debug, configureDebug } from './debug.js'
import { restore } from '@excalidraw/excalidraw'
import type { CollaborationClient, ICollaborationPresence } from '@xpert-ai/plugin-sdk/collaboration-client'
import type { Socket } from 'socket.io-client'
import { normalizeExcalidrawElementsForPersistence } from '../../../excalidraw-scene.validation.js'
import { getErrorMessage } from './runtime.js'
import type { StatusFilter, Drawing, DrawingVersion, ExcalidrawTheme, DetailPayload, ArtifactShareSummary, ArtifactAccessSelection, ArtifactVersionSelection, CollaborationDescriptor, DiagramTemplateSummary, DiagramQualitySummary, SceneApplyPayload, DraftRecoverySnapshot, SaveCurrentSceneOptions, LoadDrawingDetailOptions, DeleteTarget, ConfirmationRequest } from './workbench-types.js'
const SCENE_APP_STATE_SIGNATURE_KEYS = [
  'viewBackgroundColor',
  'gridSize',
  'objectsSnapModeEnabled',
  'frameRendering'
]
export function restorePersistedScene(version: DrawingVersion | null | undefined, theme: ExcalidrawTheme) {
  const fallbackAppState = withHostThemeAppState(isObject(version?.appState) ? version?.appState : {}, theme)
  const fallbackElements = normalizeExcalidrawElementsForPersistence(Array.isArray(version?.elements) ? version?.elements : [])
  const fallbackScene = {
    elements: fallbackElements,
    appState: fallbackAppState,
    files: isObject(version?.files) ? version?.files : {}
  }
  try {
    const restored = restore(
      {
        elements: fallbackScene.elements as any,
        appState: fallbackAppState as any,
        files: fallbackScene.files as any
      },
      fallbackAppState as any,
      null,
      {
        repairBindings: true
      }
    ) as any
    return {
      elements: normalizeExcalidrawElementsForPersistence(Array.isArray(restored?.elements) ? restored.elements : fallbackScene.elements),
      appState: withHostThemeAppState(isObject(restored?.appState) ? restored.appState : fallbackScene.appState, theme),
      files: isObject(restored?.files) ? restored.files : fallbackScene.files
    }
  } catch (error) {
    debug.warn('[excalidraw-workbench] invalid persisted Excalidraw scene, falling back to blank scene')
    return {
      elements: [],
      appState: fallbackAppState,
      files: {}
    }
  }
}

export async function restoreImportedExcalidrawFile(file: File, theme: ExcalidrawTheme) {
  const parsed = JSON.parse(await file.text())
  return restoreExcalidrawScenePayload(parsed, theme)
}

export function restoreExcalidrawScenePayload(payload: unknown, theme: ExcalidrawTheme) {
  const source = isObject(payload) ? payload : {}
  const appState = isObject(source.appState) ? source.appState : {}
  const files = isObject(source.files) ? source.files : {}
  const elements = Array.isArray(source.elements) ? source.elements : []
  const fallbackAppState = withHostThemeAppState(appState, theme)
  const restored = restore(
    {
      elements: elements as any,
      appState: appState as any,
      files: files as any
    },
    fallbackAppState as any,
    null,
    {
      repairBindings: true,
      refreshDimensions: false
    }
  ) as any

  return {
    elements: normalizeExcalidrawElementsForPersistence(Array.isArray(restored?.elements) ? restored.elements : elements),
    appState: withHostThemeAppState(isObject(restored?.appState) ? restored.appState : fallbackAppState, theme),
    files: isObject(restored?.files) ? restored.files : files
  }
}

export function isRecoverableSceneError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('order key')
    || message.includes('invalid integer part')
    || message.includes('trailing zero')
    || message.includes('excalidraw scene')
}

export function shouldAutoSaveMermaidVersion(version: DrawingVersion | null | undefined) {
  return Boolean(
    version?.sourceType === 'agent_mermaid'
      && typeof version.mermaidSource === 'string'
      && version.mermaidSource.trim()
      && (!Array.isArray(version.elements) || version.elements.length === 0)
  )
}

export function isBlankPersistedVersion(version: DrawingVersion | null | undefined) {
  if (!version) {
    return true
  }
  return isBlankSceneData(version.elements, version.files, version.mermaidSource)
}

export function isBlankSceneData(elements: unknown, files: unknown, mermaidSource: unknown) {
  return !hasVisibleElements(elements)
    && !(isObject(files) && Object.keys(files).length > 0)
    && !(typeof mermaidSource === 'string' && mermaidSource.trim())
}

export function hasVisibleElements(elements: unknown) {
  return Array.isArray(elements) && elements.some((element) => !isObject(element) || element.isDeleted !== true)
}

export function formatVersionTime(version: DrawingVersion, locale: unknown) {
  const value = version.createdAt ?? version.created_at ?? version.updatedAt ?? version.updated_at
  const date = parseDateValue(value)
  if (!date) {
    return ''
  }
  try {
    return new Intl.DateTimeFormat(resolveDateLocale(locale), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

export function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : null
  }
  return null
}

export function resolveDateLocale(locale: unknown) {
  return String(locale || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function withHostThemeAppState(appState: Record<string, unknown>, theme: ExcalidrawTheme) {
  return {
    ...appState,
    theme,
    viewBackgroundColor: typeof appState.viewBackgroundColor === 'string' && appState.viewBackgroundColor
      ? appState.viewBackgroundColor
      : defaultCanvasBackground(theme)
  }
}

export function defaultCanvasBackground(theme: ExcalidrawTheme) {
  return theme === 'dark' ? '#121212' : '#ffffff'
}

export function resolveExcalidrawTheme(hostTheme: unknown): ExcalidrawTheme {
  const explicitTheme = normalizeThemeInput(hostTheme)
  if (explicitTheme) {
    return explicitTheme
  }

  const documentTheme = normalizeThemeInput(document.documentElement.dataset.theme)
    ?? normalizeThemeInput(document.documentElement.dataset.colorScheme)
    ?? normalizeThemeInput(document.body?.dataset.theme)
    ?? normalizeThemeInput(document.body?.dataset.colorScheme)
    ?? normalizeThemeInput(document.documentElement.className)
    ?? normalizeThemeInput(document.body?.className)
  if (documentTheme) {
    return documentTheme
  }

  const backgroundTheme = themeFromCssColor(readCssColor('--background') || readCssColor('--xui-color-background'))
  if (backgroundTheme) {
    return backgroundTheme
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function normalizeThemeInput(value: unknown): ExcalidrawTheme | null {
  if (typeof value === 'boolean') {
    return value ? 'dark' : 'light'
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    if (normalized.includes('dark') || normalized.includes('night')) {
      return 'dark'
    }
    if (normalized.includes('light') || normalized.includes('day')) {
      return 'light'
    }
    return null
  }
  if (!isObject(value)) {
    return null
  }
  if (value.isDark === true || value.dark === true) {
    return 'dark'
  }
  if (value.isDark === false || value.dark === false) {
    return 'light'
  }
  for (const key of ['mode', 'theme', 'colorScheme', 'appearance', 'name', 'type']) {
    const resolved = normalizeThemeInput(value[key])
    if (resolved) {
      return resolved
    }
  }
  return null
}

export function readCssColor(variableName: string) {
  if (typeof window === 'undefined') {
    return ''
  }
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
    || getComputedStyle(document.body).getPropertyValue(variableName).trim()
}

export function themeFromCssColor(color: string): ExcalidrawTheme | null {
  const rgb = parseCssColor(color)
  if (!rgb) {
    return null
  }
  const [r, g, b] = rgb.map((value) => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance < 0.36 ? 'dark' : 'light'
}

export function parseCssColor(color: string): [number, number, number] | null {
  const trimmed = color.trim()
  if (!trimmed) {
    return null
  }
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const value = hex[1].length === 3
      ? hex[1].split('').map((part) => part + part).join('')
      : hex[1]
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16)
    ]
  }

  const rgb = trimmed.match(/^rgba?\(([^)]+)\)$/i)
  if (rgb) {
    const parts = rgb[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part.trim()))
    if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
      return parts as [number, number, number]
    }
  }
  return null
}

export function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

export function createSceneSignature(
  elements: unknown[],
  appState: Record<string, unknown>,
  files: Record<string, unknown>,
  mermaidSource: string
) {
  const comparableAppState = SCENE_APP_STATE_SIGNATURE_KEYS.reduce<Record<string, unknown>>((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(appState, key)) {
      acc[key] = appState[key]
    }
    return acc
  }, {})
  return stableStringify({
    elements,
    appState: comparableAppState,
    files,
    mermaidSource: mermaidSource.replace(/\r\n/g, '\n')
  })
}

export function createDraftRecoverySnapshot(
  drawingId: string,
  scene: SceneApplyPayload,
  signature = createSceneSignature(scene.elements, scene.appState, scene.files, scene.mermaidSource)
): DraftRecoverySnapshot {
  const cloned = cloneScenePayload(scene)
  return {
    drawingId,
    signature,
    savedAt: Date.now(),
    ...cloned
  }
}

export function cloneDraftRecoverySnapshot(snapshot: DraftRecoverySnapshot): DraftRecoverySnapshot {
  return createDraftRecoverySnapshot(snapshot.drawingId, snapshot, snapshot.signature)
}

export function cloneScenePayload(scene: SceneApplyPayload): SceneApplyPayload {
  try {
    return structuredClone(scene)
  } catch {
    const normalized = normalizeJsonValue(scene) as SceneApplyPayload
    return {
      elements: Array.isArray(normalized?.elements) ? normalized.elements : [],
      appState: isObject(normalized?.appState) ? normalized.appState : {},
      files: isObject(normalized?.files) ? normalized.files : {},
      mermaidSource: typeof normalized?.mermaidSource === 'string' ? normalized.mermaidSource : ''
    }
  }
}

export function stableStringify(value: unknown) {
  return JSON.stringify(normalizeJsonValue(value))
}

export function normalizeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeJsonValue(item, seen)
      return normalized === undefined ? null : normalized
    })
  }
  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([key, mapValue]) => [String(key), normalizeJsonValue(mapValue, seen)] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  }
  if (value instanceof Set) {
    return Array.from(value.values()).map((item) => normalizeJsonValue(item, seen))
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const normalized = normalizeJsonValue((value as Record<string, unknown>)[key], seen)
      if (normalized !== undefined) {
        acc[key] = normalized
      }
      return acc
    }, {})
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function synchronizeCollaboration(client: CollaborationClient | null, socket: Socket | null) {
  if (!client || !socket?.connected) return Promise.resolve(false)
  client.flush()
  return new Promise<boolean>((resolve) => {
    const complete = () => {
      window.clearTimeout(timer)
      resolve(true)
    }
    const timer = window.setTimeout(() => {
      socket.off('sync', complete)
      resolve(false)
    }, 3_000)
    socket.once('sync', complete)
    client.requestSync()
  })
}

export function buildExcalidrawCollaborators(items: ICollaborationPresence[], appState: Record<string, unknown>) {
  const width = readPositiveNumber(appState.width, window.innerWidth)
  const height = readPositiveNumber(appState.height, window.innerHeight)
  const zoom = readZoom(appState)
  const scrollX = readFiniteNumber(appState.scrollX, 0)
  const scrollY = readFiniteNumber(appState.scrollY, 0)
  const collaborators = new Map<string, Record<string, unknown>>()
  for (const item of items) {
    const pointer = item.pointer?.visible
      ? {
          x: item.pointer.x * width / zoom - scrollX,
          y: item.pointer.y * height / zoom - scrollY,
          tool: 'pointer'
        }
      : null
    const selectedIds = item.selection?.kind === 'elements' ? item.selection.elementIds ?? [] : []
    collaborators.set(item.clientId, {
      id: item.presenceId,
      socketId: item.clientId,
      username: item.displayName,
      avatarUrl: item.avatarUrl ?? undefined,
      color: {
        background: item.color,
        stroke: item.color
      },
      pointer,
      button: 'up',
      selectedElementIds: Object.fromEntries(selectedIds.map((id) => [id, true]))
    })
  }
  return collaborators
}

export function normalizeExcalidrawPointer(
  pointer: { x: number; y: number },
  appState: Record<string, unknown>,
  width: number,
  height: number
) {
  const zoom = readZoom(appState)
  const scrollX = readFiniteNumber(appState.scrollX, 0)
  const scrollY = readFiniteNumber(appState.scrollY, 0)
  return {
    x: clamp((pointer.x + scrollX) * zoom / width, 0, 1),
    y: clamp((pointer.y + scrollY) * zoom / height, 0, 1),
    visible: true
  }
}

export function readZoom(appState: Record<string, unknown>) {
  const zoom = appState.zoom
  if (typeof zoom === 'number') return readPositiveNumber(zoom, 1)
  if (isObject(zoom)) return readPositiveNumber(zoom.value, 1)
  return 1
}

export function readPositiveNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

export function readFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function collaboratorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map((part) => part.slice(0, 1).toUpperCase()).join('')
}

export function copyTextWithTextarea(value: string) {
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.focus()
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  return copied
}

export function normalizeArtifactShare(value: unknown, depth = 0): ArtifactShareSummary | null {
  if (!isObject(value) || depth > 4) return null
  const nested = normalizeArtifactShare(value.data, depth + 1)
  if (nested) return nested
  const shareUrl = readOptionalString(value.shareUrl)
    ?? readOptionalString(value.publicUrl)
    ?? readOptionalString(value.artifactPublicUrl)
  const artifactId = readOptionalString(value.artifactId)
  const artifactVersionId = readOptionalString(value.artifactVersionId)
  const artifactLinkId = readOptionalString(value.artifactLinkId)
  if (!shareUrl && !artifactId && !artifactVersionId && !artifactLinkId) return null
  return {
    artifactId,
    artifactVersionId,
    artifactLinkId,
    versionMode: value.versionMode === 'latest' || value.versionMode === 'version' ? value.versionMode : undefined,
    accessMode: readOptionalString(value.accessMode),
    shareUrl,
    sharedAt: readOptionalString(value.sharedAt),
    status: readOptionalString(value.status),
    revision: typeof value.revision === 'number' && Number.isInteger(value.revision) ? value.revision : undefined
  }
}

export function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function isArtifactAccessSelection(value: unknown): value is ArtifactAccessSelection {
  return value === 'public_link' || value === 'organization_all' || value === 'workspace_all'
}

export function localizedText(value: Record<string, string> | undefined, locale: unknown) {
  if (!value) return ''
  const chinese = String(locale || '').toLowerCase().startsWith('zh')
  return chinese ? value.zh_Hans || value.en_US || '' : value.en_US || value.zh_Hans || ''
}

export function removeExcalidrawExtension(name: string) {
  return name.replace(/\.excalidraw(?:\.json)?$/i, '').replace(/\.json$/i, '') || name
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

