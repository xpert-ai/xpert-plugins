import { Logger } from '@nestjs/common'

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

import { FileMemoryRecallPlanner } from './recall-planner.js'
import { createInternalRunnableConfig } from './internal-runnable-config.js'
import { MemoryRecordHeader } from './types.js'

describe('FileMemoryRecallPlanner', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('filters already surfaced memories before local summary scoring', async () => {
    const planner = new FileMemoryRecallPlanner()
    const headers: MemoryRecordHeader[] = [
      {
        id: '1',
        scopeType: 'xpert',
        scopeId: 'xpert-1',
        audience: 'user',
        kind: mockLongTermMemoryTypeEnum.PROFILE,
        status: 'active',
        title: 'User prefers concise answers',
        summary: 'Be brief when replying.',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
        mtimeMs: Date.parse('2026-04-02T00:00:00.000Z'),
        createdBy: 'u1',
        updatedBy: 'u1',
        source: 'manual',
        tags: ['style'],
        layerLabel: 'My Memory',
        filePath: '/tmp/profile/one.md'
      },
      {
        id: '2',
        scopeType: 'xpert',
        scopeId: 'xpert-1',
        audience: 'shared',
        kind: mockLongTermMemoryTypeEnum.QA,
        status: 'active',
        title: 'Deployment rollback procedure',
        summary: 'Use the rollback runbook when production breaks.',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
        mtimeMs: Date.parse('2026-04-03T00:00:00.000Z'),
        createdBy: 'u1',
        updatedBy: 'u1',
        source: 'manual',
        tags: ['deploy'],
        layerLabel: 'Shared Memory',
        filePath: '/tmp/qa/two.md'
      }
    ]

    const selected = await planner.selectSummaryDigestHeaders('concise answer', headers, {
      alreadySurfaced: new Set(['/tmp/profile/one.md'])
    })

    expect(selected.strategy).toBe('fallback')
    expect(selected.headers.map((item) => item.id)).toEqual([])
  })

  it('returns async model selection within the wait budget without passing an abort signal', async () => {
    const planner = new FileMemoryRecallPlanner()
    const invoke = jest.fn().mockResolvedValue({
      selectedIds: ['2']
    })
    const model = createModelMock(invoke)

    const selected = await planner.selectAsyncRecallHeaders('rollback procedure', buildHeaders(3), model as any, {
      timeoutMs: 5_000
    })

    expect(selected.strategy).toBe('model')
    expect(selected.headers.map((item) => item.id)).toEqual(['2'])
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(model.withConfig).toHaveBeenCalledWith(createInternalRunnableConfig('file-memory-recall-selector'))
    expect(invoke.mock.calls[0]).toHaveLength(1)
    expect(invoke.mock.calls[0][1]).toBeUndefined()
    const modelMessages = invoke.mock.calls[0][0]
    expect(modelMessages[0].content).toContain('The main model already sees lightweight memory summaries elsewhere')
    expect(modelMessages[0].content).toContain('Only include memories that you are confident will be helpful beyond the lightweight summary')
  })

  it('keeps the full scanned manifest available to async selector result mapping', async () => {
    const planner = new FileMemoryRecallPlanner()
    const invoke = jest.fn().mockResolvedValue({
      selectedIds: ['120']
    })
    const model = createModelMock(invoke)

    const selected = await planner.selectAsyncRecallHeaders('deployment', buildHeaders(120), model as any, {
      timeoutMs: 5_000
    })

    expect(selected.strategy).toBe('model')
    expect(selected.headers.map((item) => item.id)).toEqual(['120'])
  })

  it('penalizes usage-reference memories when the same tool is already active in the loop', async () => {
    const planner = new FileMemoryRecallPlanner()
    const headers: MemoryRecordHeader[] = [
      {
        id: 'reference-1',
        scopeType: 'xpert',
        scopeId: 'xpert-1',
        audience: 'shared',
        kind: mockLongTermMemoryTypeEnum.QA,
        semanticKind: 'reference',
        status: 'active',
        title: 'search_recall_memories usage reference',
        summary: 'How to invoke the tool quickly',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
        mtimeMs: Date.parse('2026-04-02T00:00:00.000Z'),
        createdBy: 'u1',
        updatedBy: 'u1',
        source: 'manual',
        tags: ['tooling'],
        layerLabel: 'Shared Memory',
        filePath: '/tmp/reference/reference-1.md'
      },
      {
        id: 'reference-2',
        scopeType: 'xpert',
        scopeId: 'xpert-1',
        audience: 'shared',
        kind: mockLongTermMemoryTypeEnum.QA,
        semanticKind: 'reference',
        status: 'active',
        title: 'Deployment rollback procedure',
        summary: 'Use the deployment rollback runbook when production breaks.',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
        mtimeMs: Date.parse('2026-04-03T00:00:00.000Z'),
        createdBy: 'u1',
        updatedBy: 'u1',
        source: 'manual',
        tags: ['deploy'],
        layerLabel: 'Shared Memory',
        filePath: '/tmp/reference/reference-2.md'
      }
    ]

    const selected = await planner.selectSummaryDigestHeaders('deployment rollback search recall memories', headers, {
      recentTools: ['search_recall_memories']
    })

    expect(selected.strategy).toBe('fallback')
    expect(selected.headers.map((item) => item.id)[0]).toBe('reference-2')
  })

  it('falls back quietly when the selector exceeds the wait budget', async () => {
    jest.useFakeTimers()

    const planner = new FileMemoryRecallPlanner()
    let lateResolve: ((value: { selectedIds: string[] }) => void) | undefined
    const invoke = jest.fn().mockImplementation(
      () =>
        new Promise<{ selectedIds: string[] }>((resolve) => {
          lateResolve = resolve
        })
    )
    const model = createModelMock(invoke)

    const selectionPromise = planner.selectAsyncRecallHeaders('deployment rollback', buildHeaders(3), model as any, {
      timeoutMs: 10
    })

    await jest.advanceTimersByTimeAsync(10)
    const selected = await selectionPromise

    expect(selected.strategy).toBe('fallback')
    expect(selected.headers.map((item) => item.id)[0]).toBe('2')
    expect(selected.headers.map((item) => item.id)).toContain('2')
    expect(invoke.mock.calls[0]).toHaveLength(1)

    lateResolve?.({ selectedIds: ['1'] })
    await Promise.resolve()
  })

  it('skips model selection when detached selectors are already saturated', async () => {
    jest.useFakeTimers()

    const planner = new FileMemoryRecallPlanner()
    const debugSpy = jest.spyOn((planner as any).logger, 'debug').mockImplementation(() => undefined)
    jest.spyOn(Logger, 'isLevelEnabled').mockReturnValue(true)

    const pendingResolves: Array<(value: { selectedIds: string[] }) => void> = []
    const pendingPromises: Array<Promise<{ selectedIds: string[] }>> = []
    const invoke = jest.fn().mockImplementation(
      () => {
        const promise = new Promise<{ selectedIds: string[] }>((resolve) => {
          pendingResolves.push(resolve)
        })
        pendingPromises.push(promise)
        return promise
      }
    )
    const model = createModelMock(invoke)

    const first = planner.selectAsyncRecallHeaders('deployment', buildHeaders(3), model as any, {
      timeoutMs: 10,
      enableLogging: true
    })
    const second = planner.selectAsyncRecallHeaders('deployment', buildHeaders(3), model as any, {
      timeoutMs: 10,
      enableLogging: true
    })

    await jest.advanceTimersByTimeAsync(10)
    await Promise.all([first, second])

    const third = await planner.selectAsyncRecallHeaders('deployment', buildHeaders(3), model as any, {
      timeoutMs: 10,
      enableLogging: true
    })

    expect(third.strategy).toBe('fallback')
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('selector_backpressure_skip'))

    pendingResolves.splice(0).forEach((resolve) => resolve({ selectedIds: ['1'] }))
    await Promise.all(pendingPromises)
    await flushMicrotasks()

    expect((planner as any).detachedSelectorTokens.size).toBe(0)
  })
})

function buildHeaders(count: number): MemoryRecordHeader[] {
  return Array.from({ length: count }, (_, index) => {
    const id = String(index + 1)
    const isUser = index % 2 === 0
    return {
      id,
      scopeType: 'xpert',
      scopeId: 'xpert-1',
      audience: isUser ? 'user' : 'shared',
      ownerUserId: isUser ? 'u1' : undefined,
      kind: index === 1 ? mockLongTermMemoryTypeEnum.QA : mockLongTermMemoryTypeEnum.PROFILE,
      status: 'active',
      title: index === 1 ? 'Deployment rollback procedure' : `Preference ${id}`,
      summary: index === 1 ? 'Use the rollback runbook when production breaks.' : `Summary ${id}`,
      createdAt: toIsoDay(index),
      updatedAt: toIsoDay(count - index),
      mtimeMs: Date.parse(toIsoDay(count - index)),
      createdBy: 'u1',
      updatedBy: 'u1',
      source: 'manual',
      tags: index === 1 ? ['deploy', 'rollback'] : ['style'],
      layerLabel: isUser ? 'My Memory' : 'Shared Memory',
      filePath: `/tmp/${isUser ? 'profile' : 'qa'}/${id}.md`
    }
  })
}

function createModelMock(invoke: jest.Mock) {
  const withConfig = jest.fn().mockReturnValue({
    invoke
  })

  return {
    withConfig,
    withStructuredOutput: jest.fn().mockReturnValue({
      withConfig
    })
  }
}

async function flushMicrotasks(rounds = 3) {
  for (let index = 0; index < rounds; index++) {
    await Promise.resolve()
  }
}

function toIsoDay(offset: number) {
  return new Date(Date.UTC(2026, 3, 1 + offset)).toISOString()
}
