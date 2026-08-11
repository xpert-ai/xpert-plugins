import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import type {
  HumanReviewStatus,
  ModelRoute,
  NextDecision,
  Scope,
  WorkspaceAssetReference,
  StageGateResult
} from './domain/types.js'
import { SculptSpecSchema } from './domain/sculpt-spec.schema.js'
import {
  ImageEvidenceEntity,
  ModelProjectEntity,
  PipelineRunEntity,
  SculptSpecVersionEntity
} from './entities/index.js'
import { Img2ThreeJsService } from './img2threejs.service.js'
import { ArtifactsAdapter } from './platform/capability-adapters.js'
import { toViewerScene, type ViewerSceneDto } from './contracts/viewer-scene.js'
import {
  scopedIdWhere,
  scopedProjectWhere,
  statusDto,
  type RunStatusDto
} from './img2threejs.service-support.js'

@Injectable()
export class Img2ThreeJsWorkbenchService {
  private readonly artifacts: ArtifactsAdapter

  constructor(
    @InjectRepository(ModelProjectEntity)
    private readonly projects: Repository<ModelProjectEntity>,
    @InjectRepository(ImageEvidenceEntity)
    private readonly images: Repository<ImageEvidenceEntity>,
    @InjectRepository(PipelineRunEntity)
    private readonly runs: Repository<PipelineRunEntity>,
    @InjectRepository(SculptSpecVersionEntity)
    private readonly specs: Repository<SculptSpecVersionEntity>,
    private readonly service: Img2ThreeJsService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    runtimeCapabilities?: RuntimeCapabilityRegistry
  ) {
    this.artifacts = new ArtifactsAdapter(runtimeCapabilities)
  }

  async getData(scope: Scope, query: {
    projectId?: string
    page?: number
    pageSize?: number
    search?: string
  }): Promise<{
    tableKey: 'projects'
    table: {
      key: 'projects'
      items: Array<{
        id: string
        name: string
        route: ModelRoute
        modelingMode: ModelProjectEntity['modelingMode']
        status: string
        revision: number
        confidence: number
        humanReviewStatus: HumanReviewStatus
        nextDecision: NextDecision
        updatedAt: string
      }>
      total: number
      page: number
      pageSize: number
    }
    selected: null | {
      project: RunStatusDto & {
        name: string
        route: ModelRoute
        modelingMode: ModelProjectEntity['modelingMode']
        confidence: number
      }
      images: Array<{
        id: string
        label: string
        view: string
        admissionStatus: string
        sha256: string
        width: number | null
        height: number | null
        confidence: number
        foregroundCoverage: number | null
        largestComponentFraction: number | null
        maskConfidence: number | null
        pHash: string | null
        viewpointConfidence: number | null
        requestInputReason: string | null
        previewFileKey: string
        previewUrl: string | null
      }>
      stages: StageGateResult[]
      viewerScene: ViewerSceneDto | null
      artifact: Awaited<ReturnType<Img2ThreeJsService['readArtifact']>>
    }
  }> {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(50, query.pageSize ?? 20))
    const builder = this.projects.createQueryBuilder('project')
      .where('project.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere(
        scope.organizationId ? 'project.organizationId = :organizationId' : 'project.organizationId IS NULL',
        scope.organizationId ? { organizationId: scope.organizationId } : {}
      )
      .orderBy('project.updatedAt', 'DESC')
      .addOrderBy('project.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
    if (query.search?.trim()) {
      builder.andWhere('LOWER(project.name) LIKE :search', { search: `%${query.search.trim().toLowerCase()}%` })
    }
    const [projects, total] = await builder.getManyAndCount()
    let selected = null
    if (query.projectId) {
      const snapshot = await this.readStableProjectRun(scope, query.projectId)
      const { project, run } = snapshot
      const images = await this.images.find({
        where: scopedProjectWhere(scope, project.id),
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 50
      })
      const spec = project.currentSpecVersionId
        ? await this.specs.findOne({ where: scopedIdWhere(scope, project.currentSpecVersionId) })
        : null
      const currentCodeReady = await this.service.hasCurrentAssistantCode(scope, project, spec ?? undefined)
      selected = {
        project: {
          ...statusDto(project, run, currentCodeReady),
          name: project.name,
          route: project.route,
          modelingMode: project.modelingMode,
          confidence: project.confidence
        },
        images: await Promise.all(images.map(async (image) => ({
          id: image.id,
          label: image.label,
          view: image.view,
          admissionStatus: image.admissionStatus,
          sha256: image.sha256,
          width: image.width,
          height: image.height,
          confidence: image.confidence,
          foregroundCoverage: image.foregroundCoverage,
          largestComponentFraction: image.largestComponentFraction,
          maskConfidence: image.maskConfidence,
          pHash: image.pHash,
          viewpointConfidence: image.viewpointConfidence,
          requestInputReason: image.requestInputReason,
          previewFileKey: image.id,
          previewUrl: await this.artifacts.createReferenceImagePreview(scope, {
            evidenceId: image.id,
            label: image.label,
            asset: image.asset
          })
        }))),
        stages: run?.stageResults ?? [],
        viewerScene: validViewerScene(spec),
        artifact: await this.service.readArtifact(scope, project.id)
      }
    }
    return {
      tableKey: 'projects',
      table: {
        key: 'projects',
        items: projects.map((project) => ({
          id: project.id,
          name: project.name,
          route: project.route,
          modelingMode: project.modelingMode,
          status: project.status,
          revision: project.revision,
          confidence: project.confidence,
          humanReviewStatus: project.humanReviewStatus,
          nextDecision: project.nextDecision,
          updatedAt: project.updatedAt.toISOString()
        })),
        total,
        page,
        pageSize
      },
      selected
    }
  }

  private async readStableProjectRun(
    scope: Scope,
    projectId: string
  ): Promise<{ project: ModelProjectEntity; run: PipelineRunEntity | null }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await this.projects.findOne({ where: scopedIdWhere(scope, projectId) })
      if (!before) throw new Error('PROJECT_NOT_FOUND')
      const run = before.activeRunId
        ? await this.runs.findOne({ where: scopedIdWhere(scope, before.activeRunId) })
        : null
      const after = await this.projects.findOne({ where: scopedIdWhere(scope, projectId) })
      if (!after) throw new Error('PROJECT_NOT_FOUND')
      if (before.revision === after.revision && before.activeRunId === after.activeRunId) {
        return { project: after, run }
      }
    }
    const project = await this.projects.findOne({ where: scopedIdWhere(scope, projectId) })
    if (!project) throw new Error('PROJECT_NOT_FOUND')
    const run = project.activeRunId
      ? await this.runs.findOne({ where: scopedIdWhere(scope, project.activeRunId) })
      : null
    return { project, run }
  }

  async resolveReferenceAsset(
    scope: Scope,
    projectId: string,
    evidenceId: string
  ): Promise<WorkspaceAssetReference> {
    const image = await this.images.findOne({ where: scopedIdWhere(scope, evidenceId) })
    if (!image || image.projectId !== projectId) throw new Error('REFERENCE_IMAGE_NOT_FOUND')
    return image.asset
  }
}

function validViewerScene(spec: SculptSpecVersionEntity | null): ViewerSceneDto | null {
  if (spec?.validationStatus !== 'valid') return null
  const parsed = SculptSpecSchema.safeParse(spec.spec)
  return parsed.success ? toViewerScene(parsed.data) : null
}
