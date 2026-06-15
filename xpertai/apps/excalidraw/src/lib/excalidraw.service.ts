import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ExcalidrawActionLog, ExcalidrawDrawing, ExcalidrawDrawingVersion } from './entities/index.js'
import type {
  CreateExcalidrawDrawingInput,
  ExcalidrawActionType,
  ExcalidrawActorType,
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

    if (hasSceneContent(input)) {
      await this.createVersion(scope, drawing, {
        sourceType: input.mermaidSource ? 'agent_mermaid' : 'agent_json',
        elements: normalizeElements(input.elements),
        appState: normalizeObject(input.appState),
        files: normalizeObject(input.files),
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
      elements: normalizeElements(input.elements),
      appState: normalizeObject(input.appState),
      files: normalizeObject(input.files),
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

  async patchScene(scope: ExcalidrawScope, input: PatchExcalidrawSceneInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const currentVersion = await this.getCurrentVersion(scope, drawing)
    const patchedElements = applyElementPatch(currentVersion?.elements ?? [], input)
    const appState = {
      ...(isPlainObject(currentVersion?.appState) ? currentVersion?.appState : {}),
      ...(isPlainObject(input.appStatePatch) ? input.appStatePatch : {})
    }
    const version = await this.createVersion(scope, drawing, {
      sourceType: 'agent_patch',
      elements: patchedElements,
      appState,
      files: input.files === undefined ? normalizeObject(currentVersion?.files) : normalizeObject(input.files),
      mermaidSource:
        input.mermaidSource === undefined
          ? normalizeNullableText(currentVersion?.mermaidSource)
          : normalizeNullableText(input.mermaidSource),
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Agent patch'
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'scene_patched',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: {
        addCount: input.addElements?.length ?? 0,
        updateCount: input.updateElements?.length ?? 0,
        deleteCount: input.deleteElementIds?.length ?? 0
      }
    })

    return {
      success: true,
      message: 'Excalidraw scene patch was saved as a new version.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
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

    const version = await this.createVersion(scope, drawing, {
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
      message: 'Mermaid draft was saved. Convert it in the Excalidraw workbench to make it editable.',
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
      elements: normalizeElements(version.elements),
      appState: normalizeObject(version.appState),
      files: normalizeObject(version.files),
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
    const currentVersionNumber = drawing.currentVersionNumber ?? 0
    const versionNumber = currentVersionNumber + 1
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        drawingId: drawing.id as string,
        versionNumber,
        sourceType: input.sourceType,
        elements: normalizeElements(input.elements),
        appState: normalizeObject(input.appState),
        files: normalizeObject(input.files),
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

function normalizeElements(elements: unknown[] | undefined | null) {
  return Array.isArray(elements) ? elements : []
}

function normalizeObject(value: unknown) {
  return isPlainObject(value) ? value : {}
}

function hasSceneContent(input: ExcalidrawSceneInput) {
  return Boolean((Array.isArray(input.elements) && input.elements.length > 0) || input.mermaidSource || input.appState || input.files)
}

function applyElementPatch(elements: unknown[], input: PatchExcalidrawSceneInput) {
  const deleteIds = new Set(input.deleteElementIds ?? [])
  const updates = new Map((input.updateElements ?? []).map((item) => [item.id, item]))
  const next = elements
    .filter((element) => {
      const id = readElementId(element)
      return !id || !deleteIds.has(id)
    })
    .map((element) => {
      const id = readElementId(element)
      const update = id ? updates.get(id) : null
      return update && isPlainObject(element) ? { ...element, ...update } : element
    })
  return [...next, ...normalizeElements(input.addElements)]
}

function readElementId(element: unknown) {
  return isPlainObject(element) && typeof element.id === 'string' ? element.id : null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
