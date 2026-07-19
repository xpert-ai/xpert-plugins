jest.mock('@xpert-ai/plugin-sdk', () => {
  const { createLarkPluginSdkMock } = require('../../../../test-utils/larkPluginSdkMock.cjs')
  return createLarkPluginSdkMock(jest, {
    WorkspaceFilesRuntimeCapability: Symbol('WorkspaceFilesRuntimeCapability'),
    XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES_TOKEN'
  })
})

import { LarkMessageHistoryService } from './lark-message-history.service.js'
import { Readable } from 'node:stream'

describe('LarkMessageHistoryService', () => {
  function createFixture(params?: {
    logs?: any[]
    queryLogs?: any[]
    queryCount?: number
    files?: any[]
    findOne?: jest.Mock
    runtimeCapabilities?: any
    cacheManager?: any
  }) {
    const queryBuilder: Record<string, jest.Mock> = {}
    for (const method of ['where', 'andWhere', 'orWhere', 'orderBy', 'addOrderBy', 'take', 'skip']) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder)
    }
    queryBuilder.getMany = jest.fn().mockResolvedValue(params?.queryLogs ?? params?.logs ?? [])
    queryBuilder.getManyAndCount = jest
      .fn()
      .mockResolvedValue([
        params?.queryLogs ?? params?.logs ?? [],
        params?.queryCount ?? params?.queryLogs?.length ?? params?.logs?.length ?? 0
      ])
    queryBuilder.getCount = jest
      .fn()
      .mockResolvedValue(params?.queryCount ?? params?.queryLogs?.length ?? params?.logs?.length ?? 0)
    const messageLogRepository = {
      findOne: params?.findOne ?? jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue(params?.logs ?? []),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      create: jest.fn((value) => ({ id: 'created-log', createdAt: new Date(), ...value })),
      save: jest.fn(async (value) => value),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(params?.logs?.length ?? 0),
      delete: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const messageFileRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue(params?.files ?? []),
      create: jest.fn((value) => ({ id: 'created-file', createdAt: new Date(), ...value })),
      save: jest.fn(async (value) => value),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const larkChannel = {
      getOrCreateLarkClientById: jest.fn()
    }
    const cacheStore = new Map<string, unknown>()
    const cacheManager =
      params?.cacheManager ??
      {
        get: jest.fn(async (key: string) => cacheStore.get(key)),
        set: jest.fn(async (key: string, value: unknown) => {
          cacheStore.set(key, value)
        })
      }
    const service = new LarkMessageHistoryService(
      messageLogRepository as any,
      messageFileRepository as any,
      larkChannel as any,
      params?.runtimeCapabilities,
      cacheManager
    )
    return { service, messageLogRepository, messageFileRepository, larkChannel, queryBuilder, cacheManager }
  }

  it('deduplicates inbound callbacks by integration, direction, and message id', async () => {
    const existing = {
      id: 'log-1',
      integrationId: 'integration-1',
      direction: 'inbound',
      messageId: 'message-1'
    }
    const findOne = jest.fn().mockResolvedValue(existing)
    const { service, messageLogRepository } = createFixture({ findOne })

    await expect(
      service.captureInbound({
        integrationId: 'integration-1',
        scopeKey: 'group:chat-1',
        xpertId: 'xpert-1',
        messageId: 'message-1'
      })
    ).resolves.toEqual({ log: existing, created: false })

    expect(findOne).toHaveBeenCalledWith({
      where: {
        integrationId: 'integration-1',
        direction: 'inbound',
        messageId: 'message-1'
      }
    })
    expect(messageLogRepository.save).not.toHaveBeenCalled()
  })

  it('searches only the trusted tenant, organization, integration, xpert, and conversation scope', async () => {
    const resetAt = new Date('2026-07-15T09:00:00.000Z')
    const logs = [
      {
        id: 'current-log',
        direction: 'inbound',
        status: 'dispatched',
        content: 'current',
        createdAt: new Date('2026-07-15T09:04:00.000Z')
      },
      {
        id: 'after-reset',
        direction: 'inbound',
        status: 'history_only',
        content: 'after reset',
        messageType: 'text',
        createdAt: new Date('2026-07-15T09:03:00.000Z')
      },
      {
        id: 'reset',
        direction: 'system',
        status: 'context_reset',
        content: 'history_context_reset',
        createdAt: resetAt
      },
      {
        id: 'before-reset',
        direction: 'inbound',
        status: 'history_only',
        content: 'before reset',
        createdAt: new Date('2026-07-15T08:59:00.000Z')
      }
    ]
    const { service, messageLogRepository, queryBuilder } = createFixture({ logs })
    messageLogRepository.findOne.mockResolvedValue({ createdAt: resetAt })
    messageLogRepository.createQueryBuilder().getMany.mockResolvedValue([logs[1]])

    const result = await service.searchChatHistory({
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      excludedLogIds: ['current-log'],
      respectContextReset: true,
      hasAttachments: true,
      limit: 20
    })

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'EXISTS (SELECT 1 FROM plugin_lark_message_file history_file WHERE history_file."messageLogId" = CAST(log.id AS text))'
    )

    expect(result.items.map((item) => item.id)).toEqual(['after-reset'])
    expect(messageLogRepository.createQueryBuilder).toHaveBeenCalledWith('log')
  })

  it('upserts one outbound row per run id instead of appending stream patches', async () => {
    const existing = {
      id: 'outbound-1',
      integrationId: 'integration-1',
      direction: 'outbound',
      runId: 'run-1',
      status: 'queued',
      content: ''
    }
    const findOne = jest.fn().mockResolvedValue(existing)
    const { service, messageLogRepository } = createFixture({ findOne })

    const result = await service.recordOutbound({
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      runId: 'run-1',
      status: 'sent',
      content: 'final response'
    })

    expect(result.created).toBe(false)
    expect(messageLogRepository.save).toHaveBeenCalledTimes(1)
    expect(messageLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', content: 'final response' })
    )
  })

  it('can filter and return attachment-only local history messages', async () => {
    const createdAt = new Date('2026-07-15T09:03:00.000Z')
    const { service } = createFixture({
      logs: [
        {
          id: 'attachment-log',
          direction: 'inbound',
          status: 'history_only',
          content: '',
          messageType: 'file',
          createdAt
        }
      ],
      files: [
        {
          id: 'attachment-file',
          messageLogId: 'attachment-log',
          status: 'ready',
          fileAssetId: 'asset-1',
          resourceKey: 'file-key-1',
          createdAt
        }
      ]
    })

    const result = await service.searchChatHistory({
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      hasAttachments: true,
      includeFiles: true
    })

    expect(result.items.map((item) => item.id)).toEqual(['attachment-log'])
    expect(result.files).toEqual([expect.objectContaining({ fileAssetId: 'asset-1' })])
  })

  it('pushes time, keyword, and pagination limits into the database query', async () => {
    const { service, queryBuilder } = createFixture({ queryLogs: [] })

    await service.searchChatHistory({
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      before: '2026-07-15T09:00:00.000Z',
      after: '2026-07-01T09:00:00.000Z',
      keyword: 'quarterly_100%',
      limit: 20
    })

    expect(queryBuilder.take).toHaveBeenCalledWith(21)
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.createdAt < :before', {
      before: new Date('2026-07-15T09:00:00.000Z')
    })
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.createdAt > :lowerBound', {
      lowerBound: new Date('2026-07-01T09:00:00.000Z')
    })
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.anything(), {
      keyword: '%quarterly!_100!%%'
    })
  })

  it('returns an opaque keyset cursor without confusing stored and provider timestamps', async () => {
    const rows = [
      {
        id: 'log-3',
        direction: 'inbound',
        status: 'history_only',
        content: 'third',
        createdAt: new Date('2026-07-15T09:03:00.000Z'),
        messageCreatedAt: new Date('2026-07-15T08:03:00.000Z')
      },
      {
        id: 'log-2',
        direction: 'inbound',
        status: 'history_only',
        content: 'second',
        createdAt: new Date('2026-07-15T09:02:00.000Z')
      },
      {
        id: 'log-1',
        direction: 'inbound',
        status: 'history_only',
        content: 'first',
        createdAt: new Date('2026-07-15T09:01:00.000Z')
      }
    ]
    const { service, queryBuilder } = createFixture({ queryLogs: rows })

    const firstPage = await service.searchChatHistory({
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      limit: 2
    })

    expect(firstPage.items.map((item) => item.id)).toEqual(['log-2', 'log-3'])
    expect(firstPage.items[1]).toEqual(
      expect.objectContaining({
        createdAt: rows[0].createdAt,
        messageCreatedAt: rows[0].messageCreatedAt
      })
    )
    expect(firstPage.nextCursor).toEqual(expect.any(String))

    await service.searchChatHistory({
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      limit: 2,
      cursor: firstPage.nextCursor
    })
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.anything())
  })

  it('rejects malformed local history cursors', async () => {
    const { service } = createFixture({ queryLogs: [] })

    await expect(
      service.searchChatHistory({
        integrationId: 'integration-1',
        scopeKey: 'group:chat-1',
        xpertId: 'xpert-1',
        cursor: 'not-a-cursor'
      })
    ).rejects.toThrow('Invalid Lark history cursor')
  })

  it('uses database count and page boundaries for the integration message view', async () => {
    const rows = [{ id: 'log-101' }]
    const { service, queryBuilder } = createFixture({ queryLogs: rows, queryCount: 250_001 })

    const result = await service.listMessageLogs({
      integrationId: 'integration-1',
      page: 101,
      pageSize: 100,
      search: 'alice'
    })

    expect(queryBuilder.skip).toHaveBeenCalledWith(10_000)
    expect(queryBuilder.take).toHaveBeenCalledWith(101)
    expect(queryBuilder.getManyAndCount).toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ items: rows, total: 250_001 }))
  })

  it('bounds automatic context by item length and excludes current batch ids in the query', async () => {
    const createdAt = new Date('2026-07-15T09:03:00.000Z')
    const { service, messageLogRepository } = createFixture({
      logs: [
        {
          id: 'history-log',
          direction: 'inbound',
          status: 'history_only',
          content: 'A'.repeat(1500),
          createdAt
        }
      ]
    })

    const result = await service.buildHistoryBundle({
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      limit: 20,
      windowSeconds: 3600,
      before: new Date('2026-07-15T09:05:00.000Z'),
      excludedLogIds: ['current-1', 'current-2']
    })

    expect(result.context?.match(/A/g)?.length).toBeLessThanOrEqual(1000)
    expect(result.context).toContain('...[截断]')
    expect(messageLogRepository.find).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }))
  })

  it('retains expired rows when deleting the workspace object fails', async () => {
    const log = {
      id: 'expired-log',
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    }
    const file = {
      id: 'expired-file',
      messageLogId: 'expired-log',
      filePath: 'files/lark/expired.txt',
      xpertId: 'xpert-1',
      status: 'ready',
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    }
    const workspaceFiles = {
      deleteFile: jest.fn().mockRejectedValue(new Error('storage unavailable'))
    }
    const { service, messageLogRepository, messageFileRepository } = createFixture({
      logs: [log],
      files: [file],
      runtimeCapabilities: { get: jest.fn().mockReturnValue(workspaceFiles) }
    })

    const result = await service.cleanupExpired({
      olderThan: new Date('2026-02-01T00:00:00.000Z')
    })

    expect(result).toEqual(expect.objectContaining({ deletedLogs: 0, deletedFiles: 0, failedFiles: 1 }))
    expect(messageFileRepository.delete).not.toHaveBeenCalled()
    expect(messageLogRepository.delete).not.toHaveBeenCalled()
  })

  it.each([
    ['file', 'file'],
    ['audio', 'file'],
    ['media', 'file'],
    ['image', 'image']
  ] as const)(
    'downloads a pending %s resource with Lark API type %s and persists its workspace references',
    async (resourceType, expectedApiType) => {
      const row = {
        id: 'file-row-1',
        messageLogId: 'log-1',
        integrationId: 'integration-1',
        scopeKey: 'group:chat-1',
        xpertId: 'xpert-1',
        messageId: 'message-1',
        resourceKey: 'file-key-1',
        resourceType,
        originalName: 'report.txt',
        status: 'pending',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        createdAt: new Date('2026-07-15T08:00:00.000Z')
      }
      const workspaceFiles = {
        uploadBuffer: jest.fn().mockResolvedValue({
          filePath: 'files/lark/report.txt',
          workspacePath: 'workspace/report.txt',
          catalog: 'xperts',
          scopeId: 'xpert-1',
          mimeType: 'text/plain'
        }),
        understandFile: jest.fn().mockResolvedValue({
          fileAssetId: 'asset-1',
          fileId: 'file-1',
          storageFileId: 'storage-1',
          filePath: 'files/lark/report.txt',
          workspacePath: 'workspace/report.txt',
          originalName: 'report.txt',
          mimeType: 'text/plain',
          size: 5,
          catalog: 'xperts',
          scopeId: 'xpert-1'
        })
      }
      const { service, messageFileRepository, larkChannel } = createFixture({
        files: [row],
        runtimeCapabilities: { get: jest.fn().mockReturnValue(workspaceFiles) }
      })
      const getResource = jest.fn().mockResolvedValue({
        headers: { 'content-length': '5', 'content-type': 'text/plain' },
        getReadableStream: () => Readable.from(Buffer.from('hello'))
      })
      larkChannel.getOrCreateLarkClientById.mockResolvedValue({
        im: {
          messageResource: {
            get: getResource
          }
        }
      })

      const result = await service.materializeFiles({
        integrationId: 'integration-1',
        xpertId: 'xpert-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        messageLogIds: ['log-1'],
        maxSizeMb: 10
      })

      expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          xpertId: 'xpert-1',
          fileName: 'report.txt',
          size: 5,
          buffer: Buffer.from('hello')
        })
      )
      expect(workspaceFiles.understandFile).toHaveBeenCalled()
      expect(getResource).toHaveBeenCalledWith({
        params: { type: expectedApiType },
        path: { message_id: 'message-1', file_key: 'file-key-1' }
      })
      expect(messageFileRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'ready', fileAssetId: 'asset-1', fileId: 'file-1' })
      )
      expect(result.failed).toEqual([])
      expect(result.files).toEqual([
        expect.objectContaining({ fileAssetId: 'asset-1', fileId: 'file-1', workspacePath: 'workspace/report.txt' })
      ])
    }
  )

  it('returns inline image content for dispatch while retaining the workspace reference', async () => {
    const row = {
      id: 'image-row-1',
      messageLogId: 'log-1',
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      messageId: 'message-1',
      resourceKey: 'image-key-1',
      resourceType: 'image',
      originalName: 'photo.png',
      status: 'pending',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      createdById: 'user-1',
      createdAt: new Date('2026-07-15T08:00:00.000Z')
    }
    const workspaceUrl = 'http://localhost:3000/api/sandbox/volume/xpert/xpert-1/files/lark/photo.png'
    const workspaceFiles = {
      uploadBuffer: jest.fn().mockResolvedValue({
        filePath: 'files/lark/photo.png',
        workspacePath: 'files/lark/photo.png',
        fileUrl: workspaceUrl,
        url: workspaceUrl,
        catalog: 'xperts',
        scopeId: 'xpert-1',
        mimeType: 'image/png'
      }),
      understandFile: jest.fn().mockResolvedValue({
        fileAssetId: 'asset-1',
        fileId: 'file-1',
        filePath: 'files/lark/photo.png',
        workspacePath: 'files/lark/photo.png',
        fileUrl: workspaceUrl,
        url: workspaceUrl,
        originalName: 'photo.png',
        mimeType: 'image/png',
        size: 3,
        catalog: 'xperts',
        scopeId: 'xpert-1'
      }),
      readBuffer: jest.fn().mockResolvedValue({
        filePath: 'files/lark/photo.png',
        workspacePath: 'files/lark/photo.png',
        mimeType: 'image/png',
        size: 3,
        buffer: Buffer.from('abc')
      })
    }
    const { service, larkChannel } = createFixture({
      files: [row],
      runtimeCapabilities: { get: jest.fn().mockReturnValue(workspaceFiles) }
    })
    larkChannel.getOrCreateLarkClientById.mockResolvedValue({
      im: {
        messageResource: {
          get: jest.fn().mockResolvedValue({
            headers: { 'content-length': '3', 'content-type': 'image/png' },
            getReadableStream: () => Readable.from(Buffer.from('abc'))
          })
        }
      }
    })

    const result = await service.materializeFiles({
      integrationId: 'integration-1',
      xpertId: 'xpert-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      messageLogIds: ['log-1'],
      inlineImageContent: true
    })

    expect(workspaceFiles.readBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        catalog: 'xperts',
        scopeId: 'xpert-1',
        xpertId: 'xpert-1',
        filePath: 'files/lark/photo.png'
      })
    )
    expect(result.files).toEqual([
      expect.objectContaining({
        fileAssetId: 'asset-1',
        fileUrl: 'data:image/png;base64,YWJj',
        url: 'data:image/png;base64,YWJj',
        mimeType: 'image/png',
        size: 3
      })
    ])
    expect(row.fileUrl).toBe(workspaceUrl)
  })

  it('reclaims an attachment whose processing lease expired', async () => {
    const row = {
      id: 'stale-processing-file',
      messageLogId: 'log-1',
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      messageId: 'message-1',
      resourceKey: 'file-key-1',
      resourceType: 'file',
      originalName: 'report.txt',
      status: 'processing',
      updatedAt: new Date(Date.now() - 16 * 60 * 1000)
    }
    const workspaceFiles = {
      uploadBuffer: jest.fn().mockResolvedValue({ filePath: 'files/report.txt', catalog: 'xperts' }),
      understandFile: jest.fn().mockResolvedValue({ fileAssetId: 'asset-1', filePath: 'files/report.txt' })
    }
    const { service, larkChannel, messageFileRepository } = createFixture({
      files: [row],
      runtimeCapabilities: { get: jest.fn().mockReturnValue(workspaceFiles) }
    })
    larkChannel.getOrCreateLarkClientById.mockResolvedValue({
      im: {
        messageResource: {
          get: jest.fn().mockResolvedValue({
            headers: { 'content-length': '5' },
            getReadableStream: () => Readable.from(Buffer.from('hello'))
          })
        }
      }
    })

    await service.materializeFiles({
      integrationId: 'integration-1',
      xpertId: 'xpert-1',
      messageLogIds: ['log-1']
    })

    expect(messageFileRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id, status: 'processing', updatedAt: expect.anything() }),
      expect.objectContaining({ status: 'processing' })
    )
    expect(row.status).toBe('ready')
  })

  it('retries workspace understanding without downloading or uploading the resource again', async () => {
    const row = {
      id: 'uploaded-file',
      messageLogId: 'log-1',
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      messageId: 'message-1',
      resourceKey: 'file-key-1',
      resourceType: 'file',
      originalName: 'report.txt',
      status: 'failed',
      error: 'understand temporarily unavailable',
      filePath: 'files/lark/report.txt',
      workspacePath: '/workspace/report.txt',
      workspaceCatalog: 'xperts',
      size: 5
    }
    const workspaceFiles = {
      uploadBuffer: jest.fn(),
      understandFile: jest.fn().mockResolvedValue({
        fileAssetId: 'asset-1',
        filePath: row.filePath,
        workspacePath: row.workspacePath
      })
    }
    const { service, larkChannel } = createFixture({
      files: [row],
      runtimeCapabilities: { get: jest.fn().mockReturnValue(workspaceFiles) }
    })

    await service.materializeFiles({
      integrationId: 'integration-1',
      xpertId: 'xpert-1',
      messageLogIds: ['log-1']
    })

    expect(larkChannel.getOrCreateLarkClientById).not.toHaveBeenCalled()
    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
    expect(workspaceFiles.understandFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: row.filePath }))
    expect(row.status).toBe('ready')
  })

  it('materializes every attachment while returning at most twenty context files', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      id: `file-${index}`,
      messageLogId: 'log-1',
      integrationId: 'integration-1',
      scopeKey: 'group:chat-1',
      xpertId: 'xpert-1',
      messageId: 'message-1',
      resourceKey: `file-key-${index}`,
      resourceType: 'file',
      originalName: `report-${index}.txt`,
      status: 'pending'
    }))
    const workspaceFiles = {
      uploadBuffer: jest.fn().mockImplementation(async ({ fileName }) => ({
        filePath: `files/${fileName}`,
        catalog: 'xperts'
      })),
      understandFile: jest.fn().mockImplementation(async ({ filePath }) => ({
        fileAssetId: `asset-${filePath}`,
        filePath
      }))
    }
    const { service, larkChannel } = createFixture({
      files: rows,
      runtimeCapabilities: { get: jest.fn().mockReturnValue(workspaceFiles) }
    })
    const getResource = jest.fn().mockResolvedValue({
      headers: { 'content-length': '5' },
      getReadableStream: () => Readable.from(Buffer.from('hello'))
    })
    larkChannel.getOrCreateLarkClientById.mockResolvedValue({
      im: { messageResource: { get: getResource } }
    })

    const result = await service.materializeFiles({
      integrationId: 'integration-1',
      xpertId: 'xpert-1',
      messageLogIds: ['log-1'],
      maxFiles: 20
    })

    expect(getResource).toHaveBeenCalledTimes(25)
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledTimes(25)
    expect(rows.every((row) => row.status === 'ready')).toBe(true)
    expect(result.files).toHaveLength(20)
  })

  it('returns a cleanup cursor even when the oldest poison batch cannot delete any file', async () => {
    const logs = Array.from({ length: 501 }, (_, index) => ({
      id: `log-${String(index).padStart(3, '0')}`,
      createdAt: new Date(1_700_000_000_000 + index)
    }))
    const files = logs.slice(0, 500).map((log, index) => ({
      id: `file-${index}`,
      messageLogId: log.id,
      filePath: `files/${index}.txt`,
      status: 'ready',
      createdAt: log.createdAt
    }))
    const { service } = createFixture({
      logs,
      files,
      runtimeCapabilities: {
        get: jest.fn().mockReturnValue({ deleteFile: jest.fn().mockRejectedValue(new Error('storage unavailable')) })
      }
    })

    const result = await service.cleanupExpired({
      olderThan: new Date('2030-01-01T00:00:00.000Z'),
      batchSize: 500
    })

    expect(result).toEqual(
      expect.objectContaining({
        deletedLogs: 0,
        failedFiles: 500,
        hasMore: true,
        nextCursor: { createdAt: logs[499].createdAt, id: logs[499].id }
      })
    )
  })

  it('reuses the server-cached exact total for an admin keyset cursor', async () => {
    const rows = [
      { id: 'log-3', createdAt: new Date('2026-07-15T09:03:00.000Z') },
      { id: 'log-2', createdAt: new Date('2026-07-15T09:02:00.000Z') },
      { id: 'log-1', createdAt: new Date('2026-07-15T09:01:00.000Z') }
    ]
    const { service, queryBuilder } = createFixture({ queryLogs: rows, queryCount: 250_001 })
    const first = await service.listMessageLogs({ integrationId: 'integration-1', pageSize: 2 })
    expect(first.nextCursor).toEqual(expect.any(String))

    queryBuilder.getManyAndCount.mockClear()
    queryBuilder.getCount.mockClear()
    const second = await service.listMessageLogs({
      integrationId: 'integration-1',
      page: 2,
      pageSize: 2,
      cursor: first.nextCursor
    })

    expect(second.total).toBe(250_001)
    expect(queryBuilder.getManyAndCount).not.toHaveBeenCalled()
    expect(queryBuilder.getCount).not.toHaveBeenCalled()
  })

  it('rejects an admin keyset cursor when filters change', async () => {
    const rows = [
      { id: 'log-2', createdAt: new Date('2026-07-15T09:02:00.000Z') },
      { id: 'log-1', createdAt: new Date('2026-07-15T09:01:00.000Z') }
    ]
    const { service } = createFixture({ queryLogs: rows, queryCount: 2 })
    const first = await service.listMessageLogs({
      integrationId: 'integration-1',
      pageSize: 1,
      search: 'alpha'
    })

    await expect(
      service.listMessageLogs({
        integrationId: 'integration-1',
        page: 2,
        pageSize: 1,
        search: 'beta',
        cursor: first.nextCursor
      })
    ).rejects.toThrow('Invalid Lark message page cursor')
  })
})
