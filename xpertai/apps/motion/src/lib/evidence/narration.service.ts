import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AiModelTypeEnum, type ICopilotModel, type XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import {
  AssistantMiddlewareAccessRuntimeCapability,
  MANAGED_QUEUE_SERVICE_TOKEN,
  PluginJobProcessor,
  SYSTEM_GLOBAL_SCOPE,
  ViewMiddlewareRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeServiceApi,
  type ManagedQueueJob,
  type ManagedQueueService,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { MotionExport, MotionProject } from '../entities/index.js'
import { MOTION_FEATURE, MOTION_MIDDLEWARE_NAME, MOTION_PLUGIN_NAME } from '../constants.js'
import type { MotionJsonObject, MotionScope } from '../types.js'
import { authorizeEvidenceProject, authorizeEvidenceSource } from './access.js'
import { compositionChecksum, narrationInput, narratedComposition, pcmWave } from './narration.js'

const modelSchema = z
  .object({
    copilotId: z.string().uuid(),
    model: z.string().min(1).max(120),
    modelType: z.literal(AiModelTypeEnum.TTS),
    options: z
      .object({ voice: z.string().min(1).max(80).optional() })
      .strict()
      .optional()
  })
  .strip()
const requestSchema = z
  .object({
    projectId: z.string().uuid(),
    requestId: z.string().uuid(),
    expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict()
const queue = 'motion.narration',
  jobName = 'synthesize'
type JobData = { exportId: string; tenantId: string; organizationId: string }

@Injectable()
@PluginJobProcessor({ pluginName: MOTION_PLUGIN_NAME, queueName: queue, jobName, concurrency: 2 })
export class MotionNarrationService {
  constructor(
    @InjectRepository(MotionProject) private readonly projects: Repository<MotionProject>,
    @InjectRepository(MotionExport) private readonly exports: Repository<MotionExport>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry,
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN) private readonly runtime: AgentMiddlewareRuntimeServiceApi,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly jobs: ManagedQueueService
  ) {}
  private async access(scope: MotionScope, project: MotionProject) {
    if (project.contentModel !== 'motion.evidence-video' || !scope.assistantId)
      throw new ConflictException('MOTION_NARRATION_EVIDENCE_REQUIRED')
    await authorizeEvidenceProject(this.capabilities, scope, project, true)
    await authorizeEvidenceSource(this.capabilities, scope, project)
    await this.capabilities
      .require(AssistantMiddlewareAccessRuntimeCapability)
      .assertAccess({
        actor: { tenantId: scope.tenantId, organizationId: scope.organizationId!, userId: scope.userId! },
        assistantId: scope.assistantId,
        scope: { type: 'project', projectId: project.projectId! },
        provider: MOTION_MIDDLEWARE_NAME,
        requiredFeature: MOTION_FEATURE
      })
  }
  async request(context: XpertResolvedViewHostContext, scope: MotionScope, raw: unknown) {
    const input = requestSchema.parse(raw)
    const source = await this.projects.findOneByOrFail({
      id: input.projectId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId!
    })
    await this.access(scope, source)
    const trusted = await this.capabilities
      .require(ViewMiddlewareRuntimeCapability)
      .resolve({ context, provider: MOTION_MIDDLEWARE_NAME, requiredFeature: MOTION_FEATURE })
    const model = modelSchema.parse(trusted.options?.narrationModel)
    if (source.artifactChecksum !== input.expectedChecksum)
      throw new ConflictException('MOTION_NARRATION_SOURCE_CHANGED')
    const evidence = source.sourceEvidence!,
      html = source.hyperframesHtml!
    const narration = narrationInput(html, evidence.id, evidence.sha256, evidence.initialChecksum)
    const hash = createHash('sha256')
      .update(JSON.stringify({ input, actor: scope.userId, model }))
      .digest('hex')
    let record = await this.exports.findOneBy({ id: input.requestId })
    if (record && record.report?.requestHash !== hash) throw new ConflictException('MOTION_NARRATION_REQUEST_CONFLICT')
    if (!record)
      record = await this.exports.manager.transaction(async (manager) => {
        await manager
          .createQueryBuilder()
          .insert()
          .into<Record<string, unknown>>(MotionExport)
          .values({
            id: input.requestId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId!,
            projectId: source.projectId,
            motionProjectId: input.requestId,
            kind: 'wav',
            backend: 'model',
            status: 'queued',
            stage: 'queued',
            progress: 0,
            createdById: scope.userId!,
            assistantId: scope.assistantId!,
            inputChecksum: input.expectedChecksum,
            report: () => ':report'
          })
          .setParameter(
            'report',
            JSON.stringify({
              requestHash: hash,
              sourceProjectId: source.id,
              model,
              text: narration.text,
              compositionHtml: html
            })
          )
          .orIgnore()
          .execute()
        const saved = await manager
          .getRepository(MotionExport)
          .findOneOrFail({ where: { id: input.requestId }, lock: { mode: 'pessimistic_write' } })
        if (saved.report?.requestHash !== hash) throw new ConflictException('MOTION_NARRATION_REQUEST_CONFLICT')
        await manager
          .createQueryBuilder()
          .insert()
          .into<Record<string, unknown>>(MotionProject)
          .values({
            id: input.requestId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId!,
            projectId: source.projectId,
            createdById: scope.userId!,
            assistantId: scope.assistantId!,
            title: source.title + ' · 配音',
            surface: 'video',
            status: 'draft',
            videoEngine: 'hyperframes',
            hyperframesHtml: html,
            workingCopyRevision: 1,
            currentVersionNumber: 0,
            artifactChecksum: source.artifactChecksum,
            contentModel: source.contentModel,
            createRequestHash: hash,
            sourceEvidence: { ...evidence, narrationExportId: input.requestId },
            workspaceCatalog: 'projects',
            workspaceScopeId: source.projectId
          })
          .orIgnore()
          .execute()
        const target = await manager.getRepository(MotionProject).findOneByOrFail({ id: input.requestId })
        if (target.createRequestHash !== hash || target.createdById !== scope.userId)
          throw new ConflictException('MOTION_NARRATION_REQUEST_CONFLICT')
        return saved
      })
    if (record.status === 'queued' && !record.jobId) {
      const queued = await this.jobs.enqueue({
        pluginName: MOTION_PLUGIN_NAME,
        queueName: queue,
        jobName,
        payload: {
          exportId: record.id!,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId!
        } satisfies JobData,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        scopeKey: SYSTEM_GLOBAL_SCOPE,
        jobId: 'motion-narration-' + record.id,
        attempts: 1
      })
      await this.exports.update(record.id!, { jobId: queued.jobId })
    }
    return { projectId: record.motionProjectId, exportId: record.id, status: record.status }
  }
  async handle(job: ManagedQueueJob<JobData>) {
    const record = await this.exports.findOneByOrFail({
      id: job.data.exportId,
      tenantId: job.data.tenantId,
      organizationId: job.data.organizationId
    })
    // Atomic durable claim. Redelivery after a crash must never make a second billable request.
    const claim = await this.exports.update(
      { id: record.id, status: 'queued' },
      { status: 'running', stage: 'synthesizing', progress: 10 }
    )
    if (!claim.affected) return
    const scope: MotionScope = {
      tenantId: record.tenantId!,
      organizationId: record.organizationId,
      userId: record.createdById,
      projectId: record.projectId,
      assistantId: record.assistantId
    }
    const abort = new AbortController(),
      timeout = setTimeout(() => abort.abort(), 90_000)
    try {
      const project = await this.projects.findOneByOrFail({
        id: record.motionProjectId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId!
      })
      await this.access(scope, project)
      const html = String(record.report!.compositionHtml),
        evidence = project.sourceEvidence!
      const input = narrationInput(html, evidence.id, evidence.sha256, evidence.initialChecksum)
      const model = modelSchema.parse(record.report!.model)
      const client = await this.runtime
        .createScopedApi({ ...scope, xpertId: scope.assistantId })
        .createModelClient<BaseChatModel>(model as ICopilotModel, { abortController: abort })
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const chunk of await client.stream(input.text, { signal: abort.signal })) {
        for (const part of Array.isArray(chunk.content) ? chunk.content : []) {
          if (typeof part === 'string' || part.type !== 'audio' || !part.data) continue
          if (
            part.format !== 'pcm_s16le' ||
            part.sampleRate !== 24000 ||
            part.channels !== 1 ||
            typeof part.data !== 'string' ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(part.data)
          )
            throw new Error('MOTION_NARRATION_FORMAT_UNSUPPORTED')
          const data = Buffer.from(part.data, 'base64')
          bytes += data.length
          if (bytes > 48000 * 120) throw new Error('MOTION_NARRATION_AUDIO_LIMIT')
          chunks.push(data)
        }
      }
      abort.signal.throwIfAborted()
      const pcm = Buffer.concat(chunks),
        wav = pcmWave(pcm),
        duration = pcm.length / 48000
      await this.access(scope, project)
      const files = this.capabilities.require(WorkspaceFilesRuntimeCapability)
      const fileScope = {
        tenantId: scope.tenantId,
        userId: scope.userId,
        catalog: 'projects' as const,
        scopeId: project.projectId!,
        projectId: project.projectId!,
        isolateByUser: false
      }
      const saved = await files.uploadBuffer({
        ...fileScope,
        buffer: wav,
        originalName: 'narration.wav',
        fileName: 'narration.wav',
        mimeType: 'audio/wav',
        folder: `motion/${project.id}/narration/${record.id}`
      })
      const reference = await files.resolveRuntimeReference({ ...fileScope, ...saved })
      const narrated = narratedComposition(html, input, duration, record.id!)
      await this.access(scope, project)
      abort.signal.throwIfAborted()
      await this.exports.manager.transaction(async (manager) => {
        const applied = await manager
          .getRepository(MotionProject)
          .update(
            { id: project.id, artifactChecksum: record.inputChecksum!, workingCopyRevision: 1 },
            {
              hyperframesHtml: narrated,
              artifactChecksum: compositionChecksum(narrated),
              workingCopyRevision: 2,
              lastEditedById: scope.userId!,
              lastEditedAt: new Date()
            }
          )
        await manager
          .createQueryBuilder()
          .update<Record<string, unknown>>(MotionExport)
          .set({
            status: 'succeeded',
            stage: applied.affected ? 'complete' : 'audio-ready-draft-changed',
            progress: 100,
            completedAt: new Date(),
            fileReference: reference as unknown as MotionJsonObject,
            filePath: saved.filePath,
            mimeType: 'audio/wav',
            size: wav.length,
            checksum: createHash('sha256').update(wav).digest('hex'),
            report: () => ':report'
          })
          .setParameter(
            'report',
            JSON.stringify({
              ...record.report,
              narratedChecksum: compositionChecksum(narrated),
              duration,
              caption: input.text,
              citations: input.captions[0].citations,
              applied: !!applied.affected
            })
          )
          .where('id = :id', { id: record.id })
          .execute()
      })
    } catch (error) {
      await this.exports.update(record.id!, {
        status: 'failed',
        stage: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Narration failed',
        completedAt: new Date()
      })
      throw error
    } finally {
      clearTimeout(timeout)
      abort.abort()
    }
  }
}
