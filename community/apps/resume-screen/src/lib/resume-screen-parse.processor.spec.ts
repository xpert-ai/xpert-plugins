/**
 * 链路 B 解析队列 worker 单元测试（spec v2.2 §7.7）
 *
 * 全部外部件按 R10 mock：service（内存 stub）、ManagedQueueService（经 intakeQueue stub）、
 * 模型 runtime token provider 链（createScopedApi→getModelProvider→createModelClient→invoke）。
 * 覆盖幂等认领、结构化优先/文本 JSON 容错降级、末次尝试落败+rethrow、provider 未配置、
 * prompt 纯函数与 sweep 抢占/重入。
 */
// mock SDK：plugin-sdk 全量引入依赖 lodash-es 等 ESM 产物，jest(CommonJS) 无法解析；
// 被测代码只消费装饰器与注入 token，此处提供行为等价实现（对齐 provider spec 的 mock 方式）
jest.mock('@xpert-ai/plugin-sdk', () => ({
  PluginJobProcessor: () => (target: unknown) => target,
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN: 'XPERT_AGENT_MIDDLEWARE_RUNTIME'
}))

import { ResumeScreenParseProcessor } from './resume-screen-parse.processor'
import { buildParsePrompt, extractJsonLoose, normalizeExtracted } from './resume-screen-parse-prompt'

const SCOPE = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', assistantId: 'assistant-1' }

function parsingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    jobId: 'job-1',
    status: 'parsing',
    sourceText: '张三 5年经验 React工程师 本科',
    attemptCount: 0,
    humanEditedFields: [],
    scope: SCOPE,
    jobTitle: '前端工程师',
    jobJdText: '精通 React，3 年以上经验，负责中台前端',
    ...overrides
  } as never
}

const extract = {
  name: '张三',
  yearsOfExperience: '5',
  education: '本科',
  currentCompany: '某司',
  skills: ['React'],
  summary: '前端工程师',
  matchScore: 88,
  matchReason: '技能与年限匹配',
  hitPoints: ['React'],
  riskPoints: ['未写英语能力']
}

function buildService(row: unknown) {
  return {
    getCandidateForParse: jest.fn(async () => row),
    saveCandidatesFromAgent: jest.fn(async () => []),
    markCandidateFailed: jest.fn(async () => undefined),
    findStaleParsingRows: jest.fn(async () => []),
    claimStaleParsing: jest.fn(async () => true)
  }
}

// F1 直调链 stub：structuredInvoke 走 withStructuredOutput().invoke，textInvoke 走 client.invoke
function runtimeStub(structuredInvoke: jest.Mock, textInvoke: jest.Mock = structuredInvoke) {
  return {
    createScopedApi: jest.fn(() => ({
      getModelProvider: async () => ({ copilotId: 'cop-1' }),
      createModelClient: async () => ({ withStructuredOutput: () => ({ invoke: structuredInvoke }), invoke: textInvoke })
    }))
  } as never
}

function parseJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'resume-parse-c-1-0',
    name: 'parse-candidate',
    data: { candidateId: 'c-1' },
    attemptsMade: 0,
    opts: { attempts: 4 },
    updateData: jest.fn(),
    ...overrides
  } as never
}

const queueCtx = { pluginName: 'p', queueName: 'resume-screen.parse', jobName: 'parse-candidate' } as never

describe('ResumeScreenParseProcessor.handle', () => {
  it('silently completes when the row is gone or no longer parsing (idempotent claim)', async () => {
    const serviceGone = buildService(null)
    const intakeQueue = { enqueueParse: jest.fn() }
    const gone = new ResumeScreenParseProcessor(serviceGone as never, intakeQueue as never, runtimeStub(jest.fn()) as never)
    await expect(gone.handle(parseJob(), queueCtx)).resolves.toBeUndefined()
    expect(serviceGone.saveCandidatesFromAgent).not.toHaveBeenCalled()

    const serviceDone = buildService(parsingRow({ status: 'pending_review' }))
    const done = new ResumeScreenParseProcessor(serviceDone as never, intakeQueue as never, runtimeStub(jest.fn()) as never)
    await expect(done.handle(parseJob(), queueCtx)).resolves.toBeUndefined()
    expect(serviceDone.saveCandidatesFromAgent).not.toHaveBeenCalled()
    expect(serviceDone.markCandidateFailed).not.toHaveBeenCalled()
  })

  it('structured path: prompts contain full JD and resume, backfills via saveCandidatesFromAgent', async () => {
    const row = parsingRow()
    const structuredInvoke = jest.fn(async () => ({ ...extract }))
    const service = buildService(row)
    // scoreThreshold 经 pluginContext.config 接线：仅作为提示进 prompt（界面同源，不自动推进）
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(structuredInvoke), { config: { scoreThreshold: 60 } } as never)
    await processor.handle(parseJob(), queueCtx)

    // prompt 必须含 JD 全文与简历原文（spec §7.7：模型只见这两块业务文本）
    const messages = structuredInvoke.mock.calls[0][0]
    const content = messages[0].content as string
    expect(content).toContain('精通 React，3 年以上经验，负责中台前端')
    expect(content).toContain('张三 5年经验 React工程师 本科')
    expect(content).toContain('60')
    expect(structuredInvoke.mock.calls[0][1]).toMatchObject({ signal: expect.anything() })
    // 回填复用 service：scope 取行自携带，candidates 带行原文 + 抽取字段
    expect(service.saveCandidatesFromAgent).toHaveBeenCalledWith(
      SCOPE,
      'job-1',
      [expect.objectContaining({ sourceText: row.sourceText, ...extract })]
    )
    expect(service.markCandidateFailed).not.toHaveBeenCalled()
  })

  it('fallback path: structured failure degrades to text invoke with fenced json', async () => {
    const structuredInvoke = jest.fn(async () => {
      throw new Error('functionCalling unsupported')
    })
    const textInvoke = jest.fn(async () => ({ content: '```json\n{"name":"张三","matchScore":"72","skills":["Vue"]}\n```' }))
    const service = buildService(parsingRow())
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(structuredInvoke, textInvoke))
    await processor.handle(parseJob(), queueCtx)
    // 文本容错抽取成功也要回填（matchScore 字符串归一为数字）
    expect(service.saveCandidatesFromAgent).toHaveBeenCalledWith(
      SCOPE,
      'job-1',
      [expect.objectContaining({ name: '张三', matchScore: 72 })]
    )
  })

  it('terminal attempt: two-path failure marks business failure then rethrows for BullMQ', async () => {
    const failing = jest.fn(async () => {
      throw new Error('model down')
    })
    const service = buildService(parsingRow())
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(failing))
    await expect(processor.handle(parseJob({ attemptsMade: 3 }), queueCtx)).rejects.toThrow('model down')
    // attemptsMade+1>=attempts：末次尝试主动落 failed，防止永卡 parsing（调研 B 风险 4）
    expect(service.markCandidateFailed).toHaveBeenCalledWith(SCOPE, 'c-1', expect.stringContaining('模型解析失败'))
    expect(service.markCandidateFailed.mock.calls[0][2]).toContain('model down')
  })

  it('non-terminal attempt: rethrows without touching business state', async () => {
    const failing = jest.fn(async () => {
      throw new Error('transient')
    })
    const service = buildService(parsingRow())
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(failing))
    await expect(processor.handle(parseJob({ attemptsMade: 0 }), queueCtx)).rejects.toThrow('transient')
    expect(service.markCandidateFailed).not.toHaveBeenCalled()
  })

  it('unconfigured provider surfaces a model-related failure reason on the last attempt', async () => {
    const runtime = {
      createScopedApi: () => ({
        getModelProvider: async () => undefined,
        createModelClient: async () => {
          throw new Error('should not reach client creation')
        }
      })
    } as never
    const service = buildService(parsingRow())
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtime)
    await expect(processor.handle(parseJob({ attemptsMade: 3 }), queueCtx)).rejects.toThrow()
    // provider 未配置属于配置类错误：文案含「模型」，让工作台失败行可指引管理员配置
    expect(service.markCandidateFailed).toHaveBeenCalledWith(SCOPE, 'c-1', expect.stringContaining('模型'))
  })
})

describe('buildParsePrompt / extraction helpers', () => {
  it('prompt protects human-edited fields and treats scoreThreshold as a UI hint only', () => {
    const base = buildParsePrompt(parsingRow())
    expect(base).toContain('只输出 JSON')
    expect(base).not.toContain('人工')

    const edited = buildParsePrompt(parsingRow({ humanEditedFields: ['name', 'matchScore'] }))
    expect(edited).toContain('name')
    expect(edited).toContain('不要覆盖人工已修正字段')

    const withThreshold = buildParsePrompt(parsingRow(), { scoreThreshold: 80 })
    expect(withThreshold).toContain('80')
    // spec 红线：阈值仅界面提示，不得出现自动推进/接受语义
    expect(withThreshold).not.toMatch(/自动(推进|接受|通过)/)
  })

  it('normalizeExtracted clamps score and prunes blanks; extractJsonLoose survives fences and prose', () => {
    expect(normalizeExtracted({ name: '张三', matchScore: 120.6 }).matchScore).toBe(100)
    expect(normalizeExtracted({ matchScore: -3 }).matchScore).toBe(0)
    const normalized = normalizeExtracted({ name: '  张三 ', matchScore: '88.4', summary: '   ', skills: ['Vue', '', 3] })
    expect(normalized).toMatchObject({ name: '张三', matchScore: 88 })
    expect(normalized.summary).toBeUndefined()
    expect(normalized.skills).toEqual(['Vue'])

    expect(extractJsonLoose('结果如下：```json\n{"name":"李四"}\n```以上')).toMatchObject({ name: '李四' })
    expect(extractJsonLoose('prefix {"name":"李四"} suffix')).toMatchObject({ name: '李四' })
    expect(extractJsonLoose('no json at all')).toBeNull()
  })
})

describe('ResumeScreenParseProcessor.sweepStale', () => {
  it('claims each stale row and re-enqueues with bumped attemptCount; skips lost claims', async () => {
    const service = buildService(null)
    service.findStaleParsingRows.mockResolvedValue([
      { id: 'c-1', attemptCount: 1, scope: SCOPE },
      { id: 'c-2', attemptCount: 0, scope: SCOPE }
    ])
    service.claimStaleParsing
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const intakeQueue = { enqueueParse: jest.fn(async () => undefined) }
    const processor = new ResumeScreenParseProcessor(service as never, intakeQueue as never, runtimeStub(jest.fn()) as never)

    await processor.sweepStale()

    // 新 jobId=attemptCount+1 绕开 BullMQ 同 id 去重（F5）；抢占失败（他人已处理）跳过
    expect(intakeQueue.enqueueParse).toHaveBeenCalledTimes(1)
    expect(intakeQueue.enqueueParse).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: 'c-1', attemptCount: 2, tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' })
    )
    expect(service.claimStaleParsing).toHaveBeenCalledWith('c-2')
  })

  it('reentrancy guard: concurrent sweep rounds return immediately', async () => {
    let release: (rows: unknown[]) => void = () => undefined
    const service = buildService(null)
    service.findStaleParsingRows.mockImplementation(
      () => new Promise((resolve) => { release = resolve })
    )
    const intakeQueue = { enqueueParse: jest.fn(async () => undefined) }
    const processor = new ResumeScreenParseProcessor(service as never, intakeQueue as never, runtimeStub(jest.fn()) as never)

    const first = processor.sweepStale()
    // 第一轮还卡在查询时，第二轮直接返回，不重复扫库
    await processor.sweepStale()
    release([{ id: 'c-9', attemptCount: 0, scope: SCOPE }])
    await first
    expect(intakeQueue.enqueueParse).toHaveBeenCalledTimes(1)
    expect(intakeQueue.enqueueParse).toHaveBeenCalledWith(expect.objectContaining({ candidateId: 'c-9', attemptCount: 1 }))
  })

  it('sweep errors are swallowed for the next round instead of crashing the interval', async () => {
    const service = buildService(null)
    service.findStaleParsingRows.mockRejectedValue(new Error('db flaky'))
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(jest.fn()) as never)
    await expect(processor.sweepStale()).resolves.toBeUndefined()
  })
})
