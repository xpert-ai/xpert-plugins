import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { ContentEditorProvider, ContentResourceProvider, ProjectAccessRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type ContentCatalogProvider, type ContentDocumentScope, type ContentResourceRequest, type IContentResourceProvider } from '@xpert-ai/plugin-sdk'
import type { ResourceContentEditorRegistration } from '@xpert-ai/contracts'
import { MotionProject, MotionActionLog } from '../entities/index.js'
import { MOTION_PROVIDER_KEY, MOTION_WORKBENCH_VIEW_KEY, MOTION_REMOTE_ENTRY_KEY } from '../constants.js'
import { evidenceComposition } from './composition.js'
import { authorizeEvidenceSource } from './access.js'

export const MOTION_EVIDENCE_PROVIDER = 'motion.evidence-video'
const model = { typeId: 'video', modelId: 'motion.evidence-video', schemaVersion: '1', editProtocol: { id: 'motion.cas', version: '1' } }
const editor = 'motion.evidence-editor'
const where = (scope: ContentDocumentScope) => ({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId, projectId: scope.projectId, contentModel: model.modelId })
@Injectable()
@ContentEditorProvider(editor)
export class MotionEvidenceEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: editor, protocolVersion: 2, title: 'Motion evidence video',
    view: { providerKey: MOTION_PROVIDER_KEY, viewKey: MOTION_WORKBENCH_VIEW_KEY, entry: MOTION_REMOTE_ENTRY_KEY }, supports: [{ ...model, access: ['view', 'edit'] }] }
}
@Injectable()
@ContentResourceProvider(MOTION_EVIDENCE_PROVIDER)
export class MotionEvidenceContent implements IContentResourceProvider {
  readonly title = 'Motion evidence videos'
  constructor(@InjectRepository(MotionProject) private readonly projects: Repository<MotionProject>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  private async access(scope: ContentDocumentScope, write = false) {
    const api = this.runtime.require(ProjectAccessRuntimeCapability)
    const access = scope.assistantId ? await api.assertAssistant({ ...scope, assistantId: scope.assistantId })
      : (await api.listReadable({ actor: scope.actor, projectIds: [scope.projectId] }))[0]
    if (!access) throw new ForbiddenException('MOTION_PROJECT_DENIED')
    if (write) await api.assertEdit(scope)
    return access
  }
  private async read(scope: ContentDocumentScope, id: string) {
    await this.access(scope)
    const project = await this.projects.findOneBy({ ...where(scope), id })
    if (!project) throw new ForbiddenException('MOTION_PROJECT_DENIED')
    await authorizeEvidenceSource(this.runtime, { ...scope.actor, projectId: scope.projectId }, project)
    return project
  }
  readonly catalog: ContentCatalogProvider = {
    acceptedTransferSchemas: ['xpert.content-analysis-transfer@1'],
    types: [{ ...model, title: { en_US: 'Evidence video', zh_Hans: '数据叙事视频' }, implementationKey: 'motion-evidence-video',
      implementationTitle: { en_US: 'Motion video from evidence', zh_Hans: 'Motion 证据视频' }, defaultEditorKey: editor }],
    discover: async scope => { await this.access(scope); const offset = Number(scope.cursor ?? 0)
      if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequestException('MOTION_CURSOR_INVALID')
      const rows = await this.projects.find({ where: where(scope), order: { id: 'ASC' }, take: 100, skip: offset })
      return { resourceIds: rows.map(row => row.id!), ...(rows.length === 100 ? { nextCursor: String(offset + 100) } : {}) } },
    describe: async scope => { const project = await this.read(scope, scope.sourceResourceId)
      return { ...model, projectId: scope.projectId, title: project.title, revision: String(project.workingCopyRevision), updatedAt: project.updatedAt!.toISOString(),
        deleted: project.status === 'archived', source: { kind: 'managed' }, defaultEditorKey: editor, allowedActions: [],
        preview: { kind: 'outline', revision: String(project.workingCopyRevision), lines: [project.title, project.sourceEvidence?.sha256 ?? ''] } } },
    create: async scope => {
      if (scope.implementationKey !== 'motion-evidence-video' || scope.templateId || scope.initialContent?.schema !== 'xpert.content-analysis-transfer@1') throw new BadRequestException('MOTION_EVIDENCE_REQUIRED')
      await this.access(scope, true); z.string().uuid().parse(scope.requestId); z.string().min(1).max(200).parse(scope.title)
      const evidence = scope.initialContent.evidence, composition = evidenceComposition(evidence)
      const requestHash = createHash('sha256').update(JSON.stringify({ title: scope.title, transfer: scope.initialContent })).digest('hex')
      const checksum = createHash('sha256').update('video\nhyperframes\n' + composition.html).digest('hex')
      await this.projects.manager.transaction(async manager => {
        const inserted = await manager.getRepository(MotionProject).createQueryBuilder().insert().values({ ...where(scope), id: scope.requestId,
          title: scope.title, createdById: scope.actor.userId, assistantId: scope.assistantId, surface: 'video', status: 'draft', videoEngine: 'hyperframes',
          hyperframesHtml: composition.html, workingCopyRevision: 1, currentVersionNumber: 0, artifactChecksum: checksum, createRequestHash: requestHash,
          sourceEvidence: { id: evidence.id, sha256: evidence.sha256, initialChecksum: checksum, source: evidence.source },
          lastEditedById: scope.actor.userId, lastEditedAt: new Date(), workspaceCatalog: 'projects', workspaceScopeId: scope.projectId }).orIgnore().returning('id').execute()
        const project = await manager.getRepository(MotionProject).findOneBy({ ...where(scope), id: scope.requestId })
        if (!project || project.createRequestHash !== requestHash) throw new ConflictException('MOTION_REQUEST_CONFLICT')
        if (Array.isArray(inserted.raw) && inserted.raw.length) await manager.getRepository(MotionActionLog).save({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
          projectId: scope.projectId, motionProjectId: scope.requestId, action: 'project_created', actorType: 'user', actorId: scope.actor.userId,
          message: 'Created a fixed evidence video draft', snapshot: { evidenceId: evidence.id, sha256: evidence.sha256 } })
      })
      await this.access(scope, true)
      return { providerKey: MOTION_EVIDENCE_PROVIDER, resourceId: scope.requestId }
    }
  }
  async authorize(input: ContentResourceRequest) {
    const project = await this.projects.findOneBy({ tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, id: input.resourceId, contentModel: model.modelId })
    if (!project?.projectId) throw new ForbiddenException('MOTION_PROJECT_DENIED')
    const access = await this.access({ actor: input.actor, projectId: project.projectId }, input.operation !== 'read')
    await authorizeEvidenceSource(this.runtime, { ...input.actor, projectId: project.projectId }, project)
    return { providerKey: MOTION_EVIDENCE_PROVIDER, resourceId: project.id!, title: project.title, role: access.role,
      canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role), canManage: access.canManage }
  }
}
