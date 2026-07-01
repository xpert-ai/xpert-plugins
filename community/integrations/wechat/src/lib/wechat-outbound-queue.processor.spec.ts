jest.mock('./wechat-outbound-queue.service.js', () => ({
  WechatOutboundQueueService: class WechatOutboundQueueService {}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  PLUGIN_JOB_PROCESSOR_METADATA: 'XPERT_PLUGIN_JOB_PROCESSOR_METADATA',
  PluginJobProcessor: (options: any) => (target: any) => {
    const metadata = {
      pluginName: options.pluginName,
      queueName: options.queueName ?? options.queue,
      jobName: options.jobName ?? options.jobType,
      ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency })
    }
    const existing = Reflect.getMetadata('XPERT_PLUGIN_JOB_PROCESSOR_METADATA', target) ?? []
    Reflect.defineMetadata('XPERT_PLUGIN_JOB_PROCESSOR_METADATA', [metadata, ...existing], target)
  }
}))

import { readFileSync } from 'fs'
import { join } from 'path'
import { PLUGIN_JOB_PROCESSOR_METADATA } from '@xpert-ai/plugin-sdk'
import {
  WECHAT_OUTBOUND_QUEUE_NAME,
  WECHAT_OUTBOUND_SEND_TEXT_JOB,
  WECHAT_PLUGIN_NAME
} from './constants.js'
import { WechatOutboundQueueProcessor } from './wechat-outbound-queue.processor.js'

describe('WechatOutboundQueueProcessor', () => {
  function createPluginContext() {
    return {
      scopeKey: 'org:org-1',
      resolve: jest.fn(() => null)
    }
  }

  it('does not own a BullMQ worker directly', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/wechat-outbound-queue.processor.ts'), 'utf8')

    expect(source).not.toContain('@Processor')
    expect(source).not.toContain('WorkerHost')
  })

  it('declares the send-text handler through PluginJobProcessor metadata', () => {
    const metadata = Reflect.getMetadata(PLUGIN_JOB_PROCESSOR_METADATA, WechatOutboundQueueProcessor)

    expect(metadata).toEqual([
      expect.objectContaining({
        pluginName: WECHAT_PLUGIN_NAME,
        queueName: WECHAT_OUTBOUND_QUEUE_NAME,
        jobName: WECHAT_OUTBOUND_SEND_TEXT_JOB,
        concurrency: 1
      })
    ])
  })

  it('delegates send-text jobs to the outbound queue service', async () => {
    const service = {
      processSendTextJob: jest.fn(async () => undefined),
      handleJobFailure: jest.fn(async () => undefined)
    }
    const processor = new WechatOutboundQueueProcessor(service as any, createPluginContext() as any)
    const job = { id: 'job-1', name: WECHAT_OUTBOUND_SEND_TEXT_JOB, attemptsMade: 0 }

    await processor.handle(job as any)

    expect(service.processSendTextJob).toHaveBeenCalledWith(job)
    expect(service.handleJobFailure).not.toHaveBeenCalled()
  })

  it('records failures and rethrows so the managed queue can apply attempts/backoff', async () => {
    const error = new Error('wx failed')
    const service = {
      processSendTextJob: jest.fn(async () => {
        throw error
      }),
      handleJobFailure: jest.fn(async () => undefined)
    }
    const processor = new WechatOutboundQueueProcessor(service as any, createPluginContext() as any)
    const job = { id: 'job-1', name: WECHAT_OUTBOUND_SEND_TEXT_JOB, attemptsMade: 0 }

    await expect(processor.handle(job as any)).rejects.toThrow('wx failed')

    expect(service.handleJobFailure).toHaveBeenCalledWith(job, error)
  })
})
