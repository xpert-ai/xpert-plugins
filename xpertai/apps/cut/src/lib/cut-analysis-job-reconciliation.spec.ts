import type { ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { reconcileCutAnalysisJobWithQueue } from './cut-analysis-job-reconciliation.js'
import { CutAnalysisJob } from './entities/index.js'

describe('reconcileCutAnalysisJobWithQueue', () => {
  it('turns a BullMQ handler-registration failure into a visible terminal Cut failure', async () => {
    const job = queuedRenderJob()
    const queue = queueWith({
      state: 'failed',
      failedReason: 'No managed queue handler registered for @xpert-ai/plugin-cut/cut.analysis/render-mp4',
      attemptsMade: 3,
      finishedOn: Date.parse('2026-07-16T08:00:00.000Z')
    })

    await expect(reconcileCutAnalysisJobWithQueue(queue, job)).resolves.toMatchObject({
      changed: true,
      queueState: 'failed',
      failureCode: 'QUEUE_HANDLER_UNAVAILABLE'
    })
    expect(queue.getJob).toHaveBeenCalledWith({ jobId: job.queueJobId, executionPool: 'sandbox-browser' })
    expect(job).toMatchObject({
      status: 'failed',
      progress: 0,
      errorMessage: expect.stringContaining('No managed queue handler registered'),
      completedAt: new Date('2026-07-16T08:00:00.000Z'),
      metadata: expect.objectContaining({
        stage: 'queue-failed',
        errorCode: 'QUEUE_HANDLER_UNAVAILABLE',
        queueState: 'failed',
        queueAttempts: 3
      })
    })
  })

  it('fails closed when BullMQ completed but the domain result was never persisted', async () => {
    const job = queuedRenderJob()
    const queue = queueWith({ state: 'completed', attemptsMade: 1 })

    await reconcileCutAnalysisJobWithQueue(queue, job)

    expect(job).toMatchObject({
      status: 'failed',
      errorMessage: expect.stringContaining('without persisting a terminal Cut result'),
      metadata: expect.objectContaining({ errorCode: 'QUEUE_RESULT_NOT_PERSISTED' })
    })
  })

  it('leaves active and local jobs unchanged', async () => {
    const active = queuedRenderJob()
    const queue = queueWith({ state: 'active', attemptsMade: 0 })
    await expect(reconcileCutAnalysisJobWithQueue(queue, active)).resolves.toEqual({
      changed: false,
      queueState: 'active'
    })
    expect(active.status).toBe('queued')

    const local = queuedRenderJob()
    local.executionMode = 'local'
    await expect(reconcileCutAnalysisJobWithQueue(queue, local)).resolves.toEqual({ changed: false })
    expect(queue.getJob).toHaveBeenCalledTimes(1)
  })
})

function queuedRenderJob(): CutAnalysisJob {
  return Object.assign(new CutAnalysisJob(), {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-a',
    cutProjectId: '22222222-2222-4222-8222-222222222222',
    type: 'render' as const,
    executionMode: 'server' as const,
    status: 'queued' as const,
    progress: 0,
    inputRevision: 3,
    queueJobId: '33333333-3333-4333-8333-333333333333',
    cancellationRequested: false,
    metadata: { stage: 'queued', variantName: 'master' }
  })
}

function queueWith(snapshot: { state: string; attemptsMade: number; failedReason?: string; finishedOn?: number }) {
  return {
    getJob: jest.fn(async () => ({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'render-mp4',
      data: {},
      opts: { attempts: 3 },
      ...snapshot
    }))
  } as unknown as jest.Mocked<ManagedQueueService>
}
