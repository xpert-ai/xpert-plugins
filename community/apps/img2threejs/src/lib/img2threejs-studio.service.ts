import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import { BUILD_STAGES, IMG2THREEJS_ARTIFACT_NAMESPACE } from './constants.js'
import { createImageDerivedSculptSpec } from './domain/image-derived-sculpt-spec.js'
import { analyzeImageRelief } from './domain/image-relief-analysis.js'
import type { BuildStage, ModelingMode, ModelRoute, Scope } from './domain/types.js'
import { ImageEvidenceEntity, ModelProjectEntity } from './entities/index.js'
import { Img2ThreeJsService } from './img2threejs.service.js'
import {
  requireRevision,
  scopedIdWhere,
  scopedProjectWhere
} from './img2threejs.service-support.js'
import { WorkspaceFilesAdapter } from './platform/capability-adapters.js'

const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type StudioImageView = ImageEvidenceEntity['view']

@Injectable()
export class Img2ThreeJsStudioService {
  private readonly workspaceFiles: WorkspaceFilesAdapter

  constructor(
    @InjectRepository(ModelProjectEntity)
    private readonly projects: Repository<ModelProjectEntity>,
    @InjectRepository(ImageEvidenceEntity)
    private readonly images: Repository<ImageEvidenceEntity>,
    private readonly service: Img2ThreeJsService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    runtimeCapabilities?: RuntimeCapabilityRegistry
  ) {
    this.workspaceFiles = new WorkspaceFilesAdapter(runtimeCapabilities)
  }

  createProject(scope: Scope, input: {
    name: string
    route: ModelRoute
    modelingMode: ModelingMode
  }) {
    return this.service.createProject(scope, input)
  }

  async uploadReference(scope: Scope, input: {
    projectId: string
    baseRevision: number
    label: string
    view: StudioImageView
    fileName: string
    mimeType: string
    buffer: Buffer
  }) {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (!ACCEPTED_IMAGE_TYPES.has(input.mimeType)) throw new Error('UNSUPPORTED_IMAGE_TYPE')
    if (input.buffer.length === 0) throw new Error('EMPTY_IMAGE')
    const fileName = safeFileName(input.fileName)
    const asset = await this.workspaceFiles.write(scope, {
      folder: `${IMG2THREEJS_ARTIFACT_NAMESPACE}/${project.id}/references`,
      fileName,
      mimeType: input.mimeType,
      buffer: input.buffer
    })
    return this.service.submitImages(scope, {
      projectId: project.id,
      baseRevision: input.baseRevision,
      images: [{
        filePath: asset.filePath,
        label: input.label,
        view: input.view
      }]
    })
  }

  async startGeneration(scope: Scope, input: {
    projectId: string
    baseRevision: number
  }) {
    let project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (project.modelingMode === 'semantic-3d') {
      const evidence = await this.images.find({
        where: {
          ...scopedProjectWhere(scope, project.id),
          admissionStatus: 'admitted'
        },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 12
      })
      if (evidence.length === 0) throw new Error('ADMITTED_IMAGE_REQUIRED')
      const evidenceIds = evidence.map((item) => item.id)
      return {
        projectId: project.id,
        revision: project.revision,
        status: project.status,
        semanticAnalysisOwner: 'agent-chat' as const,
        nextAction: 'ask_agent_to_analyze_evidence' as const,
        evidenceIds,
        suggestedPrompt: buildSemanticGenerationPrompt({
          projectId: project.id,
          projectName: project.name,
          revision: project.revision,
          evidenceIds
        })
      }
    }
    const status = await this.service.getStatus(scope, project.id)
    if (
      status.status === 'queued' ||
      status.status === 'running' ||
      (status.runId && status.completedStages.length > 0 && status.completedStages.length < BUILD_STAGES.length)
    ) {
      return this.enqueueNextStage(scope, project)
    }
    const evidence = await this.images.find({
      where: { ...scopedProjectWhere(scope, project.id), admissionStatus: 'admitted' },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 12
    })
    if (evidence.length === 0) throw new Error('ADMITTED_IMAGE_REQUIRED')

    const primary = selectPrimaryEvidence(evidence)
    const source = await this.workspaceFiles.read(scope, primary.asset.filePath)
    if (source.asset.sha256 !== primary.sha256) throw new Error('REFERENCE_IMAGE_CHECKSUM_MISMATCH')
    const analysis = await analyzeImageRelief(source.buffer, primary.mimeType)
    const spec = createImageDerivedSculptSpec({
      projectName: project.name,
      route: project.route,
      primaryEvidenceId: primary.id,
      evidence: evidence.map(({ id, view }) => ({ id, view })),
      analysis
    })
    const updated = await this.service.updateSpec(scope, {
      projectId: project.id,
      baseRevision: project.revision,
      spec,
      confidence: analysis.confidence,
      changeSummary: `Created ${analysis.algorithm} Sculpt Spec from admitted image pixels.`
    })
    if (updated.validationStatus !== 'valid') throw new Error('IMAGE_DERIVED_SCULPT_SPEC_INVALID')
    return this.service.enqueueStage(scope, {
      projectId: project.id,
      baseRevision: updated.revision,
      stage: 'blockout'
    })
  }

  async advanceGeneration(scope: Scope, input: {
    projectId: string
    baseRevision: number
  }) {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    return this.enqueueNextStage(scope, project)
  }

  private async enqueueNextStage(scope: Scope, project: ModelProjectEntity) {
    const status = await this.service.getStatus(scope, project.id)
    if (status.status === 'queued' || status.status === 'running') {
      return {
        projectId: project.id,
        revision: status.revision,
        runId: status.runId,
        runRevision: status.runRevision,
        status: status.status,
        stage: status.currentStage,
        cursor: status.cursor,
        nextAction: 'wait_run' as const
      }
    }
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(status.status === 'failed' ? 'PIPELINE_REFINEMENT_REQUIRED' : 'PIPELINE_CANCELLED')
    }
    if (status.nextDecision !== 'continue') throw new Error('PIPELINE_DECISION_BLOCKED')
    const completed = new Set(status.completedStages)
    const stage = BUILD_STAGES.find((candidate) => !completed.has(candidate)) ?? null
    if (!stage) {
      return {
        projectId: project.id,
        revision: status.revision,
        runId: status.runId,
        runRevision: status.runRevision,
        status: status.status,
        stage: null,
        cursor: status.cursor,
        nextAction: 'submit_review' as const
      }
    }
    return this.service.enqueueStage(scope, {
      projectId: project.id,
      baseRevision: status.revision,
      stage: stage satisfies BuildStage
    })
  }

  private async requireProject(scope: Scope, projectId: string): Promise<ModelProjectEntity> {
    const project = await this.projects.findOne({ where: scopedIdWhere(scope, projectId) })
    if (!project) throw new Error('PROJECT_NOT_FOUND')
    return project
  }
}

function buildSemanticGenerationPrompt(input: {
  projectId: string
  projectName: string
  revision: number
  evidenceIds: string[]
}): string {
  const context = {
    intent: 'regenerate_from_references',
    projectId: input.projectId,
    projectName: input.projectName,
    baseRevision: input.revision,
    admittedEvidenceIds: input.evidenceIds
  }
  return [
    '使用已安装的 img2threejs-semantic-modeling Skill 执行本次语义重建，并实际调用其中规定的 middleware tools。',
    `宿主可信任务上下文：${JSON.stringify(context)}`,
    '严格使用上述项目、版本和证据；如有 changes_requested 审核，先读取其 notes。所有只读上下文读取完成后，必须对每个 admittedEvidenceId 调用 read_evidence，并使用同一 revision 写入新 Spec；后端会拒绝未在当前轮次复核像素的 update_spec。无法读取真实像素时选择 request-input。'
  ].join('\n')
}

function selectPrimaryEvidence(evidence: ImageEvidenceEntity[]): ImageEvidenceEntity {
  return evidence.find((item) => item.view === 'front') ??
    evidence.find((item) => item.view === 'three-quarter') ??
    evidence[0]!
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 120)
  return normalized || 'reference-image'
}
