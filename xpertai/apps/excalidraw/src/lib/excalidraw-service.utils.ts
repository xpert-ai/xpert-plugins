import { BadRequestException, NotFoundException } from '@nestjs/common'
import {
  WORKSPACE_FILES_SOURCE,
  type ArtifactAccessMode,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type WorkspaceFile,
  type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { ExcalidrawArtifactPublication, ExcalidrawDrawing } from './entities/index.js'
import {
  createStableJsonSignature,
  ExcalidrawSceneValidationError,
  isPlainObject,
  normalizeExcalidrawScene,
  type NormalizedExcalidrawScene
} from './excalidraw-scene.validation.js'
import type { ExcalidrawSceneInput, ExcalidrawScope, PatchExcalidrawSceneInput } from './types.js'

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

export function scopedCreate(scope: ExcalidrawScope): ScopedEntity & { createdById?: string | null } {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    createdById: scope.userId ?? null
  }
}

/** Use only after authorizing the parent drawing. Children share its tenant/org boundary. */
export function drawingChildrenScope(scope: ExcalidrawScope): ExcalidrawScope {
  return { ...scope, workspaceId: null, projectId: null }
}

export function drawingStorageScope(scope: ExcalidrawScope, drawing: ExcalidrawDrawing): ExcalidrawScope {
  return { ...scope, workspaceId: drawing.workspaceId ?? null, projectId: drawing.projectId ?? null }
}

export function collaborationScope(
  context: CollaborationProviderContext | CollaborationMaterializationEvent
): ExcalidrawScope {
  return {
    tenantId: normalizeRequired(context.tenantId, 'Collaboration tenant id is required.'),
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId ?? null,
    assistantId: context.xpertId ?? null
  }
}

export function collaborationSceneSignature(scene: ExcalidrawSceneInput) {
  return createStableJsonSignature({
    elements: scene.elements ?? [],
    appState: scene.appState ?? {},
    files: scene.files ?? {},
    mermaidSource: normalizeNullableText(scene.mermaidSource)
  })
}

export function explicitWorkspaceScope(drawing: ExcalidrawDrawing, scope: ExcalidrawScope) {
  if (drawing.projectId) {
    return {
      tenantId: drawing.tenantId,
      userId: scope.userId,
      catalog: 'projects' as const,
      scopeId: drawing.projectId,
      projectId: drawing.projectId
    }
  }
  if (drawing.assistantId) {
    return {
      tenantId: drawing.tenantId,
      userId: scope.userId,
      catalog: 'xperts' as const,
      scopeId: drawing.assistantId,
      xpertId: drawing.assistantId,
      isolateByUser: false
    }
  }
  if (scope.userId)
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      userId: scope.userId,
      catalog: 'users' as const,
      scopeId: scope.userId
    }
  throw new BadRequestException('missing_storage_identity')
}

export function portableReference(
  file: WorkspaceFile,
  scope: ReturnType<typeof explicitWorkspaceScope>,
  originalName: string,
  size: number,
  mimeType: string
): WorkspacePortableFileReference {
  return {
    source: WORKSPACE_FILES_SOURCE,
    filePath: file.filePath,
    workspacePath: file.workspacePath,
    catalog: scope.catalog,
    scopeId: scope.scopeId,
    tenantId: scope.tenantId,
    userId: scope.userId,
    ...('projectId' in scope ? { projectId: scope.projectId } : {}),
    ...('xpertId' in scope ? { xpertId: scope.xpertId, isolateByUser: false } : {}),
    originalName,
    name: file.name,
    mimeType: file.mimeType ?? mimeType,
    size: file.size ?? size
  }
}

export function artifactScope(drawing: ExcalidrawDrawing, scope: ExcalidrawScope) {
  return {
    tenantId: drawing.tenantId ?? scope.tenantId ?? null,
    organizationId: drawing.organizationId ?? scope.organizationId ?? null,
    userId: scope.userId ?? drawing.createdById ?? null,
    workspaceId: drawing.workspaceId ?? scope.workspaceId ?? null,
    projectId: drawing.projectId ?? scope.projectId ?? null,
    xpertId: drawing.assistantId ?? scope.assistantId ?? null
  }
}

export function artifactMetadata(drawing: ExcalidrawDrawing, extra?: Record<string, unknown>) {
  return {
    drawingId: drawing.id,
    drawingTitle: drawing.title,
    drawingKind: drawing.kind,
    currentVersionId: drawing.currentVersionId,
    currentVersionNumber: drawing.currentVersionNumber ?? 0,
    ...extra
  }
}

export function normalizeArtifactAccessMode(value: ArtifactAccessMode | null | undefined): ArtifactAccessMode {
  if (!value) return 'public_link'
  const allowed = new Set<ArtifactAccessMode>(['owner_only', 'workspace_all', 'organization_all', 'public_link'])
  if (allowed.has(value)) return value
  throw new BadRequestException(`Unsupported artifact access mode: ${value}`)
}

export function normalizeHtmlFileName(value: string | null | undefined) {
  const base =
    (normalizeOptional(value) ?? 'excalidraw-drawing')
      .replace(/\.html?$/i, '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'excalidraw-drawing'
  return `${base}.html`
}

export function compactArtifactShare(publication: ExcalidrawArtifactPublication, message?: string) {
  const publicUrl = normalizeArtifactPublicUrl(publication.publicUrl)
  return {
    ...(message ? { message } : {}),
    drawingId: publication.drawingId,
    revision: publication.collaborationSequence,
    artifactId: publication.artifactId,
    artifactVersionId: publication.artifactVersionId,
    artifactLinkId: publication.artifactLinkId,
    versionMode: publication.artifactLinkVersionMode,
    accessMode: publication.artifactLinkAccessMode,
    allowDownload: publication.allowDownload,
    shareUrl: publicUrl,
    publicUrl,
    sharedAt: publication.sharedAt,
    status: publication.status
  }
}

export function normalizeArtifactPublicUrl(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || undefined
}

export function selectRequestedVersion(
  payload: Record<string, any>,
  input: { versionId?: string; versionNumber?: number }
) {
  const versions = Array.isArray(payload.versions) ? payload.versions : []
  if (input.versionId) {
    const version = versions.find((candidate) => candidate.id === input.versionId)
    if (!version) {
      throw new NotFoundException('Requested Excalidraw drawing version was not found.')
    }
    return version
  }
  if (input.versionNumber !== undefined) {
    const version = versions.find((candidate) => candidate.versionNumber === input.versionNumber)
    if (!version) {
      throw new NotFoundException('Requested Excalidraw drawing version was not found.')
    }
    return version
  }
  return payload.currentVersion ?? versions[0] ?? null
}

export function scopedWhere<T extends Record<string, unknown>>(scope: ExcalidrawScope, extra?: Partial<T>): Partial<T> {
  if (!scope.tenantId || (scope.surface === 'mcp' && !scope.organizationId))
    throw new BadRequestException('missing_execution_context')
  const where = {
    tenantId: scope.tenantId
  } as Record<string, unknown>
  if (scope.organizationId != null) {
    where.organizationId = scope.organizationId
  }
  if (scope.projectId != null) {
    where.projectId = scope.projectId
  } else if (scope.workspaceId != null) {
    where.workspaceId = scope.workspaceId
  }
  return {
    ...where,
    ...(extra ?? {})
  } as Partial<T>
}

export function normalizeRequired(value: string | undefined | null, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

export function normalizeOptional(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export function normalizeNullableText(value: string | undefined | null) {
  return normalizeOptional(value) ?? null
}

export function normalizeStringArray(values: string[] | undefined | null) {
  const normalized = (values ?? []).map((value) => normalizeOptional(value)).filter(isString)
  return normalized.length ? Array.from(new Set(normalized)) : undefined
}

export function normalizeObject(value: unknown) {
  return isPlainObject(value) ? value : {}
}

export function hasSceneContent(input: ExcalidrawSceneInput) {
  return Boolean(
    (Array.isArray(input.elements) && input.elements.length > 0) || input.mermaidSource || input.appState || input.files
  )
}

export function validateScene(
  input: {
    elements?: unknown[] | null
    appState?: unknown
    files?: unknown
  },
  context: string
): NormalizedExcalidrawScene {
  try {
    return normalizeExcalidrawScene(input, { context })
  } catch (error) {
    if (error instanceof ExcalidrawSceneValidationError) {
      throw new BadRequestException(error.message)
    }
    throw error
  }
}

export function applyElementPatch(elements: Record<string, unknown>[], input: PatchExcalidrawSceneInput) {
  const currentIds = new Set(elements.map((element) => readElementId(element)).filter(isString))
  const addElements = normalizePatchElements(input.addElements)
  const updateElements = input.updateElements ?? []
  const deleteElementIds = input.deleteElementIds ?? []
  const addedIds = collectUniqueIds(addElements, 'addElements')
  const updatedIds = collectUniqueStrings(
    updateElements.map((item) => item.id),
    'updateElements.id'
  )
  const deletedIds = collectUniqueStrings(deleteElementIds, 'deleteElementIds')

  for (const id of updatedIds) {
    if (!currentIds.has(id)) {
      throw new BadRequestException(`Cannot update unknown Excalidraw element id "${id}".`)
    }
  }
  for (const id of deletedIds) {
    if (!currentIds.has(id)) {
      throw new BadRequestException(`Cannot delete unknown Excalidraw element id "${id}".`)
    }
  }
  for (const id of addedIds) {
    if (currentIds.has(id)) {
      throw new BadRequestException(`Cannot add duplicate Excalidraw element id "${id}".`)
    }
  }

  const deleteIdSet = new Set(deletedIds)
  const updates = new Map(updateElements.map((item) => [item.id, item]))
  const next = elements
    .filter((element) => !deleteIdSet.has(readElementId(element) ?? ''))
    .map((element) => {
      const id = readElementId(element)
      const update = id ? updates.get(id) : null
      if (!update) {
        return element
      }
      if (update.type !== undefined && update.type !== element.type) {
        throw new BadRequestException(`Cannot change Excalidraw element "${id}" type.`)
      }
      return mergePatchedElement(element, update, id)
    })

  return {
    elements: [...next, ...addElements],
    addedIds,
    updatedIds,
    deletedIds
  }
}

export function normalizePatchElements(elements: unknown[] | undefined | null) {
  return (Array.isArray(elements) ? elements : []).map((element, index) => {
    if (!isPlainObject(element)) {
      throw new BadRequestException(`addElements[${index}] must be an Excalidraw element object.`)
    }
    return normalizeAddedElementDefaults(element, index)
  })
}

export function normalizeAddedElementDefaults(element: Record<string, unknown>, index: number) {
  const type = typeof element.type === 'string' ? element.type : ''
  const normalized = { ...element }
  const text =
    typeof normalized.text === 'string'
      ? normalized.text
      : typeof normalized.originalText === 'string'
      ? normalized.originalText
      : ''
  const widthDefault = type === 'text' ? estimateTextWidth(text) : 120
  const heightDefault = type === 'text' ? 24 : 80

  defaultFiniteNumber(normalized, 'x', 0)
  defaultFiniteNumber(normalized, 'y', 0)
  defaultFiniteNumber(normalized, 'width', widthDefault)
  defaultFiniteNumber(normalized, 'height', heightDefault)
  defaultFiniteNumber(normalized, 'angle', 0)
  defaultFiniteNumber(normalized, 'strokeWidth', 2)
  defaultFiniteNumber(normalized, 'roughness', 1)
  defaultFiniteNumber(normalized, 'opacity', 100)
  defaultFiniteNumber(normalized, 'seed', index + 1)
  defaultFiniteNumber(normalized, 'version', 1)
  defaultFiniteNumber(normalized, 'versionNonce', index + 1)
  defaultFiniteNumber(normalized, 'updated', Date.now())
  defaultString(normalized, 'strokeColor', '#1e1e1e')
  defaultString(normalized, 'backgroundColor', 'transparent')
  defaultString(normalized, 'fillStyle', 'hachure')
  defaultString(normalized, 'strokeStyle', 'solid')
  defaultBoolean(normalized, 'isDeleted', false)
  defaultBoolean(normalized, 'locked', false)
  defaultArray(normalized, 'groupIds')
  defaultNullable(normalized, 'frameId')
  defaultNullable(normalized, 'boundElements')
  defaultNullable(normalized, 'link')
  defaultNullable(normalized, 'roundness')
  normalized.roundness = normalizeRoundnessValue(normalized.roundness)
  if (normalized.index === undefined) {
    normalized.index = null
  }

  if (type === 'text') {
    normalized.text = text
    defaultString(normalized, 'originalText', text)
    defaultString(normalized, 'textAlign', 'left')
    defaultString(normalized, 'verticalAlign', 'top')
    defaultNullable(normalized, 'containerId')
    defaultBoolean(normalized, 'autoResize', true)
    defaultFiniteNumber(normalized, 'fontSize', 20)
    defaultFiniteNumber(normalized, 'fontFamily', 5)
    defaultFiniteNumber(normalized, 'lineHeight', 1.25)
  } else if (type === 'arrow' || type === 'line') {
    if (!Array.isArray(normalized.points) || normalized.points.length < 2) {
      normalized.points = [
        [0, 0],
        [readFiniteNumber(normalized.width) ?? widthDefault, 0]
      ]
    }
    defaultNullable(normalized, 'lastCommittedPoint')
    defaultNullable(normalized, 'startBinding')
    defaultNullable(normalized, 'endBinding')
    normalized.startArrowhead = normalizeArrowheadValue(normalized.startArrowhead, null)
    if (type === 'arrow') {
      normalized.endArrowhead = normalizeArrowheadValue(normalized.endArrowhead, 'arrow')
      defaultBoolean(normalized, 'elbowed', false)
    } else {
      normalized.endArrowhead = normalizeArrowheadValue(normalized.endArrowhead, null)
    }
  } else if (type === 'freedraw') {
    if (!Array.isArray(normalized.points) || normalized.points.length < 1) {
      normalized.points = [[0, 0]]
    }
    if (!Array.isArray(normalized.pressures)) {
      normalized.pressures = []
    }
    defaultBoolean(normalized, 'simulatePressure', false)
    defaultNullable(normalized, 'lastCommittedPoint')
  } else if (type === 'image') {
    defaultNullable(normalized, 'fileId')
    defaultString(normalized, 'status', 'saved')
    if (!Array.isArray(normalized.scale) || normalized.scale.length !== 2) {
      normalized.scale = [1, 1]
    }
    defaultNullable(normalized, 'crop')
  } else if (type === 'frame' || type === 'magicframe') {
    defaultNullable(normalized, 'name')
  }

  return normalized
}

export function normalizeElementUpdateFields(update: Record<string, unknown>, currentElement: Record<string, unknown>) {
  const normalized = { ...update }
  const type =
    typeof currentElement.type === 'string'
      ? currentElement.type
      : typeof normalized.type === 'string'
      ? normalized.type
      : ''
  if (Object.prototype.hasOwnProperty.call(normalized, 'roundness')) {
    normalized.roundness = normalizeRoundnessValue(normalized.roundness)
  }
  if (type !== 'arrow' && type !== 'line') {
    return normalized
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'startArrowhead')) {
    normalized.startArrowhead = normalizeArrowheadValue(normalized.startArrowhead, null)
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'endArrowhead')) {
    normalized.endArrowhead = normalizeArrowheadValue(normalized.endArrowhead, type === 'arrow' ? 'arrow' : null)
  }
  return normalized
}

export function mergePatchedElement(element: Record<string, unknown>, update: Record<string, unknown>, id: string) {
  const merged = {
    ...element,
    ...normalizeElementUpdateFields(update, element),
    id
  }
  if (!hasElementMaterialChange(element, merged)) {
    return merged
  }
  return bumpElementMutationMetadata(element, merged)
}

export function hasElementMaterialChange(previous: Record<string, unknown>, next: Record<string, unknown>) {
  return (
    createStableJsonSignature(stripElementMutationMetadata(previous)) !==
    createStableJsonSignature(stripElementMutationMetadata(next))
  )
}

export function stripElementMutationMetadata(element: Record<string, unknown>) {
  return Object.keys(element).reduce<Record<string, unknown>>((acc, key) => {
    if (key !== 'version' && key !== 'versionNonce' && key !== 'updated') {
      acc[key] = element[key]
    }
    return acc
  }, {})
}

export function bumpElementMutationMetadata(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const bumped = { ...next }
  const previousVersion = readFiniteNumber(previous.version) ?? 0
  const nextVersion = readFiniteNumber(bumped.version)
  if (nextVersion === null || nextVersion <= previousVersion) {
    bumped.version = previousVersion + 1
  }

  const previousVersionNonce = readFiniteNumber(previous.versionNonce)
  const nextVersionNonce = readFiniteNumber(bumped.versionNonce)
  if (nextVersionNonce === null || nextVersionNonce === previousVersionNonce) {
    bumped.versionNonce = nextElementVersionNonce(previousVersionNonce)
  }

  const previousUpdated = readFiniteNumber(previous.updated) ?? 0
  const nextUpdated = readFiniteNumber(bumped.updated)
  if (nextUpdated === null || nextUpdated <= previousUpdated) {
    bumped.updated = Math.max(Date.now(), previousUpdated + 1)
  }
  return bumped
}

export function nextElementVersionNonce(previousVersionNonce: number | null) {
  const next = Math.trunc(Date.now() % 2147483647)
  if (previousVersionNonce === null || next !== previousVersionNonce) {
    return next
  }
  return next === 2147483646 ? 1 : next + 1
}

export function estimateTextWidth(text: string) {
  return Math.max(40, Math.min(600, text.length * 12 || 80))
}

const SUPPORTED_ARROWHEADS = new Set([
  'arrow',
  'bar',
  'dot',
  'circle',
  'circle_outline',
  'triangle',
  'triangle_outline',
  'diamond',
  'diamond_outline',
  'crowfoot_one',
  'crowfoot_many',
  'crowfoot_one_or_many'
])
const DEFAULT_ROUNDNESS_TYPE = 3

const ARROWHEAD_ALIASES = new Map<string, string | null>([
  ['none', null],
  ['no', null],
  ['no_arrow', null],
  ['null', null],
  ['undefined', null],
  ['false', null],
  ['0', null],
  ['arrowhead', 'arrow'],
  ['arrow_head', 'arrow'],
  ['normal', 'arrow'],
  ['standard', 'arrow'],
  ['single_arrow', 'arrow'],
  ['triangle_filled', 'triangle'],
  ['filled_triangle', 'triangle'],
  ['open_triangle', 'triangle_outline'],
  ['hollow_triangle', 'triangle_outline'],
  ['outlined_triangle', 'triangle_outline'],
  ['circle_filled', 'circle'],
  ['filled_circle', 'circle'],
  ['open_circle', 'circle_outline'],
  ['hollow_circle', 'circle_outline'],
  ['outlined_circle', 'circle_outline'],
  ['diamond_filled', 'diamond'],
  ['filled_diamond', 'diamond'],
  ['open_diamond', 'diamond_outline'],
  ['hollow_diamond', 'diamond_outline'],
  ['outlined_diamond', 'diamond_outline'],
  ['tee', 'bar'],
  ['one', 'crowfoot_one'],
  ['many', 'crowfoot_many'],
  ['one_or_many', 'crowfoot_one_or_many'],
  ['crowfoot', 'crowfoot_many']
])

export function normalizeArrowheadValue(value: unknown, fallback: string | null) {
  if (value === undefined) {
    return fallback
  }
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (!normalized) {
    return null
  }
  if (SUPPORTED_ARROWHEADS.has(normalized)) {
    return normalized
  }
  if (ARROWHEAD_ALIASES.has(normalized)) {
    return ARROWHEAD_ALIASES.get(normalized) ?? null
  }
  return fallback
}

export function normalizeRoundnessValue(value: unknown) {
  if (value === undefined || value === null) {
    return null
  }
  if (!isPlainObject(value)) {
    return null
  }
  const normalized = { ...value }
  if (!Number.isFinite(normalized.type)) {
    normalized.type = DEFAULT_ROUNDNESS_TYPE
  }
  if (normalized.value !== undefined && !Number.isFinite(normalized.value)) {
    delete normalized.value
  }
  return normalized
}

export function defaultFiniteNumber(element: Record<string, unknown>, field: string, value: number) {
  if (!Number.isFinite(element[field])) {
    element[field] = value
  }
}

export function defaultString(element: Record<string, unknown>, field: string, value: string) {
  if (typeof element[field] !== 'string') {
    element[field] = value
  }
}

export function defaultBoolean(element: Record<string, unknown>, field: string, value: boolean) {
  if (typeof element[field] !== 'boolean') {
    element[field] = value
  }
}

export function defaultArray(element: Record<string, unknown>, field: string) {
  if (!Array.isArray(element[field])) {
    element[field] = []
  }
}

export function defaultNullable(element: Record<string, unknown>, field: string) {
  if (element[field] === undefined) {
    element[field] = null
  }
}

export function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function collectUniqueIds(elements: Record<string, unknown>[], label: string) {
  return collectUniqueStrings(
    elements.map((element, index) => {
      const id = readElementId(element)
      if (!id) {
        throw new BadRequestException(`${label}[${index}].id is required.`)
      }
      return id
    }),
    `${label}.id`
  )
}

export function collectUniqueStrings(values: string[], label: string) {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const value of values) {
    const normalized = normalizeOptional(value)
    if (!normalized) {
      throw new BadRequestException(`${label} contains an empty id.`)
    }
    if (seen.has(normalized)) {
      throw new BadRequestException(`${label} contains duplicate id "${normalized}".`)
    }
    seen.add(normalized)
    ids.push(normalized)
  }
  return ids
}

export function readElementId(element: unknown) {
  return isPlainObject(element) && typeof element.id === 'string' ? element.id.trim() : null
}

export function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
