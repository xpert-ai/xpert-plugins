import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const mockLongTermMemoryTypeEnum = {
  PROFILE: 'profile',
  QA: 'qa'
}

jest.mock('@metad/contracts', () => ({
  __esModule: true,
  LongTermMemoryTypeEnum: {
    PROFILE: 'profile',
    QA: 'qa'
  }
}))

import { XpertFileMemoryService } from './file-memory.service.js'

describe('XpertFileMemoryService freshness alignment', () => {
  let tempDir: string
  let service: XpertFileMemoryService
  let fileRepository: {
    listFiles: jest.Mock
    readFile: jest.Mock
    writeFile: jest.Mock
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
  const userLayer = {
    scope: {
      scopeType: 'xpert' as const,
      scopeId: 'xpert-1'
    },
    audience: 'user' as const,
    ownerUserId: 'u1',
    layerLabel: 'My Memory'
  }

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'file-memory-service-'))
    await Promise.all([
      fsPromises.mkdir(path.join(tempDir, mockLongTermMemoryTypeEnum.PROFILE), { recursive: true }),
      fsPromises.mkdir(path.join(tempDir, mockLongTermMemoryTypeEnum.QA), { recursive: true })
    ])

    const layerResolver = {
      resolveScope: jest.fn(),
      resolveVisibleLayers: jest.fn((_scope, _userId, audience = 'all') => {
        if (audience === 'user') {
          return [userLayer]
        }
        if (audience === 'shared') {
          return [layer]
        }
        return [userLayer, layer]
      }),
      resolveScopeDirectory: jest.fn().mockReturnValue(tempDir),
      resolveLayerDirectory: jest.fn((_tenantId, currentLayer) =>
        currentLayer.audience === 'user' ? path.join(tempDir, 'users', currentLayer.ownerUserId) : tempDir
      )
    }
    fileRepository = {
      listFiles: jest.fn().mockResolvedValue([]),
      readFile: jest.fn((filePath: string) => fsPromises.readFile(filePath, 'utf8')),
      writeFile: jest.fn(async (filePath: string, content: string) => {
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
        await fsPromises.writeFile(filePath, content, 'utf8')
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
      layerResolver as any,
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
    const filePath = path.join(tempDir, mockLongTermMemoryTypeEnum.PROFILE, 'old-memory.md')
    const oldTime = new Date(Date.now() - 5 * 86_400_000)

    await writeMemoryFile(filePath, {
      title: 'Deployment checklist',
      summary: 'Critical deployment notes',
      updatedAt: new Date().toISOString()
    })
    await fsPromises.utimes(filePath, oldTime, oldTime)
    fileRepository.listFiles.mockImplementation(async (_tenantId: string, currentLayer: { audience: string }) =>
      currentLayer.audience === 'shared' ? [filePath] : []
    )

    const recall = await service.buildRuntimeRecall('tenant-1', layer.scope, {
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
    const filePath = path.join(tempDir, mockLongTermMemoryTypeEnum.PROFILE, 'digest-memory.md')

    await writeMemoryFile(filePath, {
      title: '饮食偏好',
      summary: '张三爱吃麦当劳',
      updatedAt: new Date().toISOString()
    })
    fileRepository.listFiles.mockImplementation(async (_tenantId: string, currentLayer: { audience: string }) =>
      currentLayer.audience === 'shared' ? [filePath] : []
    )

    const digest = await service.buildRuntimeSummaryDigest('tenant-1', layer.scope, {
      query: '张三爱吃什么',
      userId: 'u1'
    })

    expect(recallPlanner.selectSummaryDigestHeaders).toHaveBeenCalledTimes(1)
    expect(recallPlanner.selectAsyncRecallHeaders).not.toHaveBeenCalled()
    expect(digest).toHaveLength(1)
    expect(digest[0].summary).toBe('张三爱吃麦当劳')
  })

  it('uses file mtime rather than updatedAt when deciding whether to show a staleness note', async () => {
    const filePath = path.join(tempDir, mockLongTermMemoryTypeEnum.PROFILE, 'fresh-memory.md')

    await writeMemoryFile(filePath, {
      title: 'Fresh preference',
      summary: 'Recently touched file',
      updatedAt: '2020-01-01T00:00:00.000Z'
    })
    fileRepository.listFiles.mockImplementation(async (_tenantId: string, currentLayer: { audience: string }) =>
      currentLayer.audience === 'shared' ? [filePath] : []
    )

    const recall = await service.buildRuntimeRecall('tenant-1', layer.scope, {
      query: 'preference',
      userId: 'u1'
    })

    expect(recall.selected).toHaveLength(1)
    expect(recall.details).toHaveLength(1)
    expect(recall.details[0].freshnessNote).toBeNull()
    expect(recall.details[0].content).toContain('saved: today')
    expect(recall.details[0].content).not.toContain('This memory is')
  })

  it('writes new semantic memories into semantic directories', async () => {
    fileRepository.listFiles.mockImplementation(async () => [])

    const record = await service.upsert('tenant-1', {
      scope: layer.scope,
      audience: 'shared',
      kind: mockLongTermMemoryTypeEnum.QA as any,
      semanticKind: 'project' as any,
      title: 'Launch plan',
      content: 'Ship the launch checklist and keep the owner updated.',
      createdBy: 'u1'
    })

    expect(record.semanticKind).toBe('project')
    expect(record.relativePath.startsWith('project/')).toBe(true)
    expect(record.filePath.includes(`${path.sep}project${path.sep}`)).toBe(true)

    const raw = await fsPromises.readFile(record.filePath, 'utf8')
    expect(raw).toContain('semanticKind: project')
    expect(raw).toContain('## 项目信息')
  })

  it('lists workbench roots and shared layer directories for memory files', async () => {
    const filePath = path.join(tempDir, 'project', 'launch-plan-memory-1.md')

    await writeMemoryFile(filePath, {
      title: 'Launch plan',
      summary: 'Keep the launch owner updated.',
      updatedAt: new Date().toISOString()
    })
    fileRepository.listFiles.mockImplementation(async (_tenantId: string, currentLayer: { audience: string }) =>
      currentLayer.audience === 'shared' ? [filePath] : []
    )

    const roots = await service.listWorkbenchFiles('tenant-1', layer.scope, 'u1')
    const sharedItems = await service.listWorkbenchFiles('tenant-1', layer.scope, 'u1', 'shared')
    const projectItems = await service.listWorkbenchFiles('tenant-1', layer.scope, 'u1', 'shared/project')

    expect(roots.map((item) => item.fullPath)).toEqual(['my', 'shared'])
    expect(sharedItems.map((item) => item.fullPath)).toEqual(['shared/MEMORY.md', 'shared/project'])
    expect(projectItems.map((item) => item.fullPath)).toEqual(['shared/project/launch-plan-memory-1.md'])
  })

  it('reads and saves workbench memory files while blocking direct MEMORY.md edits', async () => {
    const filePath = path.join(tempDir, 'project', 'launch-plan-memory-1.md')

    await writeMemoryFile(filePath, {
      title: 'Launch plan',
      summary: 'Keep the launch owner updated.',
      updatedAt: new Date().toISOString()
    })
    fileRepository.listFiles.mockImplementation(async (_tenantId: string, currentLayer: { audience: string }) =>
      currentLayer.audience === 'shared' ? [filePath] : []
    )

    const file = await service.readWorkbenchFile('tenant-1', layer.scope, 'u1', 'shared/project/launch-plan-memory-1.md')
    expect(file.contents).toContain('Launch plan')

    await expect(
      service.saveWorkbenchFile('tenant-1', layer.scope, 'u1', 'shared/MEMORY.md', '# hacked', 'u2')
    ).rejects.toThrow('MEMORY.md')

    const updated = await service.saveWorkbenchFile(
      'tenant-1',
      layer.scope,
      'u1',
      'shared/project/launch-plan-memory-1.md',
      [
        '---',
        'tags:',
        '  - release',
        '---',
        '',
        '# Launch checklist',
        '',
        '## 项目信息',
        'Ship the launch checklist and notify the owner.'
      ].join('\n'),
      'u2'
    )

    expect(updated.contents).toContain('Launch checklist')
    expect(updated.contents).toContain('updatedBy: u2')
    expect(updated.contents).toContain('  - release')
  })
})

async function writeMemoryFile(
  filePath: string,
  options: {
    title: string
    summary: string
    updatedAt: string
  }
) {
  const file = [
    '---',
    'id: memory-1',
    'scopeType: xpert',
    'scopeId: xpert-1',
    'audience: shared',
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
  ].join('\n')

  await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
  await fsPromises.writeFile(filePath, file, 'utf8')
}
