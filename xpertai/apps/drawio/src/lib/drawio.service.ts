import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DrawioActionLog, DrawioDrawing, DrawioDrawingVersion } from './entities/index.js'
import type {
  CreateDrawioDrawingInput,
  DrawioActionType,
  DrawioActorType,
  DrawioScope,
  DrawioSceneInput,
  DrawioVersionSource,
  PatchDrawioSceneInput,
  ReportDrawioFailureInput,
  SaveDrawioMermaidDraftInput,
  SaveDrawioSceneVersionInput,
  SearchDrawioDrawingsInput,
  UpdateDrawioDrawingStatusInput
} from './types.js'

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

@Injectable()
export class DrawioService {
  constructor(
    @InjectRepository(DrawioDrawing)
    private readonly drawingRepository: Repository<DrawioDrawing>,
    @InjectRepository(DrawioDrawingVersion)
    private readonly versionRepository: Repository<DrawioDrawingVersion>,
    @InjectRepository(DrawioActionLog)
    private readonly logRepository: Repository<DrawioActionLog>
  ) {}

  async createDrawing(scope: DrawioScope, input: CreateDrawioDrawingInput) {
    const title = normalizeRequired(input.title, 'Diagram title is required.')
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
      message: `draw.io diagram "${title}" was created.`,
      snapshot: { title, kind: drawing.kind, source: drawing.source }
    })

    if (hasSceneContent(input)) {
      await this.createVersion(scope, drawing, {
        sourceType: input.mermaidSource ? 'agent_mermaid' : 'agent_xml',
        xml: normalizeNullableText(input.xml),
        mermaidSource: normalizeNullableText(input.mermaidSource),
        previewSvg: normalizeNullableText(input.previewSvg),
        previewPng: normalizeNullableText(input.previewPng),
        descriptor: normalizeObject(input.descriptor),
        changeSummary: normalizeOptional(input.changeSummary) ?? 'Initial diagram'
      })
    }

    return this.getDrawing(scope, drawing.id as string)
  }

  async saveSceneVersion(scope: DrawioScope, input: SaveDrawioSceneVersionInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const version = await this.createVersion(scope, drawing, {
      sourceType: input.sourceType ?? 'agent_xml',
      xml: normalizeNullableText(input.xml),
      mermaidSource: normalizeNullableText(input.mermaidSource),
      previewSvg: normalizeNullableText(input.previewSvg),
      previewPng: normalizeNullableText(input.previewPng),
      descriptor: normalizeObject(input.descriptor),
      changeSummary: normalizeOptional(input.changeSummary)
    })

    return {
      success: true,
      message: 'draw.io diagram version was saved.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async patchScene(scope: DrawioScope, input: PatchDrawioSceneInput) {
    const drawing = await this.requireDrawing(scope, input.drawingId)
    const currentVersion = await this.getCurrentVersion(scope, drawing)
    const version = await this.createVersion(scope, drawing, {
      sourceType: 'agent_patch',
      xml: input.xml === undefined ? normalizeNullableText(currentVersion?.xml) : normalizeNullableText(input.xml),
      mermaidSource:
        input.mermaidSource === undefined
          ? normalizeNullableText(currentVersion?.mermaidSource)
          : normalizeNullableText(input.mermaidSource),
      previewSvg:
        input.previewSvg === undefined ? normalizeNullableText(currentVersion?.previewSvg) : normalizeNullableText(input.previewSvg),
      previewPng:
        input.previewPng === undefined ? normalizeNullableText(currentVersion?.previewPng) : normalizeNullableText(input.previewPng),
      descriptor:
        input.descriptor === undefined ? normalizeObject(currentVersion?.descriptor) : normalizeObject(input.descriptor),
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Agent patch'
    })

    await this.writeLog(scope, {
      drawingId: drawing.id,
      versionId: version.id,
      action: 'scene_patched',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: {
        hasXml: Boolean(input.xml),
        hasMermaidSource: Boolean(input.mermaidSource),
        hasPreview: Boolean(input.previewSvg || input.previewPng)
      }
    })

    return {
      success: true,
      message: 'draw.io diagram patch was saved as a new version.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async saveMermaidDraft(scope: DrawioScope, input: SaveDrawioMermaidDraftInput) {
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
      xml: null,
      mermaidSource,
      previewSvg: null,
      previewPng: null,
      descriptor: {
        format: 'mermaid',
        data: mermaidSource
      },
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
      message: 'Mermaid draft was saved. Open it in the draw.io workbench to convert and continue editing.',
      drawing: await this.getDrawing(scope, drawing.id as string),
      version
    }
  }

  async searchDrawings(scope: DrawioScope, query: SearchDrawioDrawingsInput = {}) {
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

  async getDrawing(scope: DrawioScope, drawingId: string) {
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
        hasXml: versions.some((version) => Boolean(version.xml)),
        hasMermaidDraft: versions.some((version) => Boolean(version.mermaidSource))
      }
    }
  }

  async getWorkbenchData(scope: DrawioScope, query: SearchDrawioDrawingsInput & { drawingId?: string } = {}) {
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

  async updateDrawingStatus(scope: DrawioScope, input: UpdateDrawioDrawingStatusInput) {
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
      message: 'draw.io diagram status was updated.',
      item: updated
    }
  }

  async restoreVersion(scope: DrawioScope, drawingId: string, versionId: string, changeSummary?: string) {
    const drawing = await this.requireDrawing(scope, drawingId)
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { id: versionId, drawingId })
    })
    if (!version) {
      throw new NotFoundException('draw.io diagram version was not found.')
    }

    const restored = await this.createVersion(scope, drawing, {
      sourceType: 'restore',
      xml: normalizeNullableText(version.xml),
      mermaidSource: normalizeNullableText(version.mermaidSource),
      previewSvg: normalizeNullableText(version.previewSvg),
      previewPng: normalizeNullableText(version.previewPng),
      descriptor: normalizeObject(version.descriptor),
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
      message: 'draw.io diagram version was restored.',
      drawing: await this.getDrawing(scope, drawingId),
      version: restored
    }
  }

  async reportFailure(scope: DrawioScope, input: ReportDrawioFailureInput) {
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
      message: 'draw.io diagram failure was recorded.',
      log
    }
  }

  private async createVersion(
    scope: DrawioScope,
    drawing: DrawioDrawing,
    input: DrawioSceneInput & {
      sourceType: DrawioVersionSource
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
        xml: normalizeNullableText(input.xml),
        mermaidSource: normalizeNullableText(input.mermaidSource),
        previewSvg: normalizeNullableText(input.previewSvg),
        previewPng: normalizeNullableText(input.previewPng),
        descriptor: normalizeObject(input.descriptor),
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
        sourceType: input.sourceType,
        versionNumber,
        hasXml: Boolean(input.xml),
        hasMermaidSource: Boolean(input.mermaidSource),
        hasPreview: Boolean(input.previewSvg || input.previewPng)
      }
    })

    return version
  }

  private async getCurrentVersion(scope: DrawioScope, drawing: DrawioDrawing) {
    if (!drawing.currentVersionId) {
      return null
    }
    return this.versionRepository.findOne({
      where: scopedWhere(scope, { id: drawing.currentVersionId, drawingId: drawing.id as string })
    })
  }

  private async requireDrawing(scope: DrawioScope, drawingId: string) {
    const id = normalizeRequired(drawingId, 'Diagram id is required.')
    const drawing = await this.drawingRepository.findOne({
      where: scopedWhere(scope, { id })
    })
    if (!drawing) {
      throw new NotFoundException('draw.io diagram was not found.')
    }
    return drawing
  }

  private async writeLog(
    scope: DrawioScope,
    input: {
      drawingId?: string
      versionId?: string
      action: DrawioActionType
      actorType: DrawioActorType
      message?: string
      errorMessage?: string
      snapshot?: unknown
    }
  ) {
    return this.logRepository.save(
      this.logRepository.create({
        ...scopedCreate(scope),
        drawingId: input.drawingId,
        versionId: input.versionId,
        action: input.action,
        actorType: input.actorType,
        actorId: scope.userId ?? scope.assistantId ?? null,
        message: normalizeOptional(input.message),
        errorMessage: normalizeOptional(input.errorMessage),
        snapshot: input.snapshot
      })
    )
  }
}

function scopedCreate(scope: DrawioScope): ScopedEntity {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null
  }
}

function scopedWhere<T extends Record<string, unknown>>(scope: DrawioScope, extra?: T): ScopedEntity & T {
  return {
    ...scopedCreate(scope),
    ...(extra ?? ({} as T))
  }
}

function hasSceneContent(input: DrawioSceneInput) {
  return Boolean(
    normalizeNullableText(input.xml) ||
      normalizeNullableText(input.mermaidSource) ||
      normalizeNullableText(input.previewSvg) ||
      normalizeNullableText(input.previewPng) ||
      (isPlainObject(input.descriptor) && Object.keys(input.descriptor).length > 0)
  )
}

function normalizeRequired(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(message)
  }
  return value.trim()
}

function normalizeOptional(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isString).map((item) => item.trim()).filter(Boolean) : []
}

function normalizeObject(value: unknown) {
  return isPlainObject(value) ? value : {}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
