jest.mock('./wechat-outbound-queue.service.js', () => ({
  WechatOutboundQueueService: class WechatOutboundQueueService {}
}))

import { readFileSync } from 'fs'
import { join } from 'path'
import { WECHAT_OUTBOUND_SEND_TEXT_JOB } from './constants.js'
import { WechatOutboundQueueProcessor } from './wechat-outbound-queue.processor.js'

describe('WechatOutboundQueueProcessor', () => {
  it('runs the BullMQ worker with single-message concurrency', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/wechat-outbound-queue.processor.ts'), 'utf8')

    expect(source).toContain('concurrency: 1')
  })

  it('delegates send-text jobs to the outbound queue service', async () => {
    const service = {
      processSendTextJob: jest.fn(async () => undefined),
      handleJobFailure: jest.fn(async () => undefined)
    }
    const processor = new WechatOutboundQueueProcessor(service as any)
    const job = { id: 'job-1', name: WECHAT_OUTBOUND_SEND_TEXT_JOB, attemptsMade: 0 }

    await processor.process(job as any)

    expect(service.processSendTextJob).toHaveBeenCalledWith(job)
    expect(service.handleJobFailure).not.toHaveBeenCalled()
  })

  it('records failures and rethrows so BullMQ can apply attempts/backoff', async () => {
    const error = new Error('wx failed')
    const service = {
      processSendTextJob: jest.fn(async () => {
        throw error
      }),
      handleJobFailure: jest.fn(async () => undefined)
    }
    const processor = new WechatOutboundQueueProcessor(service as any)
    const job = { id: 'job-1', name: WECHAT_OUTBOUND_SEND_TEXT_JOB, attemptsMade: 0 }

    await expect(processor.process(job as any)).rejects.toThrow('wx failed')

    expect(service.handleJobFailure).toHaveBeenCalledWith(job, error)
  })
})
