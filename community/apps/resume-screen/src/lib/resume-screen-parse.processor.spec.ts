/**
 * 链路 B 解析队列 worker 单元测试（spec v2.2 §7.7 + v5 spec §3.5）
 *
 * 全部外部件按 R10 mock：service（内存 stub，含唯一 fileStore 实例的 read/exists stub）、
 * ManagedQueueService（经 intakeQueue stub）、模型 runtime token provider 链
 * （createScopedApi→getModelProvider→createModelClient→invoke）。
 * v5 关键口径：简历正文只在任务内存里存在——测试用 fixture 字节经 fileStore.read 桩注入，
 * 断言 prompt 含解析出的文本、行数据里不再有 sourceText。
 * 覆盖幂等认领、任务期读盘解析、文件缺失/解析失败收敛（不消耗 attempt）、结构化优先/文本 JSON
 * 容错降级、末次尝试落败+rethrow、provider 未配置、prompt 纯函数与 sweep 抢占/重入，
 * 以及 sweep 定时器的构造期挂接（热重载语义）。
 */
// mock SDK：plugin-sdk 全量引入依赖 lodash-es 等 ESM 产物，jest(CommonJS) 无法解析；
// 被测代码只消费装饰器与注入 token，此处提供行为等价实现（对齐 provider spec 的 mock 方式）
jest.mock('@xpert-ai/plugin-sdk', () => ({
  PluginJobProcessor: () => (target: unknown) => target,
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN: 'XPERT_AGENT_MIDDLEWARE_RUNTIME'
}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ResumeScreenParseProcessor, STALE_PARSING_THRESHOLD_MS } from './resume-screen-parse.processor'
import { buildParsePrompt, extractJsonLoose, normalizeExtracted } from './resume-screen-parse-prompt'

const SCOPE = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', assistantId: 'assistant-1' }

const RESUME_BYTES = readFileSync(join(__dirname, '__fixtures__', 'resume-minimal.docx'))
const SCANNED_PDF_BYTES = readFileSync(join(__dirname, '__fixtures__', 'resume-empty.pdf'))

/** 存储 key 契约形态：`{yyyy-MM-dd UTC}/{sha256 前 16 位}.{ext}`，单段无第二段（resume-file-store.ts:28） */
const RESUME_KEY = '2026-09-29/0000000000000000.docx'

/**
 * 解析行工厂：v5 起 getCandidateForParse 只回文件定位三字段，不再回简历正文。
 * @param overrides 单用例的业务差异（状态/缺 key/扫描件文件名等）
 */
function parsingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    jobId: 'job-1',
    status: 'parsing',
    filePath: RESUME_KEY,
    fileMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sourceFileName: '张三.docx',
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

/** service stub：getCandidateForParse 返回给定行，fileStore 复用「全插件唯一实例」的读盘口 */
function buildService(row: unknown) {
  return {
    getCandidateForParse: jest.fn(async () => row),
    saveCandidatesFromAgent: jest.fn(async () => []),
    markCandidateFailed: jest.fn(async () => undefined),
    findStaleParsingRows: jest.fn(async () => []),
    // claim 新语义：抢占成功返回持久化自增后的新 attemptCount，失败返回 null
    claimStaleParsing: jest.fn(async () => 1),
    // 文件字节按 key 现取（v5：文本只在任务内存里，spec §3.5）
    fileStore: { read: jest.fn(async () => RESUME_BYTES), exists: jest.fn(async () => true) }
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

  it('structured path: prompts contain full JD and parsed resume, backfills via saveCandidatesFromAgent', async () => {
    const row = parsingRow()
    const structuredInvoke = jest.fn(async () => ({ ...extract }))
    const service = buildService(row)
    // scoreThreshold 经 pluginContext.config 接线：仅作为提示进 prompt（界面同源，不自动推进）
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(structuredInvoke), { config: { scoreThreshold: 60 } } as never)
    await processor.handle(parseJob(), queueCtx)

    // prompt 必须含 JD 全文与文件解析出的简历正文（fixture 内含「张三」「React」）
    const content = structuredInvoke.mock.calls[0][0][0].content as string
    expect(content).toContain('精通 React，3 年以上经验，负责中台前端')
    expect(content).toContain('张三')
    expect(content).toContain('60')
    expect(structuredInvoke.mock.calls[0][1]).toMatchObject({ signal: expect.anything() })
    // 回填锚点 = candidateId（原文不再入库，dedupeKey 反推已失效）
    expect(service.saveCandidatesFromAgent).toHaveBeenCalledWith(
      SCOPE,
      'job-1',
      [expect.objectContaining({ candidateId: 'c-1', ...extract })]
    )
    // 红线：正文只在任务内存里——回填结构不得带 sourceText
    const backfilled = service.saveCandidatesFromAgent.mock.calls[0][2][0] as Record<string, unknown>
    expect(backfilled).not.toHaveProperty('sourceText')
    expect(service.fileStore.read).toHaveBeenCalledWith(RESUME_KEY)
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
      [expect.objectContaining({ candidateId: 'c-1', name: '张三', matchScore: 72 })]
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

  it('missing filePath marks file_missing without calling the model or rethrowing', async () => {
    const structuredInvoke = jest.fn()
    const service = buildService(parsingRow({ filePath: '' }))
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(structuredInvoke))
    // 不抛错 = BullMQ 不再重试 = 不消耗模型 attempt（spec §3.5）
    await expect(processor.handle(parseJob(), queueCtx)).resolves.toBeUndefined()
    expect(service.markCandidateFailed).toHaveBeenCalledWith(SCOPE, 'c-1', 'file_missing')
    expect(structuredInvoke).not.toHaveBeenCalled()
    expect(service.saveCandidatesFromAgent).not.toHaveBeenCalled()
    // 空 key 必须在调用存储前收敛，不让 store 侧 resolveSafe 拿到空路径去拼目录
    expect(service.fileStore.read).not.toHaveBeenCalled()
  })

  it('unreadable file on disk marks file_missing; broken resume marks the parser reason verbatim', async () => {
    const readFail = buildService(parsingRow())
    readFail.fileStore.read.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const p1 = new ResumeScreenParseProcessor(readFail as never, { enqueueParse: jest.fn() } as never, runtimeStub(jest.fn()))
    await p1.handle(parseJob(), queueCtx)
    expect(readFail.markCandidateFailed).toHaveBeenCalledWith(SCOPE, 'c-1', 'file_missing')

    // 扫描件无文字层：reason 原值写进 failureReason，供 §6.6 映射表出可执行指引
    // 判定以「扩展名 + 魔数」为准，故行必须同时给出 .pdf 文件名与 pdf mime
    const scanned = buildService(parsingRow({ sourceFileName: '扫描件.pdf', fileMime: 'application/pdf' }))
    scanned.fileStore.read.mockResolvedValueOnce(SCANNED_PDF_BYTES)
    const p2 = new ResumeScreenParseProcessor(scanned as never, { enqueueParse: jest.fn() } as never, runtimeStub(jest.fn()))
    await p2.handle(parseJob({ attemptsMade: 0 }), queueCtx)
    expect(scanned.markCandidateFailed).toHaveBeenCalledWith(SCOPE, 'c-1', 'no_text_layer')
    expect(scanned.saveCandidatesFromAgent).not.toHaveBeenCalled()
  })

  // 模型运行时缺失（@Optional 注入为 undefined）是配置类故障：不消耗模型 attempt，也不允许
  // 行悬挂在 parsing——末次尝试必须先落可读失败态再抛错交 BullMQ 收尾
  it('模型运行时缺失按末次尝试落业务失败，失败原因指明运行时未启用', async () => {
    const service = buildService(parsingRow())
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, undefined)
    await expect(processor.handle(parseJob({ attemptsMade: 3 }), queueCtx)).rejects.toThrow('模型运行时不可用')
    // 文件已成功读出（失败归因在模型调用而非文件），回填自然不得发生
    expect(service.fileStore.read).toHaveBeenCalledWith(RESUME_KEY)
    expect(service.markCandidateFailed).toHaveBeenCalledWith(SCOPE, 'c-1', expect.stringContaining('模型解析失败'))
    expect(service.saveCandidatesFromAgent).not.toHaveBeenCalled()
  })

  // 降级路径的二次失败：结构化不可用后，文本输出连宽松 JSON 都抽不出来——
  // 非末次尝试只重抛交 BullMQ 重试，不提前落业务失败态（与文件类失败的就地收敛区分开）
  it('降级后模型输出不含任何 JSON 时按瞬时失败重抛（非末次不落业务失败）', async () => {
    const structuredInvoke = jest.fn(async () => {
      throw new Error('no function calling')
    })
    const textInvoke = jest.fn(async () => ({ content: '抱歉，这一轮我无法给出结构化结果。' }))
    const service = buildService(parsingRow())
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(structuredInvoke, textInvoke))
    await expect(processor.handle(parseJob({ attemptsMade: 0 }), queueCtx)).rejects.toThrow('模型返回无法解析为 JSON')
    expect(service.markCandidateFailed).not.toHaveBeenCalled()
    expect(service.saveCandidatesFromAgent).not.toHaveBeenCalled()
  })

  it('a row re-enqueued by sweep is claimed and driven forward by this processor', async () => {
    // sweep 重投的是同一行（DB 仍为 parsing，attemptCount 已被 claimStaleParsing 持久化自增到 4）：
    // 这条用例把「重投 → worker 重新认领 → 读盘 → 回填」的真实转换钉住，而不是假设上游已覆盖
    const row = parsingRow({ attemptCount: 4 })
    const structuredInvoke = jest.fn(async () => ({ ...extract }))
    const service = buildService(row)
    const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(structuredInvoke))

    await processor.handle(parseJob({ attemptsMade: 4 }), queueCtx)

    expect(service.getCandidateForParse).toHaveBeenCalledWith('c-1')
    expect(service.fileStore.read).toHaveBeenCalledWith(RESUME_KEY)
    expect(service.saveCandidatesFromAgent).toHaveBeenCalledWith(
      SCOPE,
      'job-1',
      [expect.objectContaining({ candidateId: 'c-1', ...extract })]
    )
    expect(service.markCandidateFailed).not.toHaveBeenCalled()
  })
})

describe('buildParsePrompt / extraction helpers', () => {
  it('prompt protects human-edited fields and treats scoreThreshold as a UI hint only', () => {
    const base = buildParsePrompt({ jobTitle: '前端工程师', jobJdText: '精通 React', sourceText: '张三 5年经验 React工程师 本科' })
    expect(base).toContain('只输出 JSON')
    expect(base).not.toContain('人工')

    const edited = buildParsePrompt({ sourceText: '张三', humanEditedFields: ['name', 'matchScore'] })
    expect(edited).toContain('name')
    expect(edited).toContain('不要覆盖人工已修正字段')

    const withThreshold = buildParsePrompt({ sourceText: '张三' }, { scoreThreshold: 80 })
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
  it('re-enqueues with the attempt number persisted by claim, not the stale in-memory bump', async () => {
    const service = buildService(null)
    service.findStaleParsingRows.mockResolvedValue([
      // c-1 的查询时值故意与 claim 回读值不同：证明重投口径取 claim 的持久化新号（崩溃循环下
      // 内存 +1 会读回原值撞上 Redis 存活 job 被静默去重，F5 修复点）；4 仍在尝试上限内
      { id: 'c-1', attemptCount: 1, scope: SCOPE },
      { id: 'c-2', attemptCount: 0, scope: SCOPE }
    ])
    service.claimStaleParsing
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(null)
    const intakeQueue = { enqueueParse: jest.fn(async () => undefined) }
    const processor = new ResumeScreenParseProcessor(service as never, intakeQueue as never, runtimeStub(jest.fn()) as never)

    await processor.sweepStale()

    // 抢占条件带 cutoff（防抢窗口内新鲜行）；重投用 claim 返回的 4；c-2 抢占失败（null）跳过
    expect(service.claimStaleParsing).toHaveBeenCalledWith('c-1', expect.any(Date))
    expect(intakeQueue.enqueueParse).toHaveBeenCalledTimes(1)
    expect(intakeQueue.enqueueParse).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: 'c-1', attemptCount: 4, tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' })
    )
    // 未超限不触发失败收敛
    expect(service.markCandidateFailed).not.toHaveBeenCalled()
  })

  // S7 审核 F3（spec §7.7）：持久化投递代号超 RESUME_SCREEN_PARSE_ATTEMPTS 上限即停止重投，
  // 标 failed 给可读原因——否则队列每丢一次件就再循环 10 分钟，无界重投
  it('attempt cap overrun converges to failed with a readable reason instead of re-enqueueing', async () => {
    const service = buildService(null)
    service.findStaleParsingRows.mockResolvedValue([{ id: 'c-1', attemptCount: 4, scope: SCOPE }])
    // claim 回读的持久化代号 5 > 上限 4：行已滞留过 4 轮自动重投，本轮只收敛不再排队
    service.claimStaleParsing.mockResolvedValue(5)
    const intakeQueue = { enqueueParse: jest.fn(async () => undefined) }
    const processor = new ResumeScreenParseProcessor(service as never, intakeQueue as never, runtimeStub(jest.fn()) as never)

    await processor.sweepStale()

    expect(service.markCandidateFailed).toHaveBeenCalledWith(
      SCOPE,
      'c-1',
      expect.stringContaining('请点击重试')
    )
    expect(intakeQueue.enqueueParse).not.toHaveBeenCalled()
  })

  it('crash loop: two consecutive sweep rounds claim and enqueue with strictly increasing attempt numbers', async () => {
    // 模拟 service 的持久化自增：claim 把 attemptCount +1 落库并回读新值，findStale 每轮都从库里读
    let persisted = 0
    const service = buildService(null)
    service.findStaleParsingRows.mockImplementation(async () => [{ id: 'c-1', attemptCount: persisted, scope: SCOPE }])
    service.claimStaleParsing.mockImplementation(async () => {
      persisted += 1
      return persisted
    })
    const intakeQueue = { enqueueParse: jest.fn(async () => undefined) }
    const processor = new ResumeScreenParseProcessor(service as never, intakeQueue as never, runtimeStub(jest.fn()) as never)

    await processor.sweepStale()
    await processor.sweepStale()

    // 连续两轮 claim 各自变号 → enqueueParse jobId（resume-parse-c-1-{n}）逐轮递增，
    // 不会与 Redis 内存活的上一代 job 同 id 被去重（F5）
    const enqueued = intakeQueue.enqueueParse.mock.calls.map((call) => call[0].attemptCount)
    expect(enqueued).toEqual([1, 2])
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

describe('ResumeScreenParseProcessor sweep timer wiring', () => {
  it('constructing the processor schedules the sweep immediately, without any lifecycle hook (Task32: hot reload never runs onModuleInit)', async () => {
    jest.useFakeTimers()
    try {
      const service = buildService(null)
      // 只构造、不调用任何 Nest 生命周期钩子：热重载重建实例后 sweep 也必须存活
      new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(jest.fn()) as never)
      expect(jest.getTimerCount()).toBe(1)
      // 周期取 SWEEP_INTERVAL_MS（5 分钟）：未满周期不触发
      await jest.advanceTimersByTimeAsync(4 * 60_000)
      expect(service.findStaleParsingRows).not.toHaveBeenCalled()
      await jest.advanceTimersByTimeAsync(60_000)
      expect(service.findStaleParsingRows).toHaveBeenCalledTimes(1)
      // 周期定时器持续滚动：下一轮照常再来
      await jest.advanceTimersByTimeAsync(5 * 60_000)
      expect(service.findStaleParsingRows).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('startSweepTimer is idempotent: repeated calls keep a single interval', () => {
    jest.useFakeTimers()
    try {
      const processor = new ResumeScreenParseProcessor(buildService(null) as never, { enqueueParse: jest.fn() } as never, runtimeStub(jest.fn()) as never)
      const start = (processor as unknown as { startSweepTimer: () => void }).startSweepTimer.bind(processor)
      // 构造已挂一次，再重复调用不得叠加定时器（单实例假设下的双启动防护）
      start()
      start()
      expect(jest.getTimerCount()).toBe(1)
    } finally {
      jest.useRealTimers()
    }
  })

  // 滞留阈值与 UI 的 10 分钟超时提示同源取值：两边各自漂移时，工作台会先于/晚于 sweep 提示，
  // 用户看到的状态与兜底动作脱节——这里钉死 10 分钟这个契约值
  it('滞留解析阈值与 UI 超时提示同源（10 分钟）', () => {
    expect(STALE_PARSING_THRESHOLD_MS).toBe(10 * 60_000)
  })

  // 常态销毁路径（onModuleDestroy）：interval 必须随实例销毁清掉，否则插件卸载/重建后
  // 旧定时器继续打兜底查询，形成僵尸轮次；重复销毁也必须幂等不抛错
  it('onModuleDestroy 清理 sweep 定时器：销毁后不再触发兜底且重复销毁幂等', async () => {
    jest.useFakeTimers()
    try {
      const service = buildService(null)
      const processor = new ResumeScreenParseProcessor(service as never, { enqueueParse: jest.fn() } as never, runtimeStub(jest.fn()) as never)
      expect(jest.getTimerCount()).toBe(1)
      processor.onModuleDestroy()
      expect(jest.getTimerCount()).toBe(0)
      // 已清掉的周期到点也不得再跑兜底查询
      await jest.advanceTimersByTimeAsync(6 * 60_000)
      expect(service.findStaleParsingRows).not.toHaveBeenCalled()
      // sweepTimer 为 undefined 时再销毁一次：不得抛错（热重载时序下 destroy 可能被调多次）
      expect(() => processor.onModuleDestroy()).not.toThrow()
    } finally {
      jest.useRealTimers()
    }
  })
})
