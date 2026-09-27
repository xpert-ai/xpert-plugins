/**
 * 录入解析入队服务单元测试
 *
 * 以 jest.fn 模拟 ManagedQueueService，验证 jobId 确定性幂等、scopeKey 走插件安装
 * 作用域（F2 红线）与 payload 只放定位字段（不带大文本）；入队失败必须原样上抛。
 */
// mock SDK：plugin-sdk 全量引入依赖 lodash-es 等 ESM 产物，jest(CommonJS) 无法解析；
// 被测代码只消费注入 token，此处提供等价字符串常量（对齐 provider spec 的 mock 方式）
jest.mock('@xpert-ai/plugin-sdk', () => ({
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE'
}))

import { ResumeScreenIntakeQueue } from './resume-screen-intake-queue'
import { RESUME_SCREEN_PARSE_JOB, RESUME_SCREEN_PARSE_QUEUE } from './constants'

const buildQueue = () => ({ enqueue: jest.fn().mockResolvedValue({ jobId: 'j1' }), cancel: jest.fn(), getJob: jest.fn() })

describe('ResumeScreenIntakeQueue', () => {
  it('enqueues a parse job with deterministic id, plugin scopeKey and retry budget', async () => {
    const q = buildQueue()
    const ctx = { scopeKey: 'org-9' }
    const intake = new ResumeScreenIntakeQueue(q as never, ctx as never)
    await intake.enqueueParse({ candidateId: 'c-1', attemptCount: 2, tenantId: 't1', organizationId: 'org1', userId: 'u1' })
    expect(q.enqueue).toHaveBeenCalledTimes(1)
    const input = q.enqueue.mock.calls[0][0]
    expect(input).toMatchObject({
      queueName: RESUME_SCREEN_PARSE_QUEUE,
      jobName: RESUME_SCREEN_PARSE_JOB,
      jobId: 'resume-parse-c-1-2',
      scopeKey: 'org-9',
      attempts: 4
    })
    expect(input.payload).toEqual({ candidateId: 'c-1', tenantId: 't1', organizationId: 'org1', userId: 'u1' })
    // 红线：payload 不含大文本（调研 B §3.4）
    expect(JSON.stringify(input.payload)).not.toContain('sourceText')
  })

  it('swallows nothing: enqueue failure propagates to caller', async () => {
    const q = { enqueue: jest.fn().mockRejectedValue(new Error('redis down')) }
    const intake = new ResumeScreenIntakeQueue(q as never, { scopeKey: 's' } as never)
    await expect(intake.enqueueParse({ candidateId: 'c', attemptCount: 0, tenantId: 't' })).rejects.toThrow('redis down')
  })

  it('reports a clear error when queue service is unavailable (harness/no-redis env)', async () => {
    const intake = new ResumeScreenIntakeQueue(undefined as never, { scopeKey: 's' } as never)
    await expect(intake.enqueueParse({ candidateId: 'c', attemptCount: 0, tenantId: 't' })).rejects.toThrow('任务队列服务不可用')
  })
})
