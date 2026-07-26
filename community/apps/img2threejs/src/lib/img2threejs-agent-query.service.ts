import { createHash } from 'node:crypto'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import type { ProjectStatus, Scope } from './domain/types.js'
import { ImageEvidenceEntity, ModelProjectEntity } from './entities/index.js'
import {
  requireRevision,
  scopedIdWhere,
  scopedProjectWhere
} from './img2threejs.service-support.js'
import {
  ArtifactsAdapter,
  WorkspaceFilesAdapter,
  toPortableReference
} from './platform/capability-adapters.js'

const MULTIMODAL_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_MULTIMODAL_IMAGE_BYTES = 12_000_000

export type ReferenceImageAttachment = {
  type: 'img2threejs.reference-image'
  projectId: string
  revision: number
  evidenceId: string
  label: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
  sha256: string
  dataUrl: string
}

@Injectable()
export class Img2ThreeJsAgentQueryService {
  private readonly artifacts: ArtifactsAdapter
  private readonly workspaceFiles: WorkspaceFilesAdapter

  constructor(
    @InjectRepository(ModelProjectEntity)
    private readonly projects: Repository<ModelProjectEntity>,
    @InjectRepository(ImageEvidenceEntity)
    private readonly images: Repository<ImageEvidenceEntity>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    runtimeCapabilities?: RuntimeCapabilityRegistry
  ) {
    this.artifacts = new ArtifactsAdapter(runtimeCapabilities)
    this.workspaceFiles = new WorkspaceFilesAdapter(runtimeCapabilities)
  }

  async listProjects(scope: Scope, input: {
    status?: ProjectStatus
    search?: string
    page: number
    pageSize: number
  }) {
    const builder = this.projects.createQueryBuilder('project')
      .where('project.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere(
        scope.organizationId
          ? 'project.organizationId = :organizationId'
          : 'project.organizationId IS NULL',
        scope.organizationId ? { organizationId: scope.organizationId } : {}
      )
      .orderBy('project.updatedAt', 'DESC')
      .addOrderBy('project.id', 'ASC')
      .skip((input.page - 1) * input.pageSize)
      .take(input.pageSize)
    if (input.status) builder.andWhere('project.status = :status', { status: input.status })
    if (input.search) {
      builder.andWhere('LOWER(project.name) LIKE :search', {
        search: `%${input.search.toLowerCase()}%`
      })
    }
    const [items, total] = await builder.getManyAndCount()
    return {
      items: items.map((project) => ({
        projectId: project.id,
        name: project.name,
        route: project.route,
        modelingMode: project.modelingMode,
        status: project.status,
        revision: project.revision,
        nextDecision: project.nextDecision,
        updatedAt: project.updatedAt.toISOString()
      })),
      total,
      page: input.page,
      pageSize: input.pageSize
    }
  }

  async listEvidence(scope: Scope, input: {
    projectId: string
    expectedRevision?: number
  }) {
    const project = await this.requireProject(scope, input.projectId)
    if (input.expectedRevision !== undefined) {
      requireRevision(project.revision, input.expectedRevision)
    }
    const evidence = await this.images.find({
      where: scopedProjectWhere(scope, project.id),
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 12
    })
    return {
      projectId: project.id,
      revision: project.revision,
      modelingMode: project.modelingMode,
      images: evidence.map((image) => ({
        evidenceId: image.id,
        label: image.label,
        view: image.view,
        admissionStatus: image.admissionStatus,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        sha256: image.sha256,
        confidence: image.confidence,
        failureReasons: image.failureReasons
      }))
    }
  }

  async readEvidence(scope: Scope, input: {
    projectId: string
    evidenceId: string
    expectedRevision?: number
  }) {
    const project = await this.requireProject(scope, input.projectId)
    if (input.expectedRevision !== undefined) {
      requireRevision(project.revision, input.expectedRevision)
    }
    const image = await this.images.findOne({ where: scopedIdWhere(scope, input.evidenceId) })
    if (!image || image.projectId !== project.id) throw new Error('REFERENCE_IMAGE_NOT_FOUND')
    const previewUrl = image.admissionStatus === 'admitted'
      ? await this.artifacts.createReferenceImagePreview(scope, {
          evidenceId: image.id,
          label: image.label,
          asset: image.asset
        })
      : null
    return {
      projectId: project.id,
      revision: project.revision,
      modelingMode: project.modelingMode,
      evidence: {
        evidenceId: image.id,
        label: image.label,
        view: image.view,
        admissionStatus: image.admissionStatus,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        sha256: image.sha256,
        observations: image.observations,
        previewUrl,
        workspaceFile: image.admissionStatus === 'admitted'
          ? toPortableReference(image.asset)
          : null
      },
      semanticAnalysisOwner: 'agent-chat',
      nextAction: image.admissionStatus === 'admitted'
        ? 'inspect_image_multimodally'
        : 'request_input'
    }
  }

  async readEvidenceImage(scope: Scope, input: {
    projectId: string
    evidenceId: string
    expectedRevision?: number
  }): Promise<ReferenceImageAttachment> {
    const project = await this.requireProject(scope, input.projectId)
    if (input.expectedRevision !== undefined) {
      requireRevision(project.revision, input.expectedRevision)
    }
    const image = await this.images.findOne({ where: scopedIdWhere(scope, input.evidenceId) })
    if (!image || image.projectId !== project.id) throw new Error('REFERENCE_IMAGE_NOT_FOUND')
    if (image.admissionStatus !== 'admitted') {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image was not admitted.')
    }
    if (!MULTIMODAL_IMAGE_MIME_TYPES.has(image.mimeType)) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image MIME type is not supported.')
    }
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) ||
      (image.width ?? 0) <= 0 || (image.height ?? 0) <= 0) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image dimensions are unavailable.')
    }
    if (image.asset.tenantId !== scope.tenantId ||
      image.asset.userId !== scope.userId ||
      image.asset.projectId !== (scope.projectId ?? undefined)) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image scope does not match the Agent session.')
    }
    const resolved = await this.workspaceFiles.read(scope, image.asset.filePath)
    if (resolved.buffer.length > MAX_MULTIMODAL_IMAGE_BYTES) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image exceeds the multimodal attachment limit.')
    }
    if (!hasExpectedImageSignature(resolved.buffer, image.mimeType)) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image bytes do not match the admitted MIME type.')
    }
    const sha256 = createHash('sha256').update(resolved.buffer).digest('hex')
    if (sha256 !== image.sha256 || sha256 !== image.asset.sha256) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image checksum changed after admission.')
    }
    const mimeType = image.mimeType as ReferenceImageAttachment['mimeType']
    return {
      type: 'img2threejs.reference-image',
      projectId: project.id,
      revision: project.revision,
      evidenceId: image.id,
      label: image.label,
      mimeType,
      width: image.width as number,
      height: image.height as number,
      sha256,
      dataUrl: `data:${mimeType};base64,${resolved.buffer.toString('base64')}`
    }
  }

  private async requireProject(scope: Scope, id: string): Promise<ModelProjectEntity> {
    const project = await this.projects.findOne({ where: scopedIdWhere(scope, id) })
    if (!project) throw new Error('PROJECT_NOT_FOUND')
    return project
  }
}

function hasExpectedImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  return false
}
