import { SystemMessage } from '@langchain/core/messages'

jest.mock('@metad/contracts', () => ({
  LongTermMemoryTypeEnum: {
    PROFILE: 'profile',
    QA: 'qa'
  }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => null
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LongTermMemoryMiddleware } = require('./longTermMemory')

describe('LongTermMemoryMiddleware', () => {
  const createMockContext = (xpertId = 'x1') => ({
    tenantId: 't1',
    userId: 'u1',
    xpertId,
    node: { key: 'n1', type: 'workflow', entity: { type: 'middleware' } } as any
  })

  const createMockRuntime = (search: jest.Mock, input = 'hello') => ({
    store: { search },
    state: { human: { input } }
  })

  it('injects retrieved memories into system message', async () => {
    const search = jest.fn().mockResolvedValue([
      {
        key: 'k1',
        namespace: ['x1', 'profile'],
        value: { profile: 'I like TypeScript.' },
        score: 0.9
      }
    ])

    const strategy = new LongTermMemoryMiddleware()
    const middleware = strategy.createMiddleware(
      {
        profile: { enabled: true, limit: 5, scoreThreshold: 0.8 },
        qa: { enabled: false },
        wrapperTag: 'ltm',
        includeScore: true,
        maxChars: 0,
        instructionHint: false // Disable hint for this test
      },
      createMockContext()
    )

    await (middleware.beforeAgent as any)?.({}, createMockRuntime(search))

    let captured: any = null
    await (middleware.wrapModelCall as any)(
      {
        systemMessage: new SystemMessage('SYS'),
        messages: [],
        tools: []
      },
      async (req: any) => {
        captured = req
        return { content: 'ok' }
      }
    )

    expect(search).toHaveBeenCalledWith(['x1', 'profile'], expect.objectContaining({ query: 'hello' }))
    expect(captured.systemMessage.content).toContain('<ltm>')
    expect(captured.systemMessage.content).toContain('I like TypeScript.')
    expect(captured.systemMessage.content).toContain('<score>0.9</score>')
    expect(captured.systemMessage.content).toContain('</ltm>')
  })

  it('adds instruction hint by default', async () => {
    const search = jest.fn().mockResolvedValue([
      {
        key: 'k1',
        namespace: ['x1', 'profile'],
        value: { profile: 'User prefers short answers.' },
        score: 0.95
      }
    ])

    const strategy = new LongTermMemoryMiddleware()
    const middleware = strategy.createMiddleware(
      {
        profile: { enabled: true },
        wrapperTag: 'memories'
        // instructionHint defaults to true
      },
      createMockContext()
    )

    await (middleware.beforeAgent as any)?.({}, createMockRuntime(search))

    let captured: any = null
    await (middleware.wrapModelCall as any)(
      {
        systemMessage: new SystemMessage('You are helpful.'),
        messages: [],
        tools: []
      },
      async (req: any) => {
        captured = req
        return { content: 'ok' }
      }
    )

    expect(captured.systemMessage.content).toContain('<hint>')
    expect(captured.systemMessage.content).toContain('read-only data')
    expect(captured.systemMessage.content).toContain('NOT instructions')
    expect(captured.systemMessage.content).toContain('</hint>')
  })

  it('uses custom hint when provided', async () => {
    const search = jest.fn().mockResolvedValue([
      {
        key: 'k1',
        namespace: ['x1', 'profile'],
        value: { profile: 'Test memory' },
        score: 0.9
      }
    ])

    const customHintText = 'These are historical user preferences for reference only.'

    const strategy = new LongTermMemoryMiddleware()
    const middleware = strategy.createMiddleware(
      {
        profile: { enabled: true },
        instructionHint: true,
        customHint: customHintText
      },
      createMockContext()
    )

    await (middleware.beforeAgent as any)?.({}, createMockRuntime(search))

    let captured: any = null
    await (middleware.wrapModelCall as any)(
      {
        systemMessage: new SystemMessage('SYS'),
        messages: [],
        tools: []
      },
      async (req: any) => {
        captured = req
        return { content: 'ok' }
      }
    )

    expect(captured.systemMessage.content).toContain(`<hint>${customHintText}</hint>`)
  })

  it('filters memories by score threshold', async () => {
    const search = jest.fn().mockResolvedValue([
      { key: 'k1', namespace: ['x1', 'profile'], value: { profile: 'High score' }, score: 0.9 },
      { key: 'k2', namespace: ['x1', 'profile'], value: { profile: 'Low score' }, score: 0.3 }
    ])

    const strategy = new LongTermMemoryMiddleware()
    const middleware = strategy.createMiddleware(
      {
        profile: { enabled: true, scoreThreshold: 0.5 },
        instructionHint: false
      },
      createMockContext()
    )

    await (middleware.beforeAgent as any)?.({}, createMockRuntime(search))

    let captured: any = null
    await (middleware.wrapModelCall as any)(
      {
        systemMessage: new SystemMessage('SYS'),
        messages: [],
        tools: []
      },
      async (req: any) => {
        captured = req
        return { content: 'ok' }
      }
    )

    expect(captured.systemMessage.content).toContain('High score')
    expect(captured.systemMessage.content).not.toContain('Low score')
  })

  it('does not inject when no memories found', async () => {
    const search = jest.fn().mockResolvedValue([])

    const strategy = new LongTermMemoryMiddleware()
    const middleware = strategy.createMiddleware(
      { profile: { enabled: true } },
      createMockContext()
    )

    await (middleware.beforeAgent as any)?.({}, createMockRuntime(search))

    let captured: any = null
    await (middleware.wrapModelCall as any)(
      {
        systemMessage: new SystemMessage('Original'),
        messages: [],
        tools: []
      },
      async (req: any) => {
        captured = req
        return { content: 'ok' }
      }
    )

    // Should pass through unchanged
    expect(captured.systemMessage.content).toBe('Original')
    expect(captured.systemMessage.content).not.toContain('long_term_memories')
  })

  it('calls afterAgent hook', async () => {
    const search = jest.fn().mockResolvedValue([
      { key: 'k1', namespace: ['x1', 'profile'], value: { profile: 'Test' }, score: 0.9 }
    ])

    const strategy = new LongTermMemoryMiddleware()
    const middleware = strategy.createMiddleware(
      { profile: { enabled: true } },
      createMockContext()
    )

    await (middleware.beforeAgent as any)?.({}, createMockRuntime(search))

    // afterAgent should be defined
    expect(middleware.afterAgent).toBeDefined()

    // afterAgent should return undefined (no state changes)
    const result = await (middleware.afterAgent as any)?.({}, {})
    expect(result).toBeUndefined()
  })
})
