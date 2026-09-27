/**
 * 链路 B 解析队列 worker（spec v2.2 §7.7）
 *
 * 编排层：认领 parsing 行 → 「JD+单文本」直调 deepseek（凭证/计费走平台 runtime，F1）→
 * 结构化优先、文本 JSON 容错降级 → 复用 service.saveCandidatesFromAgent 回填；
 * 崩溃恢复权威是 DB 状态 + 周期 sweep（F4/F5），不依赖 BullMQ stalled 回收。
 * prompt/schema/归一纯函数拆在 resume-screen-parse-prompt.ts（≤300 行/文件）。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { PluginJobProcessor, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN } from '@xpert-ai/plugin-sdk'
import type { AgentMiddlewareRuntimeServiceApi, ManagedQueueJob, ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import {
  RESUME_SCREEN_PARSE_ATTEMPTS,
  RESUME_SCREEN_PARSE_JOB,
  RESUME_SCREEN_PARSE_QUEUE,
  RESUME_SCREEN_PLUGIN_NAME,
  RESUME_SCREEN_SWEEP_BATCH_LIMIT
} from './constants'
import { buildParsePrompt, extractJsonLoose, extractJsonSchema, normalizeExtracted } from './resume-screen-parse-prompt'
import type { ExtractedCandidate } from './resume-screen-parse-prompt'
import { ResumeScreenIntakeQueue } from './resume-screen-intake-queue'
import { RESUME_SCREEN_PLUGIN_CONTEXT } from './resume-screen-plugin-context'
import { ResumeScreenService } from './resume-screen.service'
import type { ResumeScreenParseJobPayload } from './types'

/** 解析任务负载 + 平台恢复的执行上下文（类型对齐调研 B §1） */
type ParseJob = ManagedQueueJob<ResumeScreenParseJobPayload>

/** handle 消费的行视图：service.getCandidateForParse 的非空返回（worker 专用全量行） */
type ParseRow = NonNullable<Awaited<ReturnType<ResumeScreenService['getCandidateForParse']>>>

/** 单份简历模型调用超时：90s×4 次重试仍卡，靠 sweep 兜底，不无限挂 worker 槽位（调研 B 风险 1） */
const LLM_TIMEOUT_MS = 90_000
/** parsing 行视为滞留的阈值：超过即 sweep 接管（与 UI 10 分钟超时提示同源取 10min） */
export const STALE_PARSING_THRESHOLD_MS = 10 * 60_000
/** sweep 周期（调研 B §4：崩溃恢复权威，不依赖 BullMQ stalled） */
const SWEEP_INTERVAL_MS = 5 * 60_000

// worker 无请求上下文，隔离维度与评分阈值全靠行自携带 + 插件安装上下文
type ParsePluginContext = { scopeKey?: string | null; config?: { scoreThreshold?: number } }

/**
 * 链路 B 执行器（spec v2.2 §7.7）：payload 仅 candidateId，处理时现取全文；
 * 逐份「JD+单文本」直调模型，结构化优先、文本 JSON 容错降级（F6 风险 5：不赌 functionCalling 兼容）；
 * 回填复用 service.saveCandidatesFromAgent（humanEditedFields/幂等/乐观锁全继承，零新语义）。
 * concurrency=3：批量上限 10 时天花板明确（用户设计定稿）。
 */
@Injectable()
@PluginJobProcessor({
  pluginName: RESUME_SCREEN_PLUGIN_NAME,
  queueName: RESUME_SCREEN_PARSE_QUEUE,
  jobName: RESUME_SCREEN_PARSE_JOB,
  concurrency: 3
})
export class ResumeScreenParseProcessor {
  private readonly logger = new Logger(ResumeScreenParseProcessor.name)
  private sweepTimer: ReturnType<typeof setInterval> | undefined
  private sweeping = false

  constructor(
    private readonly service: ResumeScreenService,
    private readonly intakeQueue: ResumeScreenIntakeQueue,
    @Optional() @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN) private readonly modelRuntime: AgentMiddlewareRuntimeServiceApi | undefined,
    @Optional() @Inject(RESUME_SCREEN_PLUGIN_CONTEXT) private readonly pluginContext: ParsePluginContext | undefined
  ) {}

  /** 崩溃恢复权威：parsing 滞留行重投/标失败（OnModuleInit 起，unref 不阻进程退出） */
  onModuleInit() {
    this.sweepTimer = setInterval(() => void this.sweepStale(), SWEEP_INTERVAL_MS)
    this.sweepTimer.unref?.()
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer)
    }
  }

  /**
   * 处理一份候选人的解析任务
   *
   * @param job payload 仅含 candidateId；attemptsMade/opts.attempts 判定末次尝试
   * @param _context 平台恢复的持久化 scope（行自携带字段为权威，这里不使用）
   * @exception Error 模型/回填异常原样上抛交 BullMQ 重试；末次尝试先落业务 failed 再抛
   */
  async handle(job: ParseJob, _context: ManagedQueueJobContext): Promise<void> {
    const payload = job.data
    const row = payload?.candidateId ? await this.service.getCandidateForParse(payload.candidateId) : null
    // 幂等认领：重复投递/人工已处置 → 静默完成（DB 状态权威，F5）
    if (!row || row.status !== 'parsing') {
      this.logger.log(`解析任务跳过：candidate=${payload?.candidateId ?? 'n/a'}（状态=${row?.status ?? '不存在'}）`)
      return
    }
    const scope = row.scope
    try {
      const extracted = await this.invokeModel(row)
      await this.service.saveCandidatesFromAgent(scope, row.jobId, [{ sourceText: row.sourceText, ...extracted }])
      this.logger.log(`候选人解析回填完成：candidate=${row.id} score=${extracted.matchScore ?? 'n/a'}`)
    } catch (error) {
      const message = (error as Error)?.message || 'unknown'
      const attempts = Number(job.opts?.attempts ?? RESUME_SCREEN_PARSE_ATTEMPTS)
      // 末次尝试主动落业务失败态，防止永卡 parsing（调研 B 风险 4）
      if (Number(job.attemptsMade ?? 0) + 1 >= attempts) {
        this.logger.error(`候选人解析最终失败：candidate=${row.id} 原因=${message}`)
        await this.service.markCandidateFailed(scope, row.id, `模型解析失败：${message.slice(0, 500)}`)
      }
      throw error
    }
  }

  /** 直调 deepseek：凭证/额度/计费全在平台 runtime 层（F1），插件不接触 Key */
  private async invokeModel(row: ParseRow): Promise<ExtractedCandidate> {
    if (!this.modelRuntime) {
      throw new Error('模型运行时不可用（平台未启用中间件运行时），请联系管理员')
    }
    const api = this.modelRuntime.createScopedApi({
      tenantId: row.scope.tenantId,
      organizationId: row.scope.organizationId ?? undefined,
      userId: row.scope.userId ?? undefined
    })
    const provider = await api.getModelProvider?.('deepseek')
    if (!provider?.copilotId) {
      throw new Error('模型 provider deepseek 未配置或未启用')
    }
    const client = await api.createModelClient(
      { copilotId: provider.copilotId, model: 'deepseek-v4-flash', modelType: AiModelTypeEnum.LLM, options: { temperature: 0.2 } } as never,
      {}
    )
    const messages = [{ role: 'user', content: buildParsePrompt(row, { scoreThreshold: this.pluginContext?.config?.scoreThreshold }) }]
    try {
      // 结构化优先：宿主 langchain 客户端支持 zod schema 时直接得到对象
      const structured = (client as { withStructuredOutput?: (s: unknown) => { invoke: (m: unknown, o?: unknown) => Promise<unknown> } }).withStructuredOutput?.(extractJsonSchema)
      const res = await structured.invoke(messages, { signal: AbortSignal.timeout(LLM_TIMEOUT_MS) })
      return normalizeExtracted(res)
    } catch (error) {
      // 降级是预期路径不告警，但留 debug 痕迹便于排查宿主 functionCalling 兼容性（M8' Minor）
      this.logger.debug(`结构化输出不可用，降级文本 JSON 抽取：${(error as Error)?.message ?? 'unknown'}`)
      const res = await (client as { invoke: (m: unknown, o?: unknown) => Promise<{ content?: string }> }).invoke(messages, {
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
      })
      const parsed = extractJsonLoose(typeof res?.content === 'string' ? res.content : JSON.stringify(res?.content ?? ''))
      if (!parsed) {
        throw new Error('模型返回无法解析为 JSON')
      }
      return normalizeExtracted(parsed)
    }
  }

  /**
   * 周期兜底：捞滞留 parsing 行，条件抢占成功才重投（新 jobId 绕 BullMQ 去重，F5）
   *
   * 重投代号取 claimStaleParsing 回读的持久化新号（自增已随抢占落库）：内存 +1 在崩溃
   * 循环下会反复读回同一旧值，与 Redis 内存活 job 同 id 被静默去重而永卡 parsing（M8' Important-1）。
   */
  async sweepStale(): Promise<void> {
    if (this.sweeping) {
      return
    }
    this.sweeping = true
    try {
      const stale = await this.service.findStaleParsingRows(STALE_PARSING_THRESHOLD_MS)
      // 抢占条件复用滞留口径：晚于本时刻被刷新的行视为新鲜，让给下一轮判定
      const cutoff = new Date(Date.now() - STALE_PARSING_THRESHOLD_MS)
      for (const row of stale.slice(0, RESUME_SCREEN_SWEEP_BATCH_LIMIT)) {
        // 多副本/双 sweep 并发下只有一方抢占成功（DB 条件更新），失败方跳过避免重复投递
        const claimedAttempt = await this.service.claimStaleParsing(row.id, cutoff)
        if (claimedAttempt === null) {
          continue
        }
        await this.intakeQueue.enqueueParse({
          candidateId: row.id,
          attemptCount: claimedAttempt,
          tenantId: row.scope.tenantId,
          organizationId: row.scope.organizationId ?? undefined,
          userId: row.scope.userId ?? undefined
        })
      }
      if (stale.length > 0) {
        this.logger.warn(`滞留解析兜底重投：${stale.length} 行（阈值 ${STALE_PARSING_THRESHOLD_MS / 60000} 分钟）`)
      }
    } catch (error) {
      // 单轮兜底异常不杀定时器，留给下一轮
      this.logger.warn(`滞留兜底轮次异常（下轮再试）：${(error as Error).message}`)
    } finally {
      this.sweeping = false
    }
  }
}
