jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  MANAGED_QUEUE_SERVICE_TOKEN: 'MANAGED_QUEUE_SERVICE_TOKEN'
}))

import { LarkMessageHistoryQueueService } from './lark-message-history-queue.service.js'
import {
  buildLarkHistoryCleanupJobId,
  buildLarkHistoryMaterializeJobId
} from './lark-job-id.js'

describe('LarkMessageHistoryQueueService', () => {
  it('queues attachment materialization using message log ids only', async () => {
    const managedQueue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const pluginContext = {
      scopeKey: 'plugin-scope-1',
      resolve: jest.fn().mockReturnValue(managedQueue)
    }
    const service = new LarkMessageHistoryQueueService(pluginContext as any)

    await service.enqueueMaterialize({
      integrationId: 'integration-1',
      xpertId: 'xpert-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      messageLogIds: ['log-1', 'log-1', ' log-2 '],
      maxSizeMb: 10
    })

    expect(managedQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'lark-message-history',
        jobName: 'materialize-files',
        scopeKey: 'plugin-scope-1',
        attempts: 5,
        payload: {
          kind: 'materialize-files',
          integrationId: 'integration-1',
          xpertId: 'xpert-1',
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          messageLogIds: ['log-1', 'log-2'],
          maxSizeMb: 10
        },
        jobId: buildLarkHistoryMaterializeJobId('integration-1', ['log-1', 'log-2'])
      })
    )
    expect(managedQueue.enqueue.mock.calls[0][0].jobId).not.toContain(':')
  })

  it('uses a new safe deterministic id for delayed materialization continuations', async () => {
    const managedQueue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const service = new LarkMessageHistoryQueueService({
      resolve: jest.fn().mockReturnValue(managedQueue)
    } as any)

    await service.enqueueMaterialize(
      {
        integrationId: 'integration:1',
        xpertId: 'xpert-1',
        messageLogIds: ['log:1'],
        maxSizeMb: 10,
        continuation: 3
      },
      30_000
    )

    expect(managedQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: buildLarkHistoryMaterializeJobId('integration:1', ['log:1'], 3),
        delayMs: 30_000
      })
    )
    expect(managedQueue.enqueue.mock.calls[0][0].jobId).not.toContain(':')
  })

  it('does not schedule cleanup when retention is permanent', async () => {
    const managedQueue = { enqueue: jest.fn() }
    const service = new LarkMessageHistoryQueueService({
      resolve: jest.fn().mockReturnValue(managedQueue)
    } as any)

    await service.scheduleCleanup({ integrationId: 'integration-1', retentionDays: 0 })

    expect(managedQueue.enqueue).not.toHaveBeenCalled()
  })

  it('uses a retention-independent cleanup job id and unique continuation id', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T00:00:00.000Z'))
    const managedQueue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const service = new LarkMessageHistoryQueueService({
      scopeKey: 'plugin-scope-1',
      resolve: jest.fn().mockReturnValue(managedQueue)
    } as any)

    await service.scheduleCleanup(
      {
        integrationId: 'integration-1',
        retentionDays: 90,
        continuation: 4
      },
      1000
    )
    await service.scheduleCleanup(
      {
        integrationId: 'integration-1',
        retentionDays: 30,
        continuation: 4
      },
      1000
    )

    expect(managedQueue.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        jobId: buildLarkHistoryCleanupJobId('integration-1', '2026-07-16', 4),
        delayMs: 1000
      })
    )
    expect(managedQueue.enqueue.mock.calls[0][0].jobId).toBe(managedQueue.enqueue.mock.calls[1][0].jobId)
    expect(managedQueue.enqueue.mock.calls[0][0].jobId).not.toContain(':')
    jest.useRealTimers()
  })
})
