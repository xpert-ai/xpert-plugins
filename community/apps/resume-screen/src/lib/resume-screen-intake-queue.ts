/**
 * 简历录入解析入队服务
 *
 * 链路 B（上传文件 → 模型解析）的唯一入队出口：视图上传动作与 sweep 兜底重投共用，
 * 保证 jobId 幂等规则与 scopeKey 路由口径只有一处实现。依赖 ManagedQueueService
 * （平台按 token 注入）与 PluginContext（安装作用域），二者均 @Optional 以兼容
 * harness/无 Redis 环境——构造不炸，enqueue 时给明确错误。
 */
import { Inject, Injectable, Optional } from '@nestjs/common'
import { MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { RESUME_SCREEN_PARSE_ATTEMPTS, RESUME_SCREEN_PARSE_JOB, RESUME_SCREEN_PARSE_QUEUE, RESUME_SCREEN_PLUGIN_NAME } from './constants'
import { RESUME_SCREEN_PLUGIN_CONTEXT } from './resume-screen-plugin-context'
import type { ResumeScreenParseJobPayload } from './types'

// 入队一次解析所需的最小上下文：定位字段 + 业务归属（供 handler 内构造模型调用 scope）
export interface EnqueueParseInput {
  candidateId: string
  attemptCount: number
  tenantId?: string
  organizationId?: string
  userId?: string
}

/**
 * 录入/重试的统一入队出口（链路 B，spec v2.2 §7.7）。
 * jobId=resume-parse-{candidateId}-{attemptCount} 确定性幂等：retry 后 attemptCount 变号、同次重复投递被 BullMQ 去重（F5）。
 * 依赖 @Optional：harness/无 Redis 环境缺 queue 服务时本类仍可构造，enqueue 才报明确错误（F7/R10 精神）。
 */
@Injectable()
export class ResumeScreenIntakeQueue {
  constructor(
    @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService | undefined,
    @Optional() @Inject(RESUME_SCREEN_PLUGIN_CONTEXT) private readonly pluginContext: { scopeKey?: string | null } | undefined
  ) {}

  /**
   * 投递一份候选人的解析任务
   *
   * payload 只放定位字段（大文本由 handler 按 candidateId 现取，调研 B §3.4 红线）；
   * 入队失败不吞异常，由调用方决定呈现（上传分支转失败提示，sweep 靠下轮重试）。
   *
   * @param input 见 EnqueueParseInput；attemptCount 参与 jobId 幂等键
   * @exception Error ManagedQueueService 未注入（无队列环境）或平台入队失败原样上抛
   */
  async enqueueParse(input: EnqueueParseInput): Promise<void> {
    if (!this.queue) {
      throw new Error('任务队列服务不可用，无法开始解析，请稍后在界面点击重试')
    }
    await this.queue.enqueue({
      pluginName: RESUME_SCREEN_PLUGIN_NAME,
      queueName: RESUME_SCREEN_PARSE_QUEUE,
      jobName: RESUME_SCREEN_PARSE_JOB,
      // 路由红线：scopeKey 用插件安装作用域，不是业务 organizationId（F2）
      scopeKey: this.pluginContext?.scopeKey ?? null,
      tenantId: input.tenantId ?? null,
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      jobId: `resume-parse-${input.candidateId}-${input.attemptCount}`,
      payload: { candidateId: input.candidateId, tenantId: input.tenantId, organizationId: input.organizationId, userId: input.userId } satisfies ResumeScreenParseJobPayload,
      attempts: RESUME_SCREEN_PARSE_ATTEMPTS,
      backoffMs: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 2000 },
      removeOnFail: { age: 604800, count: 5000 }
    })
  }
}
