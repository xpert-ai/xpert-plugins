import 'reflect-metadata'
import { randomUUID } from 'node:crypto'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  MANAGED_QUEUE_SERVICE_TOKEN: Symbol('managed-queue'),
  SandboxJobsRuntimeCapability: class SandboxJobsRuntimeCapability {},
  SYSTEM_GLOBAL_SCOPE: 'system',
  WorkspaceFilesRuntimeCapability: class WorkspaceFilesRuntimeCapability {},
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('runtime-capabilities')
}))

import { SandboxJobsRuntimeCapability } from '@xpert-ai/plugin-sdk'
import type { ManagedQueueService, RuntimeCapabilityRegistry, SandboxJobsApi } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import { MotionActionLog, MotionExport, MotionProject, MotionProjectVersion, MotionStyle } from './entities/index.js'
import { MotionService } from './motion.service.js'
import type { MotionScope } from './types.js'
import { createStarterVideoComposition } from './video-composition.js'

type EntityWithId = { id?: string; createdAt?: Date; updatedAt?: Date }

function memoryRepository<T extends EntityWithId>(prefix: string) {
  const rows: T[] = []
  let sequence = 0
  const repository = {
    rows,
    create: (value: Partial<T>) => value as T,
    save: async (value: T) => {
      if (!value.id) value.id = `${prefix}-${++sequence}`
      value.createdAt ??= new Date('2026-07-18T00:00:00.000Z')
      value.updatedAt = new Date('2026-07-18T00:00:00.000Z')
      const index = rows.findIndex((row) => row.id === value.id)
      if (index >= 0) rows[index] = value
      else rows.push(value)
      return value
    },
    findOne: async (options: { where?: Partial<T> }) => rows.find((row) => matches(row, options.where)) ?? null,
    find: async (options?: { where?: Partial<T>; take?: number }) => rows.filter((row) => matches(row, options?.where)).slice(0, options?.take),
    count: async (options?: { where?: Partial<T> }) => rows.filter((row) => matches(row, options?.where)).length,
    update: async (id: string, value: Partial<T>) => { Object.assign(rows.find(row => row.id === id)!, value); return { affected: 1 } },
    manager: { transaction: async (fn: (manager: { getRepository: () => unknown; createQueryBuilder: () => unknown }) => Promise<unknown>) => fn({ getRepository: () => repository, createQueryBuilder: () => repository.createQueryBuilder() }) },
    createQueryBuilder: () => {
      let value: T
      const query = { insert: () => query, into: () => query, values: (input: T) => { value = input; return query },
        setParameter: (_key: string, json: string) => { Object.assign(value!, { report: JSON.parse(json) }); return query },
        orIgnore: () => query, execute: async () => { if (!rows.some(row => row.id === value.id)) await repository.save(value); return {} } }
      return query
    },
    delete: jest.fn(async () => ({ affected: 0 }))
  }
  return repository as typeof repository & Repository<T>
}

function matches<T>(row: T, where: Partial<T> | undefined) {
  return !where || Object.entries(where).every(([key, value]) => value === undefined || row[key as keyof T] === value)
}

const scope: MotionScope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  userId: 'user-1'
}

function createService(options?: { productionRuntime?: boolean }) {
  const projects = memoryRepository<MotionProject>('project')
  const versions = memoryRepository<MotionProjectVersion>('version')
  const styles = memoryRepository<MotionStyle>('style')
  const exports = memoryRepository<MotionExport>('export')
  const logs = memoryRepository<MotionActionLog>('log')
  const sandboxJobs = {
    getActionHealth: jest.fn(async () => ({
      available: true,
      runtimeProfile: 'browser/video-playwright-1.61/v1',
      sandboxRuntimeVersion: '1.0.0'
    }))
  } as unknown as SandboxJobsApi
  const runtimeCapabilities = {
    get: jest.fn((capability: unknown) => options?.productionRuntime && capability === SandboxJobsRuntimeCapability ? sandboxJobs : undefined)
  } as unknown as RuntimeCapabilityRegistry
  const managedQueue = {
    getExecutionPoolHealth: jest.fn(async () => ({ executionPool: 'sandbox-browser', available: true, workerCount: 2 })),
    enqueue: jest.fn(async (input: { jobId: string }) => ({ jobId: input.jobId }))
  } as unknown as ManagedQueueService
  const service = new MotionService(projects, versions, styles, exports, logs, runtimeCapabilities, options?.productionRuntime ? managedQueue : undefined)
  return { service, projects, exports, managedQueue, sandboxJobs }
}

describe('MotionService video engine policy', () => {
  it('resolves only succeeded exports in the authorized project and tenant', async () => {
    const { service, exports } = createService()
    const project = await service.createProject(scope, { title: 'Download', surface: 'video' })
    const record = await exports.save({ ...scope, motionProjectId: project.item.id!, kind: 'mp4', status: 'succeeded',
      mimeType: 'video/mp4', fileReference: { filePath: 'exports/test.mp4', name: 'test.mp4' } })
    expect((await service.resolveExportFile(scope, project.item.id!, record.id!)).fileName).toBe('test.mp4')
    await expect(service.resolveExportFile({ ...scope, tenantId: 'other' }, project.item.id!, record.id!)).rejects.toThrow()
    await expect(service.resolveExportFile(scope, project.item.id!, 'other-export')).rejects.toThrow()
    record.status = 'failed'
    await expect(service.resolveExportFile(scope, project.item.id!, record.id!)).rejects.toThrow()
  })
  it('creates new video projects as native HyperFrames compositions', async () => {
    const { service } = createService()
    const result = await service.createProject(scope, { title: 'Native Launch', surface: 'video' })

    expect(result.item.videoEngine).toBe('hyperframes')
    expect(result.workingCopy.videoEngine).toBe('hyperframes')
    expect(result.workingCopy.hyperframesHtml).toContain('data-composition-id="main"')
    expect(result.workingCopy.videoComposition).toBeNull()
  })

  it('maps historical video rows without a discriminator to legacy_canvas', async () => {
    const { service, projects } = createService()
    projects.rows.push({
      id: 'historical-video',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? null,
      title: 'Historical Video',
      surface: 'video',
      videoEngine: null,
      videoComposition: createStarterVideoComposition('Historical Video'),
      status: 'draft',
      currentVersionNumber: 0,
      workingCopyRevision: 1
    })

    const result = await service.getProject(scope, { projectId: 'historical-video' })
    expect(result.item.videoEngine).toBe('legacy_canvas')
    expect(result.workingCopy.videoEngine).toBe('legacy_canvas')
  })

  it('binds render request IDs to immutable inputs and actors, without duplicate queue work', async () => {
    const { service, exports, managedQueue } = createService({ productionRuntime: true })
    const created = await service.createProject(scope, { title: 'Deduplicated', surface: 'video' })
    const input = { projectId: created.item.id!, requestId: randomUUID(), quality: 'standard' as const }
    const first = await service.requestProductionRender(scope, input)
    expect((await service.requestProductionRender(scope, input)).export.id).toBe(first.export.id)
    expect(managedQueue.enqueue).toHaveBeenCalledTimes(1)
    expect(exports.rows).toHaveLength(1)
    expect(first.export.report).not.toHaveProperty('compositionHtml')
    await expect(service.requestProductionRender(scope, { ...input, fps: 60 })).rejects.toThrow('different intent')
    await expect(service.requestProductionRender({ ...scope, userId: 'different' }, input)).rejects.toThrow('different intent')
    expect(managedQueue.enqueue).toHaveBeenCalledTimes(1)
  })
  it('retains the queued source and requires settled failure before an explicit retry', async () => {
    const { service, projects, exports, sandboxJobs } = createService({ productionRuntime: true })
    const created = await service.createProject({ ...scope, assistantId: 'assistant-1' }, { title: 'Frozen render', surface: 'video' })
    const first = await service.requestProductionRender(scope, { projectId: created.item.id!, requestId: randomUUID() })
    const savedHtml = exports.rows[0].report!.compositionHtml
    projects.rows[0].hyperframesHtml = String(savedHtml).replace('Frozen render', 'Later edits')
    const run = jest.fn(async () => { throw new Error('controlled failure') })
    const getJob = jest.fn(async () => ({ id: first.export.id!, status: 'failed', controlState: 'pending', generation: randomUUID() }))
    Object.assign(sandboxJobs, { run, getJob })
    await expect(service.processProductionRender({ data: { exportId: first.export.id!, tenantId: scope.tenantId, organizationId: scope.organizationId } } as never)).rejects.toThrow('controlled failure')
    expect(run.mock.calls[0]).toBeDefined()
    expect((run.mock.calls[0] as unknown as [{ payload: { compositionHtml: string } }])[0].payload.compositionHtml).toBe(savedHtml)
    expect(exports.rows[0].status).toBe('failed')
    const retry = { projectId: created.item.id!, requestId: randomUUID(), retryOfExportId: first.export.id! }
    await expect(service.requestProductionRender(scope, retry)).rejects.toThrow('settlement')
    getJob.mockImplementation(async () => ({ id: first.export.id!, status: 'failed', controlState: 'settled', generation: '12345678-1234-4234-8234-123456789abc' }))
    const next = await service.requestProductionRender(scope, retry)
    expect(next.export.id).not.toBe(first.export.id)
    expect(exports.rows[1].report!.compositionHtml).toBe(savedHtml)
    expect(exports.rows[1].report!.retryOf).toEqual({ jobId: first.export.id, generation: '12345678-1234-4234-8234-123456789abc' })
    expect((await service.requestProductionRender(scope, retry)).export.id).toBe(next.export.id)
    await expect(service.processProductionRender({ data: { exportId: next.export.id!, tenantId: scope.tenantId, organizationId: scope.organizationId } } as never)).rejects.toThrow('controlled failure')
    expect((run.mock.calls[1] as unknown as [{ scope: { businessResourceId: string } }])[0].scope.businessResourceId).toBe(first.export.id)
  })
  it('queues production renders only after the platform runtime is healthy', async () => {
    const { service, exports, managedQueue } = createService({ productionRuntime: true })
    const created = await service.createProject(scope, { title: 'Queued Launch', surface: 'video' })
    const result = await service.requestProductionRender(scope, {
      projectId: created.item.id,
      kind: 'mp4',
      quality: 'high',
      fps: 60,
      expectedChecksum: created.item.artifactChecksum ?? undefined
    })

    expect(result.export).toEqual(expect.objectContaining({ status: 'queued', backend: 'hyperframes', progress: 0 }))
    expect(exports.rows[0]).toEqual(expect.objectContaining({ inputChecksum: created.item.artifactChecksum, jobId: `motion-render-${exports.rows[0]?.id}` }))
    expect(managedQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      executionPool: 'sandbox-browser',
      queueName: 'motion.render',
      jobName: 'hyperframes-production',
      attempts: 1
    }))
  })
})
