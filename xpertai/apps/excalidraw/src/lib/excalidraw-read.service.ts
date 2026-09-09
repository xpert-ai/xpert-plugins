import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ExcalidrawDrawing, ExcalidrawDrawingVersion } from './entities/index.js'
import { ExcalidrawService } from './excalidraw.service.js'
import { excalidrawUnitOfWork } from './excalidraw-unit-of-work.js'
import { scopedWhere } from './excalidraw-service.utils.js'
import type { ExcalidrawScope, SearchExcalidrawDrawingsInput } from './types.js'
import { normalizeExcalidrawScene } from './excalidraw-scene.validation.js'
import { jsonValueSchema } from './tools/contracts.js'

export function drawingSummary(drawing: ExcalidrawDrawing) {
  return {
    id: drawing.id,
    title: drawing.title,
    description: drawing.description ?? null,
    kind: drawing.kind,
    status: drawing.status,
    revision: drawing.revision ?? 0,
    currentVersionId: drawing.currentVersionId ?? null,
    currentVersionNumber: drawing.currentVersionNumber ?? 0,
    tags: drawing.tags ?? [],
    updatedAt: drawing.updatedAt?.toISOString()
  }
}
export function versionSummary(version: ExcalidrawDrawingVersion) {
  return {
    id: version.id,
    drawingId: version.drawingId,
    versionNumber: version.versionNumber,
    sourceType: version.sourceType,
    changeSummary: version.changeSummary ?? null,
    createdAt: version.createdAt?.toISOString(),
    isCheckpoint: version.isCheckpoint ?? false
  }
}
@Injectable()
export class ExcalidrawReadService {
  constructor(
    private readonly drawings: ExcalidrawService,
    @InjectRepository(ExcalidrawDrawing) private readonly baseDrawings: Repository<ExcalidrawDrawing>,
    @InjectRepository(ExcalidrawDrawingVersion) private readonly baseVersions: Repository<ExcalidrawDrawingVersion>
  ) {}
  private get drawingRepository() {
    return excalidrawUnitOfWork.getStore()?.manager.getRepository(ExcalidrawDrawing) ?? this.baseDrawings
  }
  private get versions() {
    return excalidrawUnitOfWork.getStore()?.manager.getRepository(ExcalidrawDrawingVersion) ?? this.baseVersions
  }

  async search(scope: ExcalidrawScope, input: SearchExcalidrawDrawingsInput) {
    const page = input.page ?? 1,
      pageSize = input.pageSize ?? 20
    const query = this.drawingRepository.createQueryBuilder('drawing').where(scopedWhere(scope))
    if (input.status) query.andWhere('drawing.status = :status', { status: input.status })
    if (input.kind) query.andWhere('drawing.kind = :kind', { kind: input.kind })
    if (input.search)
      query.andWhere(
        '(drawing.title ILIKE :search OR drawing.description ILIKE :search OR CAST(drawing.tags AS text) ILIKE :search)',
        { search: `%${input.search.replace(/[\\%_]/g, '\\$&')}%` }
      )
    query.select([
      'drawing.id',
      'drawing.title',
      'drawing.description',
      'drawing.kind',
      'drawing.status',
      'drawing.tags',
      'drawing.revision',
      'drawing.currentVersionId',
      'drawing.currentVersionNumber',
      'drawing.updatedAt'
    ])
    const [items, total] = await query
      .orderBy('drawing.updatedAt', 'DESC')
      .addOrderBy('drawing.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()
    return { items: items.map(drawingSummary), total, page, pageSize, hasMore: page * pageSize < total }
  }
  async snapshot(scope: ExcalidrawScope, drawingId: string, versionId?: string, versionNumber?: number) {
    const drawing = await this.drawings.requireCanonicalDrawing(scope, drawingId)
    const version =
      versionId || versionNumber !== undefined
        ? await this.versions.findOne({
            where: scopedWhere(scope, { drawingId, ...(versionId ? { id: versionId } : { versionNumber }) })
          })
        : await this.drawings.getCurrentVersion(scope, drawing)
    if ((versionId || versionNumber !== undefined) && !version) throw new NotFoundException('version_not_found')
    return { drawing, version }
  }
  async listVersions(scope: ExcalidrawScope, drawingId: string, page = 1, pageSize = 20) {
    await this.drawings.requireDrawing(scope, drawingId)
    const [items, total] = await this.versions.findAndCount({
      where: scopedWhere(scope, { drawingId }),
      select: {
        id: true,
        drawingId: true,
        versionNumber: true,
        sourceType: true,
        changeSummary: true,
        createdAt: true,
        isCheckpoint: true
      },
      order: { versionNumber: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    return { drawingId, items: items.map(versionSummary), total, page, pageSize }
  }
  async get(
    scope: ExcalidrawScope,
    input: {
      drawingId: string
      versionId?: string
      versionNumber?: number
      versionLimit?: number
      includeScene?: boolean
      elementOffset?: number
      elementLimit?: number
    }
  ) {
    const { drawing, version } = await this.snapshot(scope, input.drawingId, input.versionId, input.versionNumber)
    const elements = normalizeExcalidrawScene(version ?? {}).elements,
      offset = input.elementOffset ?? 0,
      limit = input.elementLimit ?? 50
    const refs = input.includeScene
      ? elements
          .slice(offset, offset + limit)
          .map((element) => ({
            id: String(element.id),
            type: String(element.type),
            ...(typeof element.text === 'string' ? { text: element.text.slice(0, 240) } : {})
          }))
      : []
    return {
      drawingId: drawing.id,
      item: drawingSummary(drawing),
      sceneRevision: drawing.revision ?? 0,
      elementRefs: refs,
      elementTotal: elements.length,
      hasMore: input.includeScene ? offset + limit < elements.length : false
    }
  }
  async item(
    scope: ExcalidrawScope,
    input: {
      drawingId: string
      itemType: 'element' | 'appState' | 'mermaidSource' | 'file'
      elementId?: string
      fileId?: string
      versionId?: string
      versionNumber?: number
    }
  ) {
    const { drawing, version } = await this.snapshot(scope, input.drawingId, input.versionId, input.versionNumber)
    let item: object | string | null = null
    if (input.itemType === 'element')
      item = normalizeExcalidrawScene(version ?? {}).elements.find((element) => element.id === input.elementId) ?? null
    if (input.itemType === 'appState') item = version?.appState ?? {}
    if (input.itemType === 'mermaidSource') item = version?.mermaidSource ?? ''
    if (input.itemType === 'file') {
      const file = version?.files?.[input.fileId]
      const parsed = jsonValueSchema.parse(file ?? null)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        item = { fileId: input.fileId, mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : null }
    }
    if (item === null) throw new NotFoundException('scene_item_not_found')
    return {
      drawingId: drawing.id,
      sceneRevision: drawing.revision ?? 0,
      itemType: input.itemType,
      item: jsonValueSchema.parse(item)
    }
  }
}
