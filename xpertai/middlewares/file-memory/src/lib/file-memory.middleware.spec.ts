import { HumanMessage } from '@langchain/core/messages'

jest.mock('@xpert-ai/contracts', () => ({
  __esModule: true,
  AiModelTypeEnum: {
    LLM: 'llm'
  },
  ChatMessageEventTypeEnum: {
    ON_CHAT_EVENT: 'ON_CHAT_EVENT'
  },
  LongTermMemoryTypeEnum: {
    PROFILE: 'profile',
    QA: 'qa'
  }
}))

jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  AgentMiddlewareStrategy: () => (target: unknown) => target,
  CreateModelClientCommand: class CreateModelClientCommand {
    constructor(public readonly model: unknown, public readonly options: unknown) {}
  },
  resolveSandboxBackend: jest.fn((sandbox?: { backend?: unknown } | null) => sandbox?.backend ?? null)
}))

import { FileMemorySystemMiddleware } from './file-memory.middleware.js'

describe('FileMemorySystemMiddleware hybrid recall flow', () => {
  const scope = {
    scopeType: 'xpert' as const,
    scopeId: 'xpert-1'
  }

  function createServiceMock() {
    return {
      resolveScope: jest.fn().mockReturnValue(scope),
      readRuntimeEntrypoints: jest.fn().mockResolvedValue([
        {
          layer: {
            scope,
            audience: 'shared' as const,
            layerLabel: 'Shared Memory'
          },
          content: '<memory_index layer="Shared Memory">index</memory_index>',
          budget: {
            maxLines: 200,
            maxBytes: 25_000,
            truncated: false,
            lineCount: 1,
            byteLength: 42
          }
        }
      ]),
      buildRuntimeSummaryDigest: jest.fn().mockResolvedValue([
        {
          id: 'memory-1',
          canonicalRef: 'memory-1',
          title: 'Favorite food',
          summary: '张三爱吃麦当劳',
          kind: 'profile',
          semanticKind: 'user',
          audience: 'user',
          layerLabel: 'My Memory',
          relativePath: 'private/user/favorite-food-memory-1.md',
          updatedAt: '2026-04-08T06:08:36.643Z',
          mtimeMs: Date.parse('2026-04-08T06:08:36.643Z')
        }
      ]),
      buildRuntimeRecall: jest.fn(),
      findVisibleRecordById: jest.fn(),
      findVisibleRecordByRelativePath: jest.fn(),
      selectRecallHeadersForQuery: jest.fn(),
      upsert: jest.fn()
    }
  }

  it('does not block the first model call while async recall is still pending', async () => {
    const service = createServiceMock()
    const deferred = createDeferred<any>()
    service.buildRuntimeRecall.mockReturnValue(deferred.promise)

    const strategy = new FileMemorySystemMiddleware(service as any, { execute: jest.fn() } as any, {
      enqueue: jest.fn(),
      softDrain: jest.fn()
    } as any)

    const middleware = await strategy.createMiddleware(
      {
        recall: {
          enabled: true,
          mode: 'hybrid_async'
        }
      },
      createContext()
    )
    const runtime = createRuntime()

    await middleware.beforeAgent?.({
      input: 'deployment rollback'
    } as any, runtime as any)

    const handler = jest.fn().mockResolvedValue('ok')
    const wrapPromise = middleware.wrapModelCall!(
      {
        messages: [new HumanMessage('deployment rollback')],
        runtime
      } as any,
      handler
    )

    await flushMicrotasks()

    expect(handler).toHaveBeenCalledTimes(1)
    const request = handler.mock.calls[0][0]
    expect(String(request.systemMessage.content)).toContain('如果 digest 中某条 summary 已经足够回答用户问题，直接回答')
    expect(String(request.systemMessage.content)).toContain('绝不要猜测、拼接、改写 memoryId')
    expect(request.messages.some((message: HumanMessage) => String(message.content).includes('memory-summary-digest'))).toBe(true)
    expect(request.messages.some((message: HumanMessage) => String(message.content).includes('张三爱吃麦当劳'))).toBe(true)
    expect(request.messages.some((message: HumanMessage) => String(message.content).includes('不要为了确认一个简短事实或偏好去调用 search_recall_memories'))).toBe(true)
    expect(request.messages.some((message: HumanMessage) => String(message.content).includes('只能原样复用 canonicalRef 或 relativePath'))).toBe(true)
    expect(request.messages.some((message: HumanMessage) => String(message.content).includes('memory-index-context'))).toBe(true)

    deferred.resolve(createRecallResult('Rollback detail'))
    await wrapPromise
  })

  it('injects ready detail on the next model call and only consumes the generation once', async () => {
    const service = createServiceMock()
    const deferred = createDeferred<any>()
    service.buildRuntimeRecall.mockReturnValue(deferred.promise)

    const strategy = new FileMemorySystemMiddleware(service as any, { execute: jest.fn() } as any, {
      enqueue: jest.fn(),
      softDrain: jest.fn()
    } as any)

    const middleware = await strategy.createMiddleware(
      {
        recall: {
          enabled: true,
          mode: 'hybrid_async'
        }
      },
      createContext()
    )
    const runtime = createRuntime()

    await middleware.beforeAgent?.({
      input: 'deployment rollback'
    } as any, runtime as any)

    const firstHandler = jest.fn().mockResolvedValue('first')
    await middleware.wrapModelCall!(
      {
        messages: [new HumanMessage('deployment rollback')],
        runtime
      } as any,
      firstHandler
    )

    deferred.resolve(createRecallResult('Rollback detail'))
    await flushMicrotasks()

    const secondHandler = jest.fn().mockResolvedValue('second')
    await middleware.wrapModelCall!(
      {
        messages: [new HumanMessage('deployment rollback again')],
        runtime
      } as any,
      secondHandler
    )

    const secondMessages = secondHandler.mock.calls[0][0].messages.map((message: HumanMessage) => String(message.content))
    expect(secondMessages.some((content: string) => content.includes('Rollback detail'))).toBe(true)

    const thirdHandler = jest.fn().mockResolvedValue('third')
    await middleware.wrapModelCall!(
      {
        messages: [new HumanMessage('deployment rollback third')],
        runtime
      } as any,
      thirdHandler
    )

    const thirdMessages = thirdHandler.mock.calls[0][0].messages.map((message: HumanMessage) => String(message.content))
    expect(thirdMessages.some((content: string) => content.includes('Rollback detail'))).toBe(false)
  })

  it('keeps legacy blocking mode synchronous with recall completion', async () => {
    const service = createServiceMock()
    const deferred = createDeferred<any>()
    service.buildRuntimeRecall.mockReturnValue(deferred.promise)

    const strategy = new FileMemorySystemMiddleware(service as any, { execute: jest.fn() } as any, {
      enqueue: jest.fn(),
      softDrain: jest.fn()
    } as any)

    const middleware = await strategy.createMiddleware(
      {
        recall: {
          enabled: true,
          mode: 'legacy_blocking'
        }
      },
      createContext()
    )
    const runtime = createRuntime()

    await middleware.beforeAgent?.({
      input: 'deployment rollback'
    } as any, runtime as any)

    const handler = jest.fn().mockResolvedValue('ok')
    const wrapPromise = middleware.wrapModelCall!(
      {
        messages: [new HumanMessage('deployment rollback')],
        runtime
      } as any,
      handler
    )

    await flushMicrotasks()
    expect(handler).not.toHaveBeenCalled()

    deferred.resolve(createRecallResult('Blocking detail'))
    await wrapPromise

    expect(handler).toHaveBeenCalledTimes(1)
    const messages = handler.mock.calls[0][0].messages.map((message: HumanMessage) => String(message.content))
    expect(messages.some((content: string) => content.includes('Blocking detail'))).toBe(true)
  })

  it('does not wait for writeback softDrain after agent by default', async () => {
    const service = createServiceMock()
    const writebackRunner = {
      enqueue: jest.fn().mockReturnValue('job-1'),
      softDrain: jest.fn().mockResolvedValue(undefined)
    }

    const strategy = new FileMemorySystemMiddleware(service as any, { execute: jest.fn() } as any, writebackRunner as any)
    const middleware = await strategy.createMiddleware(
      {
        writeback: {
          model: { provider: 'test', model: 'writeback' }
        }
      },
      createContext()
    )
    const runtime = createRuntime()

    await middleware.afterAgent?.({
      messages: [new HumanMessage('remember my preference')]
    } as any, runtime as any)

    expect(writebackRunner.enqueue).toHaveBeenCalledTimes(1)
    expect(writebackRunner.softDrain).not.toHaveBeenCalled()
  })

  it('waits for writeback softDrain only when waitPolicy is explicitly enabled', async () => {
    const service = createServiceMock()
    const writebackRunner = {
      enqueue: jest.fn().mockReturnValue('job-1'),
      softDrain: jest.fn().mockResolvedValue(undefined)
    }

    const strategy = new FileMemorySystemMiddleware(service as any, { execute: jest.fn() } as any, writebackRunner as any)
    const middleware = await strategy.createMiddleware(
      {
        writeback: {
          waitPolicy: 'soft_drain',
          model: { provider: 'test', model: 'writeback' }
        }
      },
      createContext()
    )
    const runtime = createRuntime()

    await middleware.afterAgent?.({
      messages: [new HumanMessage('remember my preference')]
    } as any, runtime as any)

    expect(writebackRunner.enqueue).toHaveBeenCalledTimes(1)
    expect(writebackRunner.softDrain).toHaveBeenCalledWith('job-1', 1_500)
  })

  it('describes search_recall_memories as a last-resort exact lookup tool', async () => {
    const service = createServiceMock()
    const strategy = new FileMemorySystemMiddleware(service as any, { execute: jest.fn() } as any, {
      enqueue: jest.fn(),
      softDrain: jest.fn()
    } as any)

    const middleware = await strategy.createMiddleware({}, createContext())
    const recallTool = middleware.tools?.find((item: any) => item.name === 'search_recall_memories') as any

    expect(recallTool.description).toContain('Use query only as a last resort')
    expect(recallTool.description).toContain('Never guess or synthesize memoryId from a title, filename, or title-uuid string')
  })

  it('describes write_memory with Chinese-on-disk language rules', async () => {
    const service = createServiceMock()
    const strategy = new FileMemorySystemMiddleware(service as any, { execute: jest.fn() } as any, {
      enqueue: jest.fn(),
      softDrain: jest.fn()
    } as any)

    const middleware = await strategy.createMiddleware({}, createContext())
    const writeTool = middleware.tools?.find((item: any) => item.name === 'write_memory') as any

    expect(writeTool.description).toContain('Durable memory should be saved in Chinese except unavoidable technical proper nouns')
    expect(writeTool.description).toContain('Do not mix English prose into otherwise Chinese memory text')
  })

  it('formats query and exact lookup results with canonical follow-up guidance', async () => {
    const service = createServiceMock()
    service.selectRecallHeadersForQuery.mockResolvedValue({
      strategy: 'fallback',
      headers: [createHeader('memory-7')]
    })
    service.findVisibleRecordById.mockResolvedValue({
      record: createRecord('memory-7', '张三的饮食偏好', '张三爱吃麦当劳'),
      layer: {
        scope,
        audience: 'user' as const,
        ownerUserId: 'u1',
        layerLabel: 'My Memory'
      }
    })

    const strategy = new FileMemorySystemMiddleware(service as any, { execute: jest.fn() } as any, {
      enqueue: jest.fn(),
      softDrain: jest.fn()
    } as any)
    const middleware = await strategy.createMiddleware({}, createContext())
    const recallTool = middleware.tools?.find((item: any) => item.name === 'search_recall_memories') as any
    const runtime = createRuntime()

    const [queryContent] = await recallTool.func({ query: '张三的饮食偏好' }, undefined, runtime)
    expect(queryContent).toContain('copy canonicalRef into memoryId or copy relativePath verbatim')
    expect(queryContent).toContain('Do not use the title, filename, or filename stem as memoryId')

    const [exactContent] = await recallTool.func({ memoryId: 'memory-7' }, undefined, runtime)
    expect(exactContent).toContain('- canonicalRef: memory-7')
    expect(exactContent).toContain('- use memoryId only with this canonicalRef value; do not substitute title or filename')
  })

  it('fails middleware creation when sandbox feature is disabled', async () => {
    const service = createServiceMock()
    const strategy = new FileMemorySystemMiddleware(service as any, { execute: jest.fn() } as any, {
      enqueue: jest.fn(),
      softDrain: jest.fn()
    } as any)

    await expect(
      strategy.createMiddleware({}, {
        ...createContext(),
        xpertFeatures: {
          sandbox: {
            enabled: false
          }
        }
      } as any)
    ).rejects.toThrow('requires the xpert sandbox feature to be enabled')
  })
})

function createContext() {
  return {
    tenantId: 'tenant-1',
    userId: 'u1',
    xpertId: 'xpert-1',
    workspaceId: null,
    conversationId: 'conversation-1',
    xpertFeatures: {
      sandbox: {
        enabled: true
      }
    }
  }
}

function createRecallResult(detailText: string) {
  return {
    layers: [],
    index: '',
    headers: [],
    selected: [],
    selection: {
      headers: [],
      strategy: 'fallback' as const
    },
    entrypoints: [
      {
        layer: {
          scope: {
            scopeType: 'xpert' as const,
            scopeId: 'xpert-1'
          },
          audience: 'shared' as const,
          layerLabel: 'Shared Memory'
        },
        content: '<memory_index layer="Shared Memory">index</memory_index>',
        budget: {
          maxLines: 200,
          maxBytes: 25_000,
          truncated: false,
          lineCount: 1,
          byteLength: 42
        }
      }
    ],
    details: [
      {
        record: {
          id: 'memory-1',
          scopeType: 'xpert',
          scopeId: 'xpert-1',
          audience: 'shared',
          kind: 'qa',
          semanticKind: 'reference',
          status: 'active',
          title: 'Rollback playbook',
          summary: 'Use rollback',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
          createdBy: 'u1',
          updatedBy: 'u1',
          source: 'manual',
          tags: ['deploy'],
          layerLabel: 'Shared Memory',
          filePath: 'xperts/xpert-1/shared/reference/rollback.md',
          relativePath: 'shared/reference/rollback.md',
          mtimeMs: Date.parse('2026-04-02T00:00:00.000Z'),
          body: detailText,
          content: detailText,
          value: {
            memoryId: 'memory-1',
            question: 'Rollback playbook',
            answer: detailText
          }
        },
        content: `<memory_detail id="memory-1">${detailText}</memory_detail>`,
        freshnessNote: null,
        byteLength: detailText.length
      }
    ],
    surfaceState: {
      alreadySurfaced: ['xperts/xpert-1/shared/reference/rollback.md'],
      totalBytes: detailText.length
    },
    budget: {
      maxSelectedTotal: 5,
      maxFilesPerLayer: 200,
      maxHeaderLines: 30,
      maxMemoryLinesPerFile: 200,
      maxMemoryBytesPerFile: 4096,
      maxRecallBytesPerTurn: 20 * 1024,
      maxRecallBytesPerSession: 60 * 1024
    }
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks(rounds = 4) {
  for (let index = 0; index < rounds; index++) {
    await Promise.resolve()
  }
}

function createHeader(id: string) {
  return {
    id,
    kind: 'profile',
    semanticKind: 'user',
    audience: 'user',
    layerLabel: 'My Memory',
    title: '张三的饮食偏好',
    summary: '张三爱吃麦当劳',
    updatedAt: '2026-04-08T06:08:36.643Z',
    mtimeMs: Date.parse('2026-04-08T06:08:36.643Z'),
    filePath: 'xperts/xpert-1/private/user/zhou-keming-food-memory-7.md',
    status: 'active',
    ownerUserId: 'u1',
    tags: ['饮食偏好', '麦当劳', '张三']
  }
}

function createRecord(id: string, title: string, body: string) {
  return {
    id,
    title,
    kind: 'profile',
    semanticKind: 'user',
    audience: 'user',
    layerLabel: 'My Memory',
    status: 'active',
    relativePath: `private/user/${title}-${id}.md`,
    body,
    scopeType: 'xpert',
    scopeId: 'xpert-1',
    ownerUserId: 'u1',
    summary: body,
    createdAt: '2026-04-08T06:08:36.643Z',
    updatedAt: '2026-04-08T06:08:36.643Z',
    mtimeMs: Date.parse('2026-04-08T06:08:36.643Z'),
    createdBy: 'u1',
    updatedBy: 'u1',
    source: 'manual',
    sourceRef: undefined,
    tags: ['饮食偏好', '麦当劳', '张三'],
    content: body,
    context: undefined,
    value: {
      memoryId: id,
      profile: body
    }
  }
}

function createRuntime() {
  return {
    configurable: {
      sandbox: {
        backend: createSandboxBackend()
      }
    }
  }
}

function createSandboxBackend() {
  return {
    id: 'test-sandbox',
    workingDirectory: '/tmp/workspace',
    downloadFiles: jest.fn().mockResolvedValue([]),
    uploadFiles: jest.fn().mockResolvedValue([]),
    globInfo: jest.fn().mockResolvedValue([]),
    lsInfo: jest.fn().mockResolvedValue([])
  }
}
