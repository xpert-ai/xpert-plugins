jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  RequestContext: {
    currentTenantId: () => undefined,
    currentUserId: () => undefined,
    getOrganizationId: () => undefined
  }
}))

import { WECHAT_PERSONAL_OUTBOUND_SEND_TEXT_JOB, WECHAT_PERSONAL_PROVIDER_KEY } from './constants.js'
import {
  WechatPersonalOutboundQueueJobData,
  WechatPersonalOutboundQueueService
} from './wechat-personal-outbound-queue.service.js'

describe('WechatPersonalOutboundQueueService', () => {
  const integration = {
    id: 'integration-1',
    provider: WECHAT_PERSONAL_PROVIDER_KEY,
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    options: {
      baseUrl: 'http://127.0.0.1:8201',
      outboundQueue: {
        initialDelayMs: 100,
        globalMinIntervalMs: 500,
        perAccountMinIntervalMs: 1000,
        perContactMinIntervalMs: 1000,
        maxAttempts: 2,
        failureGuard: {
          threshold: 2,
          windowSeconds: 60
        }
      }
    }
  }

  function createRedis(overrides: Record<string, jest.Mock> = {}) {
    return {
      get: jest.fn(async () => null),
      set: jest.fn(async () => 'OK'),
      del: jest.fn(async () => 1),
      incr: jest.fn(async () => 1),
      expire: jest.fn(async () => 1),
      ttl: jest.fn(async () => -1),
      eval: jest.fn(async () => 1),
      ...overrides
    }
  }

  function createService(options: { redis?: ReturnType<typeof createRedis>; integrationRead?: jest.Mock } = {}) {
    const client = {
      sendText: jest.fn(async () => ({ success: true, messageId: 'wx-msg-1' }))
    }
    const redis = options.redis ?? createRedis()
    const outboundQueue = {
      client: Promise.resolve(redis),
      add: jest.fn(async (_name, _data, opts) => ({ id: opts?.jobId ?? 'job-1' })),
      getJob: jest.fn()
    }
    const accountRepository = {
      findOne: jest.fn(async () => ({ enabled: true })),
      update: jest.fn(async () => ({ affected: 1 }))
    }
    const messageLogRepository = {
      save: jest.fn(async (value) => ({
        id: 'log-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...value
      })),
      update: jest.fn(async () => ({ affected: 1 })),
      findOne: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      find: jest.fn(async () => [])
    }
    const integrationRead = options.integrationRead ?? jest.fn(async () => integration)
    const pluginContext = {
      resolve: jest.fn(() => ({
        read: integrationRead
      }))
    }

    const service = new WechatPersonalOutboundQueueService(
      client as any,
      outboundQueue as any,
      accountRepository as any,
      messageLogRepository as any,
      pluginContext as any
    )
    return { service, client, redis, outboundQueue, accountRepository, messageLogRepository, integrationRead }
  }

  function createLog(overrides: Record<string, unknown> = {}) {
    return {
      id: 'log-1',
      integrationId: 'integration-1',
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      direction: 'outbound',
      status: 'queued',
      content: 'hello',
      payloadSummary: JSON.stringify({ atUsers: [] }),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      ...overrides
    }
  }

  function createJob(overrides: Partial<{ attemptsMade: number; opts: Record<string, unknown> }> = {}) {
    return {
      id: 'job-1',
      data: {
        integrationId: 'integration-1',
        outboundLogId: 'log-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } satisfies WechatPersonalOutboundQueueJobData,
      attemptsMade: overrides.attemptsMade ?? 0,
      opts: overrides.opts ?? { attempts: 2 }
    }
  }

  it('creates an outbound message log and delayed BullMQ job without calling wx2.0 immediately', async () => {
    const { service, client, outboundQueue, messageLogRepository } = createService()

    const result = await service.enqueueText(integration as any, {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      content: 'hello'
    })

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        queued: true,
        outboundLogId: 'log-1'
      })
    )
    expect(client.sendText).not.toHaveBeenCalled()
    expect(messageLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        direction: 'outbound',
        status: 'queued',
        scheduledAt: expect.any(Date)
      })
    )
    expect(outboundQueue.add).toHaveBeenCalledWith(
      WECHAT_PERSONAL_OUTBOUND_SEND_TEXT_JOB,
      expect.objectContaining({
        integrationId: 'integration-1',
        outboundLogId: 'log-1'
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^plugin_wechat_personal_outbound-/),
        delay: expect.any(Number),
        attempts: 2
      })
    )
  })

  it('sends once after acquiring Redis account and contact locks', async () => {
    const { service, client, redis, messageLogRepository, accountRepository } = createService()
    messageLogRepository.findOne.mockResolvedValueOnce(createLog())

    await service.processSendTextJob(createJob() as any)

    expect(redis.set).toHaveBeenCalledWith(
      'plugin_wechat_personal:lock:outbound',
      expect.any(String),
      'PX',
      expect.any(Number),
      'NX'
    )
    expect(redis.set).toHaveBeenCalledWith(
      'plugin_wechat_personal:lock:account:integration-1:uuid-1',
      expect.any(String),
      'PX',
      expect.any(Number),
      'NX'
    )
    expect(redis.set).toHaveBeenCalledWith(
      'plugin_wechat_personal:lock:contact:integration-1:uuid-1:wxid_friend',
      expect.any(String),
      'PX',
      expect.any(Number),
      'NX'
    )
    expect(client.sendText).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: 'hello'
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'log-1' }),
      expect.objectContaining({ status: 'sent', messageId: 'wx-msg-1', sentAt: expect.any(Date) })
    )
    expect(accountRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: 'integration-1', uuid: 'uuid-1' }),
      expect.objectContaining({ status: 'online', lastSendAt: expect.any(Date) })
    )
  })

  it('defers the job instead of sending when the contact lock is unavailable', async () => {
    const redis = createRedis({
      set: jest
        .fn()
        .mockResolvedValueOnce('OK')
        .mockResolvedValueOnce('OK')
        .mockResolvedValueOnce(null)
        .mockResolvedValue('OK')
    })
    const { service, client, outboundQueue, messageLogRepository } = createService({ redis })
    messageLogRepository.findOne.mockResolvedValueOnce(createLog())

    await service.processSendTextJob(createJob() as any)

    expect(client.sendText).not.toHaveBeenCalled()
    expect(outboundQueue.add).toHaveBeenCalledWith(
      WECHAT_PERSONAL_OUTBOUND_SEND_TEXT_JOB,
      expect.objectContaining({ outboundLogId: 'log-1' }),
      expect.objectContaining({ delay: expect.any(Number) })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'log-1' }),
      expect.objectContaining({ status: 'deferred', error: 'lock_unavailable' })
    )
  })

  it('does not resend terminal outbound logs when a job is replayed', async () => {
    const { service, client, messageLogRepository } = createService()
    messageLogRepository.findOne.mockResolvedValueOnce(createLog({ status: 'sent' }))

    await service.processSendTextJob(createJob() as any)

    expect(client.sendText).not.toHaveBeenCalled()
    expect(messageLogRepository.update).not.toHaveBeenCalled()
  })

  it('defers the job when the global send interval has not elapsed', async () => {
    const redis = createRedis({
      get: jest.fn(async (key: string) => (key === 'plugin_wechat_personal:next:outbound' ? String(Date.now() + 5000) : null))
    })
    const { service, client, outboundQueue, messageLogRepository } = createService({ redis })
    messageLogRepository.findOne.mockResolvedValueOnce(createLog())

    await service.processSendTextJob(createJob() as any)

    expect(client.sendText).not.toHaveBeenCalled()
    expect(outboundQueue.add).toHaveBeenCalledWith(
      WECHAT_PERSONAL_OUTBOUND_SEND_TEXT_JOB,
      expect.objectContaining({ outboundLogId: 'log-1' }),
      expect.objectContaining({ delay: expect.any(Number) })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'log-1' }),
      expect.objectContaining({ status: 'deferred', error: 'rate_limited' })
    )
  })

  it('does not cancel messages that have already been sent', async () => {
    const { service, outboundQueue, messageLogRepository } = createService()
    messageLogRepository.findOne.mockResolvedValueOnce(createLog({ status: 'sent', queueJobId: 'job-1' }))

    const result = await service.cancelOutboundQueueItem('integration-1', 'log-1')

    expect(result.success).toBe(false)
    expect(outboundQueue.getJob).not.toHaveBeenCalled()
    expect(messageLogRepository.update).not.toHaveBeenCalled()
  })

  it('does not create duplicate retry jobs for messages already pending in the queue', async () => {
    const { service, outboundQueue, messageLogRepository } = createService()
    messageLogRepository.findOne.mockResolvedValueOnce(createLog({ status: 'queued', queueJobId: 'job-1' }))

    const result = await service.retryOutboundQueueItem('integration-1', 'log-1')

    expect(result.success).toBe(false)
    expect(outboundQueue.add).not.toHaveBeenCalled()
    expect(messageLogRepository.update).not.toHaveBeenCalled()
  })

  it('marks final failures and pauses the account through the Redis failure guard', async () => {
    const redis = createRedis({
      incr: jest.fn(async () => 2)
    })
    const { service, redis: actualRedis, messageLogRepository, accountRepository } = createService({ redis })
    messageLogRepository.findOne.mockResolvedValueOnce(createLog())

    await service.handleJobFailure(createJob({ attemptsMade: 1, opts: { attempts: 2 } }) as any, new Error('wx failed'))

    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'log-1' }),
      expect.objectContaining({ status: 'failed', error: 'wx failed' })
    )
    expect(accountRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: 'integration-1', uuid: 'uuid-1' }),
      expect.objectContaining({ status: 'error', lastError: 'wx failed' })
    )
    expect(actualRedis.set).toHaveBeenCalledWith('plugin_wechat_personal:paused:account:integration-1:uuid-1', 'failure_guard')
  })
})
