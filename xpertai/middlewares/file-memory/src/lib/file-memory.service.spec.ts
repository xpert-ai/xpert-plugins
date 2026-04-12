import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const mockLongTermMemoryTypeEnum = {
  PROFILE: 'profile',
  QA: 'qa'
}

jest.mock('@xpert-ai/contracts', () => ({
  __esModule: true,
  LongTermMemoryTypeEnum: {
    PROFILE: 'profile',
    QA: 'qa'
  }
}))

import { XpertFileMemoryService } from './file-memory.service.js'
import { FileMemoryLayerResolver } from './layer-resolver.js'

describe('XpertFileMemoryService freshness alignment', () => {
  let tempDir: string
  let service: XpertFileMemoryService
  let store: { cacheKey: string }
  let fileRepository: {
    listFiles: jest.Mock
    readFile: jest.Mock
    writeFile: jest.Mock
    getMtimeMs: jest.Mock
  }
  let writePolicy: {
    resolveAudience: jest.Mock
  }
  let recallPlanner: {
    selectRecallHeaders: jest.Mock
    selectSummaryDigestHeaders: jest.Mock
    selectAsyncRecallHeaders: jest.Mock
  }

  const layer = {
    scope: {
      scopeType: 'xpert' as const,
      scopeId: 'xpert-1'
    },
    audience: 'shared' as const,
    layerLabel: 'Shared Memory'
  }

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'file-memory-service-'))
    store = {
      cacheKey: 'test-store'
    }

    fileRepository = {
      listFiles: jest.fn().mockResolvedValue([]),
      readFile: jest.fn((_store: unknown, filePath: string) => fsPromises.readFile(resolveFsPath(tempDir, filePath), 'utf8')),
      writeFile: jest.fn(async (_store: unknown, filePath: string, content: string) => {
        const fsPath = resolveFsPath(tempDir, filePath)
        await fsPromises.mkdir(path.dirname(fsPath), { recursive: true })
        await fsPromises.writeFile(fsPath, content, 'utf8')
      }),
      getMtimeMs: jest.fn(async (_store: unknown, filePath: string) => {
        const stat = await fsPromises.stat(resolveFsPath(tempDir, filePath))
        return stat.mtimeMs
      })
    }

    recallPlanner = {
      selectRecallHeaders: jest.fn(async (_query, headers) => ({
        headers,
        strategy: 'fallback' as const
      })),
      selectSummaryDigestHeaders: jest.fn(async (_query, headers) => ({
        headers,
        strategy: 'fallback' as const
      })),
      selectAsyncRecallHeaders: jest.fn(async (_query, headers) => ({
        headers,
        strategy: 'fallback' as const
      }))
    }
    writePolicy = {
      resolveAudience: jest.fn().mockReturnValue('shared')
    }

    service = new XpertFileMemoryService(
      new FileMemoryLayerResolver(),
      fileRepository as any,
      recallPlanner as any,
      writePolicy as any
    )
  })

  afterEach(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  it('keeps old active memories recall-eligible and adds a Claude Code style staleness note from mtime', async () => {
    const filePath = path.posix.join('xperts', 'xpert-1', 'shared', mockLongTermMemoryTypeEnum.PROFILE, 'old-memory.md')
    const oldTime = new Date(Date.now() - 5 * 86_400_000)

    await writeMemoryFile(tempDir, filePath, {
      title: 'Deployment checklist',
      summary: 'Critical deployment notes',
      updatedAt: new Date().toISOString()
    })
    await fsPromises.utimes(resolveFsPath(tempDir, filePath), oldTime, oldTime)
    fileRepository.listFiles.mockImplementation(async (_store: unknown, targetLayer: typeof layer) =>
      targetLayer.audience === 'shared' ? [filePath] : []
    )

    const recall = await service.buildRuntimeRecall(store as any, layer.scope, {
      query: 'deployment',
      userId: 'u1'
    })

    expect(recallPlanner.selectAsyncRecallHeaders).toHaveBeenCalledTimes(1)
    expect(recallPlanner.selectAsyncRecallHeaders.mock.calls[0][1]).toHaveLength(1)
    expect(recall.selected).toHaveLength(1)
    expect(recall.details).toHaveLength(1)
    expect(recall.details[0].freshnessNote).toContain('This memory is')
    expect(recall.details[0].content).toContain('Verify against current code before asserting as fact.')
  })

  it('builds the first-answer summary digest with the local summary selector only', async () => {
    const filePath = path.posix.join('xperts', 'xpert-1', 'shared', mockLongTermMemoryTypeEnum.PROFILE, 'digest-memory.md')

    await writeMemoryFile(tempDir, filePath, {
      title: '饮食偏好',
      summary: '张三爱吃麦当劳',
      updatedAt: new Date().toISOString()
    })
    fileRepository.listFiles.mockImplementation(async (_store: unknown, targetLayer: typeof layer) =>
      targetLayer.audience === 'shared' ? [filePath] : []
    )

    const digest = await service.buildRuntimeSummaryDigest(store as any, layer.scope, {
      query: '张三爱吃什么',
      userId: 'u1'
    })

    expect(recallPlanner.selectSummaryDigestHeaders).toHaveBeenCalledTimes(1)
    expect(recallPlanner.selectAsyncRecallHeaders).not.toHaveBeenCalled()
    expect(digest).toHaveLength(1)
    expect(digest[0].summary).toBe('张三爱吃麦当劳')
    expect(digest[0].relativePath).toBe('shared/profile/digest-memory.md')
  })

  it('uses file mtime rather than updatedAt when deciding whether to show a staleness note', async () => {
    const filePath = path.posix.join('xperts', 'xpert-1', 'shared', mockLongTermMemoryTypeEnum.PROFILE, 'fresh-memory.md')

    await writeMemoryFile(tempDir, filePath, {
      title: 'Fresh preference',
      summary: 'Recently touched file',
      updatedAt: '2020-01-01T00:00:00.000Z'
    })
    fileRepository.listFiles.mockImplementation(async (_store: unknown, targetLayer: typeof layer) =>
      targetLayer.audience === 'shared' ? [filePath] : []
    )

    const recall = await service.buildRuntimeRecall(store as any, layer.scope, {
      query: 'preference',
      userId: 'u1'
    })

    expect(recall.selected).toHaveLength(1)
    expect(recall.details).toHaveLength(1)
    expect(recall.details[0].freshnessNote).toBeNull()
    expect(recall.details[0].content).toContain('saved: today')
    expect(recall.details[0].content).not.toContain('This memory is')
  })

  it('filters private memories by ownerUserId inside the shared private layer directory', async () => {
    const ownFilePath = path.posix.join('xperts', 'xpert-1', 'private', 'user', 'my-style.md')
    const otherFilePath = path.posix.join('xperts', 'xpert-1', 'private', 'user', 'other-style.md')

    await Promise.all([
      writeMemoryFile(tempDir, ownFilePath, {
        title: '我的偏好',
        summary: '回答要简洁',
        updatedAt: new Date().toISOString(),
        audience: 'user',
        ownerUserId: 'u1'
      }),
      writeMemoryFile(tempDir, otherFilePath, {
        title: '别人的偏好',
        summary: '回答要非常详细',
        updatedAt: new Date().toISOString(),
        audience: 'user',
        ownerUserId: 'u2'
      })
    ])

    fileRepository.listFiles.mockImplementation(async (_store: unknown, targetLayer: typeof layer) => {
      if (targetLayer.audience === 'user') {
        return [ownFilePath, otherFilePath]
      }
      return []
    })

    const digest = await service.buildRuntimeSummaryDigest(store as any, layer.scope, {
      query: '我的回答偏好',
      userId: 'u1'
    })

    expect(digest).toHaveLength(1)
    expect(digest[0].title).toBe('我的偏好')
    expect(digest[0].relativePath).toBe('private/user/my-style.md')
  })

  it('writes new semantic memories into semantic directories', async () => {
    fileRepository.listFiles.mockImplementation(async () => [])

    const record = await service.upsert(store as any, {
      scope: layer.scope,
      audience: 'shared',
      kind: mockLongTermMemoryTypeEnum.QA as any,
      semanticKind: 'project' as any,
      title: 'Launch plan',
      content: 'Ship the launch checklist and keep the owner updated.',
      createdBy: 'u1'
    })

    expect(record.semanticKind).toBe('project')
    expect(record.relativePath.startsWith('shared/project/')).toBe(true)
    expect(record.filePath).toContain('xperts/xpert-1/shared/project/')

    const raw = await fsPromises.readFile(resolveFsPath(tempDir, record.filePath), 'utf8')
    expect(raw).toContain('semanticKind: project')
    expect(raw).toContain('## 项目信息')
  })
})

async function writeMemoryFile(
  tempDir: string,
  filePath: string,
  options: {
    title: string
    summary: string
    updatedAt: string
    audience?: 'user' | 'shared'
    ownerUserId?: string
  }
) {
  const file = [
    '---',
    'id: memory-1',
    'scopeType: xpert',
    'scopeId: xpert-1',
    `audience: ${options.audience ?? 'shared'}`,
    options.ownerUserId ? `ownerUserId: ${options.ownerUserId}` : '',
    'kind: profile',
    'status: active',
    `title: ${options.title}`,
    `summary: ${options.summary}`,
    'createdAt: 2026-04-01T00:00:00.000Z',
    `updatedAt: ${options.updatedAt}`,
    'createdBy: u1',
    'updatedBy: u1',
    'source: manual',
    'tags:',
    '  - deploy',
    '---',
    '',
    `# ${options.title}`,
    '',
    '## Profile',
    'Always mention the deployment checklist.'
  ]
    .filter(Boolean)
    .join('\n')

  const fsPath = resolveFsPath(tempDir, filePath)
  await fsPromises.mkdir(path.dirname(fsPath), { recursive: true })
  await fsPromises.writeFile(fsPath, file, 'utf8')
}

function resolveFsPath(tempDir: string, filePath: string) {
  return path.join(tempDir, ...filePath.split('/'))
}
