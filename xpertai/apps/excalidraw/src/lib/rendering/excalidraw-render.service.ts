import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { In, Repository } from 'typeorm'
import { z } from 'zod/v3'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueService,
  type RuntimeCapabilityRegistry,
  type WorkspaceFileScope,
  type WorkspacePortableFileReference,
  type SandboxJobOutput,
  isSandboxJobRuntimeError
} from '@xpert-ai/plugin-sdk'
import { ExcalidrawRenderJob } from '../entities/excalidraw-render-job.entity.js'
import { ExcalidrawReadService } from '../excalidraw-read.service.js'
import { ExcalidrawService } from '../excalidraw.service.js'
import { ExcalidrawOperationService } from '../excalidraw-operation.service.js'
import { DiagramIrService } from '../diagram-engine/diagram-ir.service.js'
import { EXCALIDRAW_PLUGIN_NAME } from '../constants.js'
import type { ExcalidrawScope } from '../types.js'
import { jsonValueSchema, receiptSchema } from '../tools/contracts.js'
import { excalidrawUnitOfWork } from '../excalidraw-unit-of-work.js'
import { jobResultSchema, RENDER_ACTION, RENDER_ACTION_VERSION, RENDER_QUEUE } from './render-contracts.js'
import { normalizeExcalidrawScene } from '../excalidraw-scene.validation.js'

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const terminal = (status: ExcalidrawRenderJob['status']) =>
  ['succeeded', 'failed', 'cancelled', 'conflict'].includes(status)
@Injectable()
export class ExcalidrawRenderService {
  constructor(
    @InjectRepository(ExcalidrawRenderJob) private readonly baseJobs: Repository<ExcalidrawRenderJob>,
    private readonly reads: ExcalidrawReadService,
    private readonly drawings: ExcalidrawService,
    private readonly diagrams: DiagramIrService,
    private readonly operations: ExcalidrawOperationService,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry,
    @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService
  ) {}
  private get jobs() {
    return excalidrawUnitOfWork.getStore()?.manager.getRepository(ExcalidrawRenderJob) ?? this.baseJobs
  }
  private files() {
    const files = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new ServiceUnavailableException('workspace_files_unavailable')
    return files
  }
  private sandbox() {
    const jobs = this.capabilities?.get(SandboxJobsRuntimeCapability)
    if (!jobs) throw new ServiceUnavailableException('sandbox_jobs_unavailable')
    return jobs
  }
  private scope(scope: ExcalidrawScope): WorkspaceFileScope {
    if (!scope.tenantId || !scope.organizationId || !scope.userId)
      throw new BadRequestException('missing_storage_identity')
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      userId: scope.userId,
      catalog: 'users',
      scopeId: scope.userId
    }
  }
  private async write(scope: ExcalidrawScope, buffer: Buffer, name: string, mimeType: string) {
    const owner = this.scope(scope)
    const file = await this.files().uploadBuffer({
      ...owner,
      buffer,
      originalName: name,
      mimeType,
      size: buffer.length,
      folder: `files/excalidraw/render/${hash(buffer)}`,
      fileName: name
    })
    const reference: WorkspacePortableFileReference = {
      source: 'platform.workspace.files',
      ...owner,
      filePath: file.filePath,
      workspacePath: file.workspacePath,
      originalName: name,
      mimeType,
      size: buffer.length
    }
    return { reference, size: buffer.length, sha256: hash(buffer), path: name, originalName: name, mimeType }
  }
  async submit(scope: ExcalidrawScope, input: Parameters<ExcalidrawRenderService['prepare']>[1]) {
    const result = await this.operations.run(
      scope,
      'excalidraw_render_submit',
      input.operationId,
      jsonValueSchema.parse(Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))),
      jobResultSchema,
      () => this.prepare(scope, input)
    )
    const job = await this.require(scope, result.jobId)
    if (job.status === 'queued' && !job.queueJobId) await this.enqueue(job)
    return result
  }
  private async prepare(
    scope: ExcalidrawScope,
    input: {
      drawingId: string
      operationId: string
      kind: 'preview' | 'export' | 'mermaid'
      format?: 'json' | 'svg' | 'png'
      expectedRevision?: number
      mermaidSource?: string
    }
  ) {
    this.scope(scope)
    const { drawing, version } = await this.reads.snapshot(scope, input.drawingId)
    this.drawings.assertSceneRevision(drawing, input.expectedRevision)
    const sceneRevision = drawing.revision ?? 0,
      format = input.kind === 'mermaid' ? 'json' : input.format ?? 'png'
    const scene = normalizeExcalidrawScene({
      elements: version?.elements ?? [],
      appState: version?.appState ?? {},
      files: version?.files ?? {}
    })
    const buffer = Buffer.from(
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        source: 'xpert',
        ...scene,
        mermaidSource: input.mermaidSource ?? version?.mermaidSource ?? null
      })
    )
    const cacheKey = hash(
      JSON.stringify([
        input.drawingId,
        sceneRevision,
        hash(buffer),
        input.kind,
        format,
        RENDER_ACTION_VERSION,
        input.kind === 'preview' ? 'cache' : input.operationId
      ])
    )
    const where = { tenantId: scope.tenantId, organizationId: scope.organizationId, actorId: scope.actorId, cacheKey }
    const existing = await this.jobs.findOne({ where })
    if (existing) {
      await this.reconcile(existing)
      return this.result(existing)
    }
    if (input.kind !== 'export' || format !== 'json') {
      const health = await this.sandbox().getActionHealth({
        pluginName: EXCALIDRAW_PLUGIN_NAME,
        action: RENDER_ACTION,
        actionVersion: RENDER_ACTION_VERSION
      })
      if (!health.available) throw new ServiceUnavailableException(health.reason ?? 'render_unavailable')
      if (
        !this.queue ||
        (await this.queue.getExecutionPoolHealth({ executionPool: 'sandbox-browser' })).available !== true
      )
        throw new ServiceUnavailableException('render_worker_unavailable')
    }
    const staged = await this.write(scope, buffer, 'scene.json', 'application/json')
    // A concurrent cache hit must not abort the surrounding operation transaction.
    // PostgreSQL waits for the winning insert, then this read returns its durable job.
    await this.jobs
      .createQueryBuilder()
      .insert()
      .values(
        this.jobs.create({
          ...where,
          id: randomUUID(),
          userId: scope.userId,
          drawingId: drawing.id,
          kind: input.kind,
          format,
          sceneRevision,
          status: 'queued',
          inputReference: staged.reference,
          inputHash: staged.sha256,
          inputSize: staged.size,
          outputs: []
        })
      )
      .orIgnore()
      .execute()
    const job = await this.jobs.findOneOrFail({ where })
    if (input.kind === 'export' && format === 'json') {
      job.outputs = [staged]
      await this.transition(job, { status: 'succeeded', outputs: job.outputs })
    }

    return this.result(job)
  }
  private async enqueue(job: ExcalidrawRenderJob) {
    if (!this.queue) throw new ServiceUnavailableException('render_worker_unavailable')
    const queued = await this.queue.enqueue({
      pluginName: EXCALIDRAW_PLUGIN_NAME,
      queueName: RENDER_QUEUE,
      jobName: 'render',
      payload: { jobId: job.id },
      tenantId: job.tenantId,
      organizationId: job.organizationId,
      userId: job.userId,
      scopeKey: 'system:global',
      jobId: `excalidraw-render-${job.id}`,
      attempts: 3,
      backoffMs: { type: 'exponential', delay: 5000 },
      executionPool: 'sandbox-browser'
    })
    job.queueJobId = queued.jobId
    await this.jobs.update({ id: job.id }, { queueJobId: queued.jobId })
  }
  private async require(scope: ExcalidrawScope, id: string) {
    if (!scope.tenantId || !scope.organizationId || !scope.actorId)
      throw new BadRequestException('missing_execution_context')
    const job = await this.jobs.findOne({
      where: { id, tenantId: scope.tenantId, organizationId: scope.organizationId, actorId: scope.actorId }
    })
    if (!job) throw new NotFoundException('render_job_not_found')
    await this.drawings.requireDrawing(scope, job.drawingId)
    return job
  }
  async get(scope: ExcalidrawScope, id: string) {
    const job = await this.require(scope, id)
    await this.reconcile(job)
    return this.result(job)
  }
  async wait(scope: ExcalidrawScope, id: string, cursor: string, signal?: AbortSignal) {
    const end = Date.now() + 45000
    let job = await this.require(scope, id)
    await this.reconcile(job)
    while (!terminal(job.status) && this.result(job).cursor === cursor && Date.now() < end) {
      signal?.throwIfAborted()
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          signal?.removeEventListener('abort', abort)
          resolve()
        }
        const timer = setTimeout(finish, Math.min(2000, end - Date.now()))
        const abort = () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          reject(signal?.reason ?? new Error('cancelled'))
        }
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
      })
      job = await this.require(scope, id)
    }
    await this.reconcile(job)
    return this.result(job)
  }
  private async transition(job: ExcalidrawRenderJob, patch: Partial<ExcalidrawRenderJob>) {
    await this.jobs.update({ id: job.id, status: In(['queued', 'running']) }, patch)
    const latest = await this.jobs.findOneByOrFail({ id: job.id })
    Object.assign(job, latest)
    return job
  }
  async cancel(scope: ExcalidrawScope, id: string) {
    const job = await this.require(scope, id)
    if (!terminal(job.status)) {
      await this.transition(job, { status: 'cancelled' })
      if (job.status === 'cancelled') {
        try {
          await this.sandbox().cancel({ jobId: job.id })
        } catch (error) {
          // A queued job may not have reached Sandbox yet. Its durable cancellation
          // prevents the worker from applying output even if dispatch races this call.
          if (!isSandboxJobRuntimeError(error) || error.code !== 'SANDBOX_CANCELLED') throw error
        }
        if (job.queueJobId) await this.queue?.cancel({ jobId: job.queueJobId, executionPool: 'sandbox-browser' })
      }
    }
    return this.result(job)
  }
  private async reconcile(job: ExcalidrawRenderJob) {
    if (terminal(job.status)) return
    const queued = job.queueJobId
      ? await this.queue?.getJob({ jobId: job.queueJobId, executionPool: 'sandbox-browser' })
      : null
    if (queued?.state === 'failed') {
      await this.transition(job, { status: 'failed', errorCode: 'render_failed' })
    } else if (!queued && Date.now() - job.updatedAt.getTime() > 60000) await this.enqueue(job)
  }
  async process(
    id: string,
    owner: { tenantId?: string | null; organizationId?: string | null; userId?: string | null }
  ) {
    if (!owner.tenantId || !owner.organizationId || !owner.userId)
      throw new BadRequestException('missing_execution_context')
    const job = await this.jobs.findOne({
      where: { id, tenantId: owner.tenantId, organizationId: owner.organizationId, userId: owner.userId }
    })
    if (!job || terminal(job.status)) return
    const scope: ExcalidrawScope = {
      tenantId: job.tenantId,
      organizationId: job.organizationId,
      userId: job.userId,
      actorId: job.actorId,
      surface: 'mcp'
    }
    await this.drawings.requireDrawing(scope, job.drawingId)
    await this.transition(job, { status: 'running' })
    if (terminal(job.status)) return
    try {
      const name = job.kind === 'mermaid' ? 'converted.json' : `drawing.${job.format}`
      const mimeType = job.format === 'png' ? 'image/png' : job.format === 'svg' ? 'image/svg+xml' : 'application/json'
      const result = await this.sandbox().run({
        jobId: job.id,
        action: RENDER_ACTION,
        actionVersion: RENDER_ACTION_VERSION,
        idempotencyKey: `excalidraw:${job.id}:${job.inputHash}`,
        scope: {
          tenantId: job.tenantId,
          organizationId: job.organizationId,
          userId: job.userId,
          pluginName: EXCALIDRAW_PLUGIN_NAME,
          businessResourceType: 'excalidraw_render',
          businessResourceId: job.id
        },
        payload: { kind: job.kind, format: job.format },
        files: [
          { reference: job.inputReference, targetPath: 'scene.json', size: job.inputSize, sha256: job.inputHash }
        ],
        outputs: [
          {
            path: name,
            originalName: name,
            mimeType,
            destination: { ...this.scope(scope), folder: `files/excalidraw/render/${job.id}` }
          }
        ],
        timeoutMs: 120000
      })
      const latest = await this.jobs.findOneBy({ id: job.id })
      if (latest?.status === 'cancelled') return
      job.outputs = result.outputs
      if (job.kind === 'mermaid') {
        const output = result.outputs.find((item) => item.path === 'converted.json')
        if (!output) throw new Error('conversion_output_missing')
        const file = await this.files().readBuffer(output.reference)
        const converted = z
          .object({
            elements: z.array(jsonValueSchema),
            appState: z.record(jsonValueSchema),
            files: z.record(jsonValueSchema)
          })
          .strict()
          .parse(JSON.parse(file.buffer.toString('utf8')))
        try {
          await this.operations.run(
            scope,
            'excalidraw_apply_conversion',
            job.id,
            { jobId: job.id },
            receiptSchema,
            async () => {
              const locked = await this.jobs.findOne({ where: { id: job.id }, lock: { mode: 'pessimistic_write' } })
              if (locked?.status === 'cancelled')
                return { success: false, drawingId: job.drawingId, message: 'Conversion cancelled.' }
              const current = await this.drawings.requireCanonicalDrawing(scope, job.drawingId)
              this.drawings.assertSceneRevision(current, job.sceneRevision)
              await this.drawings.saveCurrentScene(scope, {
                drawingId: job.drawingId,
                expectedRevision: job.sceneRevision,
                ...converted,
                sourceType: 'agent_mermaid'
              })
              await this.transition(job, { status: 'succeeded', outputs: job.outputs })
              return { success: true, drawingId: job.drawingId, message: 'Mermaid converted.' }
            }
          )
        } catch (error) {
          if (!(error instanceof ConflictException)) throw error
          await this.transition(job, { status: 'conflict', errorCode: 'scene_revision_conflict', outputs: job.outputs })
          return
        }
      }
      await this.transition(job, { status: 'succeeded', outputs: job.outputs })
    } catch (error) {
      const latest = await this.jobs.findOneBy({ id: job.id })
      if (latest?.status === 'cancelled') return
      const retryable = isSandboxJobRuntimeError(error) && error.retryable
      await this.transition(job, {
        status: retryable ? 'queued' : 'failed',
        errorCode: isSandboxJobRuntimeError(error) ? error.code : 'render_failed'
      })
      if (retryable) throw error
    }
  }
  async qualityPreview(
    scope: ExcalidrawScope,
    input: { drawingId: string; expectedRevision: number; qualityRunId?: string; operationId: string }
  ) {
    this.scope(scope)
    return this.operations.run(
      scope,
      'excalidraw_diagram_create_preview',
      input.operationId,
      jsonValueSchema.parse(input),
      jobResultSchema,
      async () => {
        const { drawing } = await this.reads.snapshot(scope, input.drawingId)
        const outputs: SandboxJobOutput[] = []
        const preview = await this.diagrams.createPreview(
          scope,
          {
            writeRuntimeBuffer: async (request) => {
              const name = request.originalName,
                owner = this.scope(scope)
              const file = await this.files().uploadBuffer({
                ...owner,
                buffer: request.buffer,
                originalName: name,
                mimeType: request.mimeType,
                size: request.buffer.length,
                folder: `files/excalidraw/quality/${hash(input.operationId)}`,
                fileName: name
              })
              const reference: WorkspacePortableFileReference = {
                source: 'platform.workspace.files',
                ...owner,
                filePath: file.filePath,
                workspacePath: file.workspacePath,
                originalName: name,
                mimeType: request.mimeType,
                size: request.buffer.length
              }
              outputs.push({
                path: name,
                originalName: name,
                mimeType: request.mimeType,
                size: request.buffer.length,
                sha256: hash(request.buffer),
                reference
              })
              return { ...file, reference }
            }
          },
          input
        )
        const job = await this.jobs.save(
          this.jobs.create({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            actorId: scope.actorId,
            userId: scope.userId,
            drawingId: drawing.id,
            cacheKey: hash(`quality:${input.operationId}`),
            kind: 'diagram_preview',
            format: 'png',
            status: 'succeeded',
            sceneRevision: drawing.revision ?? 0,
            irRevision: preview.revision,
            qualityRunId: preview.qualityRunId,
            outputs
          })
        )
        return this.result(job)
      }
    )
  }
  async readExport(scope: ExcalidrawScope, id: string, offset = 0, limit = 32000) {
    const job = await this.require(scope, id),
      output = job.outputs[0]
    if (!['succeeded', 'conflict'].includes(job.status) || !output) throw new BadRequestException('export_not_ready')
    const file = await this.files().readBuffer(output.reference)
    if (hash(file.buffer) !== output.sha256) throw new BadRequestException('export_integrity_failed')
    const data = file.buffer.toString('base64')
    return {
      drawingId: job.drawingId,
      jobId: id,
      format: job.format,
      mimeType: output.mimeType,
      name: output.originalName,
      size: file.buffer.length,
      sha256: output.sha256,
      encoding: 'base64' as const,
      data: data.slice(offset, offset + limit),
      offset,
      total: data.length,
      nextOffset: offset + limit < data.length ? offset + limit : null
    }
  }
  async readPreview(scope: ExcalidrawScope, id: string) {
    const job = await this.require(scope, id),
      output = job.outputs.find((item) => item.mimeType === 'image/png')
    if (job.status !== 'succeeded' || !output) throw new BadRequestException('preview_not_ready')
    const file = await this.files().readBuffer(output.reference)
    if (file.buffer.length > 6 * 1024 * 1024 || hash(file.buffer) !== output.sha256)
      throw new BadRequestException('preview_integrity_failed')
    const drawing = await this.drawings.requireCanonicalDrawing(scope, job.drawingId)
    return {
      content: [{ type: 'image' as const, data: file.buffer.toString('base64'), mimeType: 'image/png' }],
      structuredContent: {
        drawingId: job.drawingId,
        previewId: id,
        sceneRevision: job.sceneRevision,
        kind: job.kind === 'diagram_preview' ? ('diagram_ir' as const) : ('scene' as const),
        ...(job.irRevision == null ? {} : { irRevision: job.irRevision }),
        stale:
          (drawing.revision ?? 0) !== job.sceneRevision ||
          (job.kind === 'diagram_preview' &&
            (await this.diagrams.get(scope, job.drawingId)).revision !== job.irRevision),
        mimeType: 'image/png' as const
      }
    }
  }
  result(job: ExcalidrawRenderJob) {
    return {
      success: !['failed', 'cancelled', 'conflict'].includes(job.status),
      jobId: job.id,
      drawingId: job.drawingId,
      sceneRevision: job.sceneRevision,
      ...(job.irRevision == null ? {} : { irRevision: job.irRevision }),
      status: job.status,
      kind: job.kind,
      format: job.format,
      ...(job.outputs.length ? { resultTool: job.kind === 'preview' || job.kind === 'diagram_preview' ? 'excalidraw_read_preview' as const : 'excalidraw_read_export' as const } : {}),
      ...(job.status === 'conflict'
        ? { message: 'The scene changed during conversion. Read the retained conversion with excalidraw_read_export, then read the current drawing before applying it.' }
        : job.status === 'failed'
          ? { message: `Rendering failed (${job.errorCode ?? 'render_failed'}). Check the source and submit again with a new operationId.` }
          : job.status === 'cancelled' ? { message: 'The job was cancelled. Submit a new operationId to start another job.' } : {}),
      cursor: hash(JSON.stringify([job.status, job.errorCode, job.outputs.map((x) => x.sha256)])),
      terminal: terminal(job.status),
      ...(job.status === 'succeeded' && job.outputs.some((x) => x.mimeType === 'image/png')
        ? { previewId: job.id }
        : {}),
      ...(job.qualityRunId ? { qualityRunId: job.qualityRunId } : {}),
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      nextAction: terminal(job.status) ? (job.status === 'succeeded' ? 'read_result' : 'inspect_failure') : 'wait_again'
    }
  }
}
