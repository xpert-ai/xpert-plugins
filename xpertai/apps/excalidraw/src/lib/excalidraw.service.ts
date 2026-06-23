import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ExcalidrawActionLog, ExcalidrawDrawing, ExcalidrawDrawingVersion } from './entities/index.js'
import {
  createStableJsonSignature,
  ExcalidrawSceneValidationError,
  isPlainObject,
  normalizeExcalidrawScene,
  type NormalizedExcalidrawScene
} from './excalidraw-scene.validation.js'
import { buildAgentDrawingResponse, buildAgentSceneItemResponse } from './excalidraw-agent-response.js'
import type {
  CreateExcalidrawDrawingInput,
  ExcalidrawActionType,
  ExcalidrawActorType,
  GetExcalidrawDrawingInput,
  GetExcalidrawSceneItemInput,
  ExcalidrawScope,
  ExcalidrawSceneInput,
  ExcalidrawVersionSource,
  PatchExcalidrawSceneInput,
  ReportExcalidrawFailureInput,
  SaveExcalidrawMermaidDraftInput,
  SaveExcalidrawSceneVersionInput,
  SearchExcalidrawDrawingsInput,
  UpdateExcalidrawDrawingStatusInput
} from './types.js'

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

@Injectable()
export class ExcalidrawService {
  constructor(
    @InjectRepository(ExcalidrawDrawing)
    private readonly drawingRepository: Repository<ExcalidrawDrawing>,
    @InjectRepository(ExcalidrawDrawingVersion)
    private readonly versionRepository: Repository<ExcalidrawDrawingVersion>,
    @InjectRepository(ExcalidrawActionLog)
    private readonly logRepository: Repository<ExcalidrawActionLog>
  ) {}

  async createDrawing(scope: ExcalidrawScope, input: CreateExcalidrawDrawingInput) {
    const title = normalizeRequired(input.title, 'Drawing title is required.')
    const initialScene = hasSceneContent(input)
      ? validateScene(
          {
            elements: input.elements,
            appState: input.appState,
            files: input.files
          },
          'Initial Excalidraw scene'
        )
      : null
    const drawing = await this.drawingRepository.save(
      this.drawingRepository.create({
        ...scopedCreate(scope),
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        createdById: scope.userId ?? null,
        title,
        description: normalizeOptional(input.description),
        kind: input.kind ?? 'diagram',
        status: 'draft',
        tags: normalizeStringArray(input.tags),
        source: normalizeOptional(input.source),
        currentVersionNumber: 0,
        lastEditedById: scope.userId ?? null,
        lastEditedAt: new Date()
      })
    )

    await this.writeLog(scope, {
      drawingId: drawing.id,
      action: 'drawing_created',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `Drawing "${title}" was created.`,
      snapshot: { title, kind: drawing.kind, source: drawing.source }
    })

    if (initialScene) {
      await this.createVersion(scope, drawing, {
        sourceType: input.mermaidSource ? 'agent_mermaid' : 'agent_json',
        elements: initialScene.elements,
        appState: initialScene.appState,
        files: initialScene.files,
        mermaidSource: normalizeNullableText(input.mermaidSource),
        changeSummary: normalizeOptional(input.changeSummary) ?? 'Initial scene'
      })
    }

    return this.getDrawing(scope, drawing.id as string)
  }

  async saveSceneVersion(scope: ExcalidrawScope, input: SaveExcalidrawSceneVersionInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const version = await this.createVersion(scope, drawing, {
      sourceType: input.sourceType ?? 'agent_json',
      elements: input.elements,
      appState: input.appState,
      files: input.files,
      mermaidSource: normalizeNullableText(input.mermaidSource),
      changeSummary: normalizeOptional(input.changeSummary)
    })

    return {
      success: true,
      message: 'Excalidraw scene version was saved.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async saveCurrentScene(scope: ExcalidrawScope, input: SaveExcalidrawSceneVersionInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const version = await this.updateCurrentVersion(scope, drawing, {
      sourceType: input.sourceType ?? 'agent_json',
      elements: input.elements,
      appState: input.appState,
      files: input.files,
      mermaidSource: normalizeNullableText(input.mermaidSource),
      changeSummary: normalizeOptional(input.changeSummary)
    })

    return {
      success: true,
      message: 'Excalidraw current scene was saved.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async patchScene(scope: ExcalidrawScope, input: PatchExcalidrawSceneInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const currentVersion = await this.getCurrentVersion(scope, drawing)
    const currentScene = validateScene(
      {
        elements: currentVersion?.elements,
        appState: currentVersion?.appState,
        files: currentVersion?.files
      },
      'Current Excalidraw scene'
    )
    const patch = applyElementPatch(currentScene.elements, input)
    const appState = {
      ...currentScene.appState,
      ...(isPlainObject(input.appStatePatch) ? input.appStatePatch : {})
    }
    const files = input.files === undefined ? currentScene.files : normalizeObject(input.files)
    const mermaidSource =
      input.mermaidSource === undefined
        ? normalizeNullableText(currentVersion?.mermaidSource)
        : normalizeNullableText(input.mermaidSource)
    const beforeSignature = createStableJsonSignature({
      elements: currentScene.elements,
      appState: currentScene.appState,
      files: currentScene.files,
      mermaidSource: normalizeNullableText(currentVersion?.mermaidSource)
    })
    const afterSignature = createStableJsonSignature({
      elements: patch.elements,
      appState,
      files,
      mermaidSource
    })
    if (beforeSignature === afterSignature) {
      throw new BadRequestException('Excalidraw scene patch did not change the current scene.')
    }

    const version = await this.updateCurrentVersion(scope, drawing, {
      sourceType: 'agent_patch',
      elements: patch.elements,
      appState,
      files,
      mermaidSource,
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Agent patch'
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'scene_patched',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: {
        addCount: patch.addedIds.length,
        updateCount: patch.updatedIds.length,
        deleteCount: patch.deletedIds.length,
        addedIds: patch.addedIds,
        updatedIds: patch.updatedIds,
        deletedIds: patch.deletedIds
      }
    })

    return {
      success: true,
      message: 'Excalidraw scene patch updated the current version.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version,
      patch: {
        addCount: patch.addedIds.length,
        updateCount: patch.updatedIds.length,
        deleteCount: patch.deletedIds.length,
        addedIds: patch.addedIds,
        updatedIds: patch.updatedIds,
        deletedIds: patch.deletedIds
      }
    }
  }

  async saveMermaidDraft(scope: ExcalidrawScope, input: SaveExcalidrawMermaidDraftInput) {
    const mermaidSource = normalizeRequired(input.mermaidSource, 'Mermaid source is required.')
    const drawing = input.drawingId
      ? await this.requireDrawing(scope, input.drawingId)
      : (
          await this.createDrawing(scope, {
            title: input.title ?? 'Untitled Mermaid Diagram',
            description: input.description,
            kind: input.kind ?? 'flowchart'
          })
        ).item

    const version = await this.updateCurrentVersion(scope, drawing, {
      sourceType: 'agent_mermaid',
      elements: [],
      appState: {},
      files: {},
      mermaidSource,
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Mermaid draft'
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'mermaid_draft_saved',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: { mermaidSource }
    })

    return {
      success: true,
      message: 'Mermaid draft was saved. The Excalidraw workbench will convert and update the current scene.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async searchDrawings(scope: ExcalidrawScope, query: SearchExcalidrawDrawingsInput = {}) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 100))
    const search = query.search?.trim().toLowerCase() ?? ''
    const drawings = await this.drawingRepository.find({
      where: scopedWhere(scope),
      order: {
        updatedAt: 'DESC'
      }
    })
    const filtered = drawings.filter((drawing) => {
      if (query.status && drawing.status !== query.status) {
        return false
      }
      if (query.kind && drawing.kind !== query.kind) {
        return false
      }
      if (!search) {
        return true
      }
      return [drawing.title, drawing.description, drawing.kind, ...(drawing.tags ?? [])]
        .filter(isString)
        .some((value) => value.toLowerCase().includes(search))
    })
    const start = (page - 1) * pageSize

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      search
    }
  }

  async getDrawing(scope: ExcalidrawScope, drawingId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const [versions, logs] = await Promise.all([
      this.versionRepository.find({
        where: scopedWhere(scope, { drawingId }),
        order: {
          versionNumber: 'DESC'
        }
      }),
      this.logRepository.find({
        where: scopedWhere(scope, { drawingId }),
        order: {
          createdAt: 'DESC'
        }
      })
    ])
    const currentVersion = versions.find((version) => version.id === drawing.currentVersionId) ?? versions[0] ?? null

    return {
      item: drawing,
      currentVersion,
      versions,
      logs,
      total: versions.length,
      summary: {
        versionCount: versions.length,
        currentVersionNumber: drawing.currentVersionNumber ?? currentVersion?.versionNumber ?? 0,
        hasMermaidDraft: versions.some((version) => Boolean(version.mermaidSource))
      }
    }
  }

  async getDrawingForAgent(scope: ExcalidrawScope, input: GetExcalidrawDrawingInput) {
    const payload = await this.getDrawing(scope, input.drawingId)
    const sceneVersion = selectRequestedVersion(payload, input)
    return buildAgentDrawingResponse(payload, input, sceneVersion)
  }

  async getSceneItemForAgent(scope: ExcalidrawScope, input: GetExcalidrawSceneItemInput) {
    const payload = await this.getDrawing(scope, input.drawingId)
    const version = selectRequestedVersion(payload, input)
    if (!version) {
      throw new NotFoundException('Requested Excalidraw drawing version was not found.')
    }
    if (input.itemType === 'element') {
      const elementId = normalizeRequired(input.elementId, 'Element id is required when itemType is element.')
      const elements = Array.isArray(version.elements) ? version.elements : []
      const element = elements.find((candidate) => readElementId(candidate) === elementId)
      if (!element) {
        throw new NotFoundException('Requested Excalidraw element was not found.')
      }
      return buildAgentSceneItemResponse(version, { ...input, elementId })
    }
    if (input.itemType === 'file') {
      const fileId = normalizeRequired(input.fileId, 'File id is required when itemType is file.')
      const files = isPlainObject(version.files) ? version.files : {}
      if (!isPlainObject(files[fileId])) {
        throw new NotFoundException('Requested Excalidraw file was not found.')
      }
      return buildAgentSceneItemResponse(version, { ...input, fileId })
    }
    return buildAgentSceneItemResponse(version, input)
  }

  async getWorkbenchData(scope: ExcalidrawScope, query: SearchExcalidrawDrawingsInput & { drawingId?: string } = {}) {
    if (query.drawingId) {
      return this.getDrawing(scope, query.drawingId)
    }
    const result = await this.searchDrawings(scope, query)
    return {
      ...result,
      summary: {
        page: result.page,
        pageSize: result.pageSize,
        search: result.search
      }
    }
  }

  async updateDrawingStatus(scope: ExcalidrawScope, input: UpdateExcalidrawDrawingStatusInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const updated = await this.drawingRepository.save({
      ...drawing,
      status: input.status,
      lastEditedById: scope.userId ?? null,
      lastEditedAt: new Date()
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: drawing.currentVersionId,
      action: input.status === 'archived' ? 'drawing_archived' : 'status_updated',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.reason ?? `Status updated to ${input.status}`,
      snapshot: { status: input.status }
    })

    return {
      success: true,
      message: 'Excalidraw drawing status was updated.',
      item: updated
    }
  }

  async deleteDrawing(scope: ExcalidrawScope, drawingId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const scopedDrawingId = drawing.id as string

    await this.logRepository.delete(scopedWhere(scope, { drawingId: scopedDrawingId }))
    await this.versionRepository.delete(scopedWhere(scope, { drawingId: scopedDrawingId }))
    await this.drawingRepository.delete(scopedWhere(scope, { id: scopedDrawingId }))

    return {
      success: true,
      message: 'Excalidraw drawing was deleted.',
      drawingId: scopedDrawingId
    }
  }

  async deleteVersion(scope: ExcalidrawScope, drawingId: string, versionId: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const scopedDrawingId = drawing.id as string
    const normalizedVersionId = normalizeRequired(versionId, 'Version id is required.')
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { id: normalizedVersionId, drawingId: scopedDrawingId })
    })
    if (!version) {
      throw new NotFoundException('Excalidraw drawing version was not found.')
    }

    await this.logRepository.delete(scopedWhere(scope, { drawingId: scopedDrawingId, versionId: normalizedVersionId }))
    await this.versionRepository.delete(scopedWhere(scope, { id: normalizedVersionId, drawingId: scopedDrawingId }))

    const remainingVersions = await this.versionRepository.find({
      where: scopedWhere(scope, { drawingId: scopedDrawingId }),
      order: {
        versionNumber: 'DESC'
      }
    })
    const shouldReplaceCurrentVersion = drawing.currentVersionId === normalizedVersionId
    const nextCurrentVersion = shouldReplaceCurrentVersion ? (remainingVersions[0] ?? null) : null
    const updatedDrawing = shouldReplaceCurrentVersion
      ? {
          ...drawing,
          currentVersionId: nextCurrentVersion?.id ?? null,
          currentVersionNumber: nextCurrentVersion?.versionNumber ?? 0,
          lastEditedById: scope.userId ?? null,
          lastEditedAt: new Date()
        }
      : {
          ...drawing,
          lastEditedById: scope.userId ?? null,
          lastEditedAt: new Date()
        }
    await this.drawingRepository.save(updatedDrawing)

    return {
      success: true,
      message: 'Excalidraw drawing version was deleted.',
      drawing: await this.getDrawing(scope, scopedDrawingId),
      deletedVersionId: normalizedVersionId,
      currentVersionId: shouldReplaceCurrentVersion ? (nextCurrentVersion?.id ?? null) : drawing.currentVersionId,
      currentVersionNumber: shouldReplaceCurrentVersion ? (nextCurrentVersion?.versionNumber ?? 0) : (drawing.currentVersionNumber ?? 0)
    }
  }

  async restoreVersion(scope: ExcalidrawScope, drawingId: string, versionId: string, changeSummary?: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { id: versionId, drawingId })
    })
    if (!version) {
      throw new NotFoundException('Excalidraw drawing version was not found.')
    }

    const restored = await this.createVersion(scope, drawing, {
      sourceType: 'restore',
      elements: version.elements,
      appState: version.appState,
      files: version.files,
      mermaidSource: normalizeNullableText(version.mermaidSource),
      changeSummary: normalizeOptional(changeSummary) ?? `Restored version ${version.versionNumber}`
    })

    await this.writeLog(scope, {
      drawingId,
      versionId: restored.id,
      action: 'version_restored',
      actorType: 'user',
      message: changeSummary,
      snapshot: { restoredFromVersionId: versionId, restoredFromVersionNumber: version.versionNumber }
    })

    return {
      success: true,
      message: 'Excalidraw drawing version was restored.',
      drawing: await this.getDrawing(scope, drawingId),
      version: restored
    }
  }

  async reportFailure(scope: ExcalidrawScope, input: ReportExcalidrawFailureInput) {
    const log = await this.writeLog(scope, {
      drawingId: input.drawingId,
      versionId: input.versionId,
      action: 'failure_reported',
      actorType: scope.assistantId ? 'agent' : 'system',
      message: input.operation,
      errorMessage: input.errorMessage,
      snapshot: {
        recoverable: input.recoverable,
        evidence: input.evidence
      }
    })

    return {
      success: true,
      message: 'Excalidraw drawing failure was recorded.',
      log
    }
  }

  private async createVersion(
    scope: ExcalidrawScope,
    drawing: ExcalidrawDrawing,
    input: ExcalidrawSceneInput & {
      sourceType: ExcalidrawVersionSource
      changeSummary?: string
    }
  ) {
    const scene = validateScene(input, `Excalidraw ${input.sourceType} scene`)
    const currentVersionNumber = drawing.currentVersionNumber ?? 0
    const versionNumber = currentVersionNumber + 1
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        drawingId: drawing.id as string,
        versionNumber,
        sourceType: input.sourceType,
        elements: scene.elements,
        appState: scene.appState,
        files: scene.files,
        mermaidSource: normalizeNullableText(input.mermaidSource),
        changeSummary: normalizeOptional(input.changeSummary),
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null
      })
    )

    await this.drawingRepository.save({
      ...drawing,
      currentVersionId: version.id,
      currentVersionNumber: version.versionNumber,
      lastEditedById: scope.userId ?? null,
      lastEditedAt: new Date()
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'version_saved',
      actorType: input.sourceType.startsWith('agent') ? 'agent' : 'user',
      message: input.changeSummary,
      snapshot: {
        versionNumber,
        sourceType: input.sourceType,
        elementCount: version.elements?.length ?? 0,
        hasMermaidSource: Boolean(version.mermaidSource)
      }
    })

    return version
  }

  private async updateCurrentVersion(
    scope: ExcalidrawScope,
    drawing: ExcalidrawDrawing,
    input: ExcalidrawSceneInput & {
      sourceType: ExcalidrawVersionSource
      changeSummary?: string
    }
  ) {
    const scene = validateScene(input, `Excalidraw ${input.sourceType} scene`)
    const currentVersion = await this.getCurrentVersion(scope, drawing)
    if (!currentVersion) {
      return this.createVersion(scope, drawing, input)
    }

    const version = await this.versionRepository.save({
      ...currentVersion,
      sourceType: input.sourceType,
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      mermaidSource: normalizeNullableText(input.mermaidSource),
      changeSummary: normalizeOptional(input.changeSummary),
      assistantId: scope.assistantId ?? currentVersion.assistantId ?? null,
      conversationId: scope.conversationId ?? currentVersion.conversationId ?? null
    })

    await this.drawingRepository.save({
      ...drawing,
      currentVersionId: version.id,
      currentVersionNumber: version.versionNumber,
      lastEditedById: scope.userId ?? null,
      lastEditedAt: new Date()
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'scene_updated',
      actorType: input.sourceType.startsWith('agent') ? 'agent' : 'user',
      message: input.changeSummary,
      snapshot: {
        versionNumber: version.versionNumber,
        sourceType: input.sourceType,
        elementCount: version.elements?.length ?? 0,
        hasMermaidSource: Boolean(version.mermaidSource)
      }
    })

    return version
  }

  private async getCurrentVersion(scope: ExcalidrawScope, drawing: ExcalidrawDrawing) {
    if (!drawing.currentVersionId) {
      return null
    }
    return this.versionRepository.findOne({
      where: scopedWhere(scope, { id: drawing.currentVersionId, drawingId: drawing.id as string })
    })
  }

  private async requireDrawing(scope: ExcalidrawScope, drawingId: string) {
    const drawing = await this.drawingRepository.findOne({
      where: scopedWhere(scope, { id: normalizeRequired(drawingId, 'Drawing id is required.') })
    })
    if (!drawing) {
      throw new NotFoundException('Excalidraw drawing was not found.')
    }
    return drawing
  }

  private async writeLog(
    scope: ExcalidrawScope,
    input: {
      drawingId?: string
      versionId?: string
      action: ExcalidrawActionType
      actorType?: ExcalidrawActorType
      message?: string
      errorMessage?: string
      snapshot?: unknown
    }
  ) {
    return this.logRepository.save(
      this.logRepository.create({
        ...scopedCreate(scope),
        drawingId: input.drawingId ?? null,
        versionId: input.versionId ?? null,
        action: input.action,
        actorType: input.actorType ?? 'system',
        actorId: scope.userId ?? scope.assistantId ?? null,
        message: normalizeOptional(input.message),
        errorMessage: normalizeOptional(input.errorMessage),
        snapshot: input.snapshot
      })
    )
  }
}

function scopedCreate(scope: ExcalidrawScope): ScopedEntity & { createdById?: string | null } {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    createdById: scope.userId ?? null
  }
}

function selectRequestedVersion(payload: Record<string, any>, input: { versionId?: string; versionNumber?: number }) {
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

function scopedWhere<T extends Record<string, unknown>>(scope: ExcalidrawScope, extra?: Partial<T>): Partial<T> {
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

function normalizeRequired(value: string | undefined | null, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizeOptional(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeNullableText(value: string | undefined | null) {
  return normalizeOptional(value) ?? null
}

function normalizeStringArray(values: string[] | undefined | null) {
  const normalized = (values ?? []).map((value) => normalizeOptional(value)).filter(isString)
  return normalized.length ? Array.from(new Set(normalized)) : undefined
}

function normalizeObject(value: unknown) {
  return isPlainObject(value) ? value : {}
}

function hasSceneContent(input: ExcalidrawSceneInput) {
  return Boolean((Array.isArray(input.elements) && input.elements.length > 0) || input.mermaidSource || input.appState || input.files)
}

function validateScene(
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

function applyElementPatch(elements: Record<string, unknown>[], input: PatchExcalidrawSceneInput) {
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

function normalizePatchElements(elements: unknown[] | undefined | null) {
  return (Array.isArray(elements) ? elements : []).map((element, index) => {
    if (!isPlainObject(element)) {
      throw new BadRequestException(`addElements[${index}] must be an Excalidraw element object.`)
    }
    return normalizeAddedElementDefaults(element, index)
  })
}

function normalizeAddedElementDefaults(element: Record<string, unknown>, index: number) {
  const type = typeof element.type === 'string' ? element.type : ''
  const normalized = { ...element }
  const text = typeof normalized.text === 'string' ? normalized.text : typeof normalized.originalText === 'string' ? normalized.originalText : ''
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
      normalized.points = [[0, 0], [readFiniteNumber(normalized.width) ?? widthDefault, 0]]
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

function normalizeElementUpdateFields(update: Record<string, unknown>, currentElement: Record<string, unknown>) {
  const normalized = { ...update }
  const type = typeof currentElement.type === 'string' ? currentElement.type : typeof normalized.type === 'string' ? normalized.type : ''
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

function mergePatchedElement(element: Record<string, unknown>, update: Record<string, unknown>, id: string) {
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

function hasElementMaterialChange(previous: Record<string, unknown>, next: Record<string, unknown>) {
  return createStableJsonSignature(stripElementMutationMetadata(previous)) !== createStableJsonSignature(stripElementMutationMetadata(next))
}

function stripElementMutationMetadata(element: Record<string, unknown>) {
  return Object.keys(element).reduce<Record<string, unknown>>((acc, key) => {
    if (key !== 'version' && key !== 'versionNonce' && key !== 'updated') {
      acc[key] = element[key]
    }
    return acc
  }, {})
}

function bumpElementMutationMetadata(previous: Record<string, unknown>, next: Record<string, unknown>) {
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

function nextElementVersionNonce(previousVersionNonce: number | null) {
  const next = Math.trunc(Date.now() % 2147483647)
  if (previousVersionNonce === null || next !== previousVersionNonce) {
    return next
  }
  return next === 2147483646 ? 1 : next + 1
}

function estimateTextWidth(text: string) {
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

function normalizeArrowheadValue(value: unknown, fallback: string | null) {
  if (value === undefined) {
    return fallback
  }
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
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

function normalizeRoundnessValue(value: unknown) {
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

function defaultFiniteNumber(element: Record<string, unknown>, field: string, value: number) {
  if (!Number.isFinite(element[field])) {
    element[field] = value
  }
}

function defaultString(element: Record<string, unknown>, field: string, value: string) {
  if (typeof element[field] !== 'string') {
    element[field] = value
  }
}

function defaultBoolean(element: Record<string, unknown>, field: string, value: boolean) {
  if (typeof element[field] !== 'boolean') {
    element[field] = value
  }
}

function defaultArray(element: Record<string, unknown>, field: string) {
  if (!Array.isArray(element[field])) {
    element[field] = []
  }
}

function defaultNullable(element: Record<string, unknown>, field: string) {
  if (element[field] === undefined) {
    element[field] = null
  }
}

function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function collectUniqueIds(elements: Record<string, unknown>[], label: string) {
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

function collectUniqueStrings(values: string[], label: string) {
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

function readElementId(element: unknown) {
  return isPlainObject(element) && typeof element.id === 'string' ? element.id.trim() : null
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
