jest.mock('@xpert-ai/plugin-sdk', () => {
  const { createLarkPluginSdkMock } = require('../../../../test-utils/larkPluginSdkMock.cjs')
  return createLarkPluginSdkMock(jest, {
    PluginJobProcessor: () => (target: unknown) => target
  })
})

import { LarkMessageHistoryQueueProcessor } from './lark-message-history-queue.processor.js'

describe('LarkMessageHistoryQueueProcessor', () => {
  function createFixture(params?: {
    binding?: Record<string, unknown> | null
    materializeResult?: Record<string, unknown>
    cleanupResult?: Record<string, unknown>
  }) {
    const historyService = {
      materializeFiles: jest.fn().mockResolvedValue(
        params?.materializeResult ?? {
          files: [],
          failed: []
        }
      ),
      cleanupExpired: jest.fn().mockResolvedValue(
        params?.cleanupResult ?? {
          deletedLogs: 0,
          hasMore: false
        }
      )
    }
    const queueService = {
      enqueueMaterialize: jest.fn().mockResolvedValue(undefined),
      scheduleCleanup: jest.fn().mockResolvedValue(undefined)
    }
    const triggerBindingRepository = {
      findOne: jest.fn().mockResolvedValue(
        params?.binding === undefined
          ? {
              integrationId: 'integration-1',
              tenantId: 'tenant-current',
              organizationId: 'org-current',
              config: { enabled: true, historyRetentionDays: 30 }
            }
          : params.binding
      )
    }
    const processor = new LarkMessageHistoryQueueProcessor(
      historyService as never,
      queueService as never,
      triggerBindingRepository as never
    )
    return { processor, historyService, queueService, triggerBindingRepository }
  }

  it('throws when attachment materialization has retryable failures', async () => {
    const { processor } = createFixture({
      materializeResult: {
        files: [],
        failed: [
          {
            fileId: 'file-1',
            messageLogId: 'log-1',
            resourceKey: 'resource-1',
            error: 'storage unavailable',
            retryable: true
          }
        ]
      }
    })

    await expect(
      processor.handle({
        id: 'job-1',
        name: 'materialize-files',
        data: {
          kind: 'materialize-files',
          integrationId: 'integration-1',
          xpertId: 'xpert-1',
          messageLogIds: ['log-1'],
          maxSizeMb: 10
        }
      } as never)
    ).rejects.toThrow('resource-1')
  })

  it('does not retry permanent attachment failures', async () => {
    const { processor } = createFixture({
      materializeResult: {
        files: [],
        failed: [
          {
            fileId: 'file-1',
            messageLogId: 'log-1',
            resourceKey: 'resource-1',
            error: 'file_size_exceeded:1:1',
            retryable: false
          }
        ]
      }
    })

    await expect(
      processor.handle({
        id: 'job-1',
        name: 'materialize-files',
        data: {
          kind: 'materialize-files',
          integrationId: 'integration-1',
          xpertId: 'xpert-1',
          messageLogIds: ['log-1'],
          maxSizeMb: 10
        }
      } as never)
    ).resolves.toBeUndefined()
  })

  it('schedules a delayed continuation when another worker still owns a fresh processing lease', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T00:00:00.000Z'))
    const nextLeaseAt = new Date(Date.now() + 30_000)
    const { processor, queueService } = createFixture({
      materializeResult: { files: [], failed: [], nextLeaseAt }
    })

    await processor.handle({
      id: 'job-1',
      name: 'materialize-files',
      data: {
        kind: 'materialize-files',
        integrationId: 'integration-1',
        xpertId: 'xpert-1',
        messageLogIds: ['log-1'],
        maxSizeMb: 10,
        continuation: 2
      }
    } as never)

    expect(queueService.enqueueMaterialize).toHaveBeenCalledWith(
      expect.objectContaining({ continuation: 3, messageLogIds: ['log-1'] }),
      30_000
    )
    jest.useRealTimers()
  })

  it('stops a stale cleanup chain when current retention is permanent', async () => {
    const { processor, historyService, queueService } = createFixture({
      binding: {
        integrationId: 'integration-1',
        config: { enabled: true, historyRetentionDays: 0 }
      }
    })

    await processor.handle({
      id: 'cleanup-1',
      name: 'cleanup-expired',
      data: {
        kind: 'cleanup-expired',
        integrationId: 'integration-1',
        retentionDays: 30
      }
    } as never)

    expect(historyService.cleanupExpired).not.toHaveBeenCalled()
    expect(queueService.scheduleCleanup).not.toHaveBeenCalled()
  })

  it('uses current retention and drains a large backlog in bounded continuation jobs', async () => {
    const { processor, historyService, queueService } = createFixture({
      binding: {
        integrationId: 'integration-1',
        tenantId: 'tenant-current',
        organizationId: 'org-current',
        config: { enabled: true, historyRetentionDays: 90 }
      },
      cleanupResult: {
        deletedLogs: 500,
        hasMore: true,
        nextCursor: { createdAt: new Date('2026-01-01T00:00:00.000Z'), id: 'log-500' }
      }
    })

    await processor.handle({
      id: 'cleanup-1',
      name: 'cleanup-expired',
      data: {
        kind: 'cleanup-expired',
        integrationId: 'integration-1',
        tenantId: 'tenant-stale',
        organizationId: 'org-stale',
        retentionDays: 30,
        continuation: 2
      }
    } as never)

    expect(historyService.cleanupExpired).toHaveBeenCalledWith(
      expect.objectContaining({
        retentionDays: 90,
        tenantId: 'tenant-current',
        organizationId: 'org-current'
      })
    )
    expect(queueService.scheduleCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ retentionDays: 90, continuation: 3 }),
      1000
    )
  })

  it('continues past a poison cleanup batch even when no message was deleted', async () => {
    const nextCreatedAt = new Date('2026-01-01T00:00:00.000Z')
    const { processor, queueService } = createFixture({
      cleanupResult: {
        deletedLogs: 0,
        failedFiles: 500,
        hasMore: true,
        nextCursor: { createdAt: nextCreatedAt, id: 'log-500' }
      }
    })

    await processor.handle({
      id: 'cleanup-1',
      name: 'cleanup-expired',
      data: {
        kind: 'cleanup-expired',
        integrationId: 'integration-1',
        retentionDays: 30,
        continuation: 4
      }
    } as never)

    expect(queueService.scheduleCleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        continuation: 5,
        afterCreatedAt: nextCreatedAt.toISOString(),
        afterId: 'log-500'
      }),
      1000
    )
  })
})
