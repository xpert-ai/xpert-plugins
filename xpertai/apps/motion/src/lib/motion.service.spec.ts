import 'reflect-metadata'

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
  return { service, projects, exports, managedQueue }
}

describe('MotionService video engine policy', () => {
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
