jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  RequestContext: {
    currentTenantId: () => undefined,
    currentUserId: () => undefined,
    getOrganizationId: () => undefined
  }
}))

import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  MANAGED_QUEUE_SERVICE_TOKEN
} from '@xpert-ai/plugin-sdk'
import {
  WECHAT_OUTBOUND_QUEUE_NAME,
  WECHAT_OUTBOUND_SEND_TEXT_JOB,
  WECHAT_PLUGIN_NAME,
  WECHAT_PROVIDER_KEY
} from './constants.js'
import {
  WechatOutboundQueueJobData,
  WechatOutboundQueueService
} from './wechat-outbound-queue.service.js'

describe('WechatOutboundQueueService', () => {
  const originalFetch = globalThis.fetch
  const tempDirs: string[] = []

  afterEach(async () => {
    globalThis.fetch = originalFetch
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  const integration = {
    id: 'integration-1',
    provider: WECHAT_PROVIDER_KEY,
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

  function createService(
    options: {
      redis?: ReturnType<typeof createRedis>
      integrationRead?: jest.Mock
      workspaceFiles?: { readRuntimeBuffer: jest.Mock }
    } = {}
  ) {
    const client = {
      sendText: jest.fn(async () => ({ success: true, messageId: 'wx-msg-1' })),
      sendImage: jest.fn(async () => ({ success: true, messageId: 'wx-img-1' })),
      sendFile: jest.fn(async () => ({ success: true, messageId: 'wx-file-1' }))
    }
    const redis = options.redis ?? createRedis()
    const managedQueue = {
      enqueue: jest.fn(async (input: any) => ({ jobId: input?.jobId ?? 'job-1' })),
      cancel: jest.fn(async () => ({ success: true })),
      getJob: jest.fn(async () => null),
      getRedis: jest.fn(async () => redis)
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
    const integrationPermissionService = {
      read: integrationRead
    }
    const pluginContext = {
      scopeKey: 'org:org-1',
      resolve: jest.fn((token) => {
        if (token === MANAGED_QUEUE_SERVICE_TOKEN) {
          return managedQueue
        }
        if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) {
          return integrationPermissionService
        }
        if (token === 'XPERT_RUNTIME_CAPABILITIES') {
          return {
            get: jest.fn((key) => (key === 'platform.workspace.files' ? options.workspaceFiles : undefined))
          }
        }
        return integrationPermissionService
      })
    }

    const service = new WechatOutboundQueueService(
      client as any,
      accountRepository as any,
      messageLogRepository as any,
      pluginContext as any
    )
    return { service, client, redis, managedQueue, accountRepository, messageLogRepository, integrationRead }
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
      } satisfies WechatOutboundQueueJobData,
      attemptsMade: overrides.attemptsMade ?? 0,
      opts: overrides.opts ?? { attempts: 2 }
    }
  }

  async function createTempFile(name: string, content: string) {
    const dir = await mkdtemp(join(tmpdir(), 'wechat-outbound-file-'))
    tempDirs.push(dir)
    const filePath = join(dir, name)
    await writeFile(filePath, content)
    return {
      filePath,
      content,
      size: Buffer.byteLength(content),
      sha256: createHash('sha256').update(content).digest('hex')
    }
  }

  it('creates an outbound message log and delayed managed queue job without calling wx2.0 immediately', async () => {
    const { service, client, managedQueue, messageLogRepository } = createService()

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
        payloadSummary: JSON.stringify({
          type: 'text',
          source: 'message_reply',
          atUsers: []
        }),
        scheduledAt: expect.any(Date)
      })
    )
    expect(managedQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginName: WECHAT_PLUGIN_NAME,
        queueName: WECHAT_OUTBOUND_QUEUE_NAME,
        jobName: WECHAT_OUTBOUND_SEND_TEXT_JOB,
        payload: expect.objectContaining({
          integrationId: 'integration-1',
          outboundLogId: 'log-1'
        }),
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        scopeKey: 'org:org-1',
        jobId: expect.stringMatching(/^plugin_wechat_outbound-/),
        delayMs: expect.any(Number),
        attempts: 2
      })
    )
  })

  it('creates an outbound image log with a typed payload', async () => {
    const { service, managedQueue, messageLogRepository } = createService()

    const result = await service.enqueueImage(integration as any, {
      type: 'image',
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      imageUrl: 'https://example.com/a.png'
    })

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        queued: true,
        outboundLogId: 'log-1'
      })
    )
    expect(messageLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'https://example.com/a.png',
        payloadSummary: JSON.stringify({
          type: 'image',
          source: 'message_reply',
          imageUrl: 'https://example.com/a.png'
        })
      })
    )
    expect(managedQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginName: WECHAT_PLUGIN_NAME,
        queueName: WECHAT_OUTBOUND_QUEUE_NAME,
        jobName: WECHAT_OUTBOUND_SEND_TEXT_JOB,
        payload: expect.objectContaining({
          integrationId: 'integration-1',
          outboundLogId: 'log-1'
        }),
        attempts: 2
      })
    )
  })

  it('creates an outbound file log with metadata but no base64 content', async () => {
    const { service, client, managedQueue, messageLogRepository } = createService()

    const result = await service.enqueueFile(integration as any, {
      type: 'file',
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      filePath: '/tmp/report.pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: 12,
      sha256: 'hash-1',
      source: 'agent_tool',
      idempotencyKey: 'send-file-1'
    })

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        queued: true,
        outboundLogId: 'log-1'
      })
    )
    expect(client.sendFile).not.toHaveBeenCalled()
    expect(messageLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'report.pdf',
        payloadSummary: JSON.stringify({
          type: 'file',
          source: 'agent_tool',
          filePath: '/tmp/report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          extension: 'pdf',
          size: 12,
          sha256: 'hash-1',
          idempotencyKey: 'send-file-1'
        })
      })
    )
    expect(String((messageLogRepository.save as jest.Mock).mock.calls[0][0].payloadSummary)).not.toContain('base64')
    expect(managedQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginName: WECHAT_PLUGIN_NAME,
        queueName: WECHAT_OUTBOUND_QUEUE_NAME,
        jobName: WECHAT_OUTBOUND_SEND_TEXT_JOB,
        payload: expect.objectContaining({
          integrationId: 'integration-1',
          outboundLogId: 'log-1'
        }),
        attempts: 2
      })
    )
  })

  it('creates an outbound file log with a workspace file reference but no base64 content', async () => {
    const { service, messageLogRepository } = createService()

    const result = await service.enqueueFile(integration as any, {
      type: 'file',
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      filePath: '智能体平台功能列表.docx',
      fileRef: {
        source: 'platform.workspace.files',
        filePath: '智能体平台功能列表.docx',
        workspacePath: '智能体平台功能列表.docx',
        tenantId: 'tenant-1',
        userId: 'user-1',
        catalog: 'xperts',
        scopeId: 'xpert-1',
        xpertId: 'xpert-1',
        isolateByUser: false
      },
      fileName: '智能体平台功能列表.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
      size: 12,
      sha256: 'hash-1',
      source: 'agent_tool'
    })

    expect(result).toEqual(expect.objectContaining({ success: true, queued: true }))
    const payloadSummary = String((messageLogRepository.save as jest.Mock).mock.calls[0][0].payloadSummary)
    expect(payloadSummary).not.toContain('base64')
    expect(JSON.parse(payloadSummary)).toEqual(
      expect.objectContaining({
        type: 'file',
        filePath: '智能体平台功能列表.docx',
        fileRef: expect.objectContaining({
          source: 'platform.workspace.files',
          filePath: '智能体平台功能列表.docx',
          catalog: 'xperts',
          scopeId: 'xpert-1',
          tenantId: 'tenant-1'
        })
      })
    )
  })

  it('sends once after acquiring Redis account and contact locks', async () => {
    const { service, client, redis, messageLogRepository, accountRepository } = createService()
    messageLogRepository.findOne.mockResolvedValueOnce(createLog())

    await service.processSendTextJob(createJob() as any)

    expect(redis.set).toHaveBeenCalledWith(
      'plugin_wechat:tenant-1:integration-1:lock:outbound',
      expect.any(String),
      'PX',
      expect.any(Number),
      'NX'
    )
    expect(redis.set).toHaveBeenCalledWith(
      'plugin_wechat:tenant-1:integration-1:lock:account:uuid-1',
      expect.any(String),
      'PX',
      expect.any(Number),
      'NX'
    )
    expect(redis.set).toHaveBeenCalledWith(
      'plugin_wechat:tenant-1:integration-1:lock:contact:uuid-1:wxid_friend',
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

  it('downloads and sends an image job based on the typed payload', async () => {
    globalThis.fetch = jest.fn(async () => {
      return new Response(Buffer.from('image-bytes'), {
        status: 200,
        headers: {
          'content-type': 'image/png'
        }
      })
    }) as unknown as typeof fetch
    const { service, client, messageLogRepository } = createService()
    messageLogRepository.findOne.mockResolvedValueOnce(
      createLog({
        content: 'https://example.com/a.png',
        payloadSummary: JSON.stringify({
          type: 'image',
          source: 'agent_callback',
          imageUrl: 'https://example.com/a.png'
        })
      })
    )

    await service.processSendTextJob(createJob() as any)

    expect(client.sendText).not.toHaveBeenCalled()
    expect(client.sendImage).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        imageContent: Buffer.from('image-bytes').toString('base64')
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'log-1' }),
      expect.objectContaining({ status: 'sent', messageId: 'wx-img-1', sentAt: expect.any(Date) })
    )
  })

  it('reads and sends a queued file job based on the typed payload', async () => {
    const file = await createTempFile('report.pdf', 'file-bytes')
    const { service, client, messageLogRepository } = createService()
    messageLogRepository.findOne.mockResolvedValueOnce(
      createLog({
        content: 'report.pdf',
        payloadSummary: JSON.stringify({
          type: 'file',
          source: 'agent_tool',
          filePath: file.filePath,
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          extension: 'pdf',
          size: file.size,
          sha256: file.sha256
        })
      })
    )

    await service.processSendTextJob(createJob() as any)

    expect(client.sendText).not.toHaveBeenCalled()
    expect(client.sendImage).not.toHaveBeenCalled()
    expect(client.sendFile).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        fileName: 'report.pdf',
        fileContent: Buffer.from('file-bytes').toString('base64')
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'log-1' }),
      expect.objectContaining({ status: 'sent', messageId: 'wx-file-1', sentAt: expect.any(Date) })
    )
  })

  it('reads and sends a queued workspace file job through the workspace files capability', async () => {
    const fileBytes = Buffer.from('workspace-bytes')
    const sha256 = createHash('sha256').update(fileBytes).digest('hex')
    const workspaceFiles = {
      readRuntimeBuffer: jest.fn(async () => ({
        name: '智能体平台功能列表.docx',
        filePath: '智能体平台功能列表.docx',
        workspacePath: '/workspace/智能体平台功能列表.docx',
        catalog: 'xperts',
        scopeId: 'xpert-1',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: fileBytes.length,
        buffer: fileBytes,
        reference: {
          source: 'platform.workspace.files',
          filePath: '智能体平台功能列表.docx',
          workspacePath: '/workspace/智能体平台功能列表.docx',
          catalog: 'xperts',
          scopeId: 'xpert-1',
          xpertId: 'xpert-1'
        }
      }))
    }
    const { service, client, messageLogRepository } = createService({ workspaceFiles })
    messageLogRepository.findOne.mockResolvedValueOnce(
      createLog({
        content: '智能体平台功能列表.docx',
        payloadSummary: JSON.stringify({
          type: 'file',
          source: 'agent_tool',
          filePath: '智能体平台功能列表.docx',
          fileRef: {
            source: 'platform.workspace.files',
            filePath: '智能体平台功能列表.docx',
            workspacePath: '智能体平台功能列表.docx',
            tenantId: 'tenant-1',
            userId: 'user-1',
            catalog: 'xperts',
            scopeId: 'xpert-1',
            xpertId: 'xpert-1'
          },
          fileName: '智能体平台功能列表.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          extension: 'docx',
          size: fileBytes.length,
          sha256
        })
      })
    )

    await service.processSendTextJob(createJob() as any)

    expect(workspaceFiles.readRuntimeBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'platform.workspace.files',
        filePath: '智能体平台功能列表.docx',
        catalog: 'xperts',
        scopeId: 'xpert-1',
        tenantId: 'tenant-1'
      })
    )
    expect(client.sendText).not.toHaveBeenCalled()
    expect(client.sendImage).not.toHaveBeenCalled()
    expect(client.sendFile).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        fileName: '智能体平台功能列表.docx',
        fileContent: fileBytes.toString('base64')
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'log-1' }),
      expect.objectContaining({ status: 'sent', messageId: 'wx-file-1', sentAt: expect.any(Date) })
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
    const { service, client, managedQueue, messageLogRepository } = createService({ redis })
    messageLogRepository.findOne.mockResolvedValueOnce(createLog())

    await service.processSendTextJob(createJob() as any)

    expect(client.sendText).not.toHaveBeenCalled()
    expect(managedQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ outboundLogId: 'log-1' }),
        delayMs: expect.any(Number)
      })
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
      get: jest.fn(async (key: string) => (key === 'plugin_wechat:tenant-1:integration-1:next:outbound' ? String(Date.now() + 5000) : null))
    })
    const { service, client, managedQueue, messageLogRepository } = createService({ redis })
    messageLogRepository.findOne.mockResolvedValueOnce(createLog())

    await service.processSendTextJob(createJob() as any)

    expect(client.sendText).not.toHaveBeenCalled()
    expect(managedQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ outboundLogId: 'log-1' }),
        delayMs: expect.any(Number)
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'log-1' }),
      expect.objectContaining({ status: 'deferred', error: 'rate_limited' })
    )
  })

  it('does not cancel messages that have already been sent', async () => {
    const { service, managedQueue, messageLogRepository } = createService()
    messageLogRepository.findOne.mockResolvedValueOnce(createLog({ status: 'sent', queueJobId: 'job-1' }))

    const result = await service.cancelOutboundQueueItem('integration-1', 'log-1')

    expect(result.success).toBe(false)
    expect(managedQueue.cancel).not.toHaveBeenCalled()
    expect(messageLogRepository.update).not.toHaveBeenCalled()
  })

  it('does not create duplicate retry jobs for messages already pending in the queue', async () => {
    const { service, managedQueue, messageLogRepository } = createService()
    messageLogRepository.findOne.mockResolvedValueOnce(createLog({ status: 'queued', queueJobId: 'job-1' }))

    const result = await service.retryOutboundQueueItem('integration-1', 'log-1')

    expect(result.success).toBe(false)
    expect(managedQueue.enqueue).not.toHaveBeenCalled()
    expect(messageLogRepository.update).not.toHaveBeenCalled()
  })

  it('does not create retry jobs while the account is paused by the failure guard', async () => {
    const redis = createRedis({
      get: jest.fn(async (key: string) =>
        key === 'plugin_wechat:tenant-1:integration-1:paused:account:uuid-1' ? 'failure_guard' : null
      )
    })
    const { service, managedQueue, messageLogRepository } = createService({ redis })
    messageLogRepository.findOne.mockResolvedValueOnce(createLog({ status: 'failed', error: 'wx failed' }))

    const result = await service.retryOutboundQueueItem('integration-1', 'log-1')

    expect(result.success).toBe(false)
    expect(result.message).toContain('连续发送失败自动暂停')
    expect(managedQueue.enqueue).not.toHaveBeenCalled()
    expect(messageLogRepository.update).not.toHaveBeenCalled()
  })

  it('resolves account pause reason for workbench account rows', async () => {
    const redis = createRedis({
      get: jest.fn(async (key: string) =>
        key === 'plugin_wechat:tenant-1:integration-1:paused:account:uuid-1' ? 'failure_guard' : null
      )
    })
    const { service, redis: actualRedis } = createService({ redis })

    await expect(
      service.getOutboundAccountPausedReason('integration-1', 'uuid-1', {
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    ).resolves.toBe('outbound_account_paused:failure_guard')

    expect(actualRedis.get).toHaveBeenCalledWith('plugin_wechat:tenant-1:integration-1:paused:account:uuid-1')
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
    expect(actualRedis.set).toHaveBeenCalledWith('plugin_wechat:tenant-1:integration-1:paused:account:uuid-1', 'failure_guard')
  })
})
