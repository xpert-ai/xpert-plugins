jest.mock('@xpert-ai/plugin-sdk', () => ({
  WorkflowTriggerStrategy: () => (target: unknown) => target,
  ChatChannel: () => (target: unknown) => target,
  defineChannelMessageType: (...parts: unknown[]) => parts.join(':'),
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE: 'agent_chat_dispatch',
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  RequestContext: {
    currentTenantId: () => undefined,
    currentUserId: () => undefined,
    getLanguageCode: () => undefined,
    getOrganizationId: () => undefined
  }
}))

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  WECHAT_INBOUND_AGGREGATE_JOB,
  WECHAT_INBOUND_FLUSH_JOB
} from '../constants.js'
import { WechatInboundQueueProcessor } from './wechat-inbound-queue.processor.js'

describe('WechatInboundQueueProcessor', () => {
  it('allows multiple conversation keys to run while per-key Redis locks serialize aggregation', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/workflow/wechat-inbound-queue.processor.ts'), 'utf8')

    expect(source).toContain('concurrency: 8')
    expect(source).not.toContain('concurrency: 1')
  })

  it('delegates aggregate jobs to the trigger strategy', async () => {
    const triggerStrategy = {
      processInboundAggregateJob: jest.fn(async () => undefined),
      flushBufferedConversation: jest.fn(async () => true)
    }
    const processor = new WechatInboundQueueProcessor(triggerStrategy as any)
    const job = {
      name: WECHAT_INBOUND_AGGREGATE_JOB,
      data: {
        aggregateKey: 'aggregate-1',
        integrationId: 'integration-1',
        xpertId: 'xpert-1',
        summaryWindowSeconds: 5,
        sessionTimeoutSeconds: 3600,
        tenantId: 'tenant-1',
        latestMessage: {
          integrationId: 'integration-1',
          uuid: 'uuid-1',
          contactId: 'wxid_friend'
        }
      }
    }

    await processor.process(job as any)

    expect(triggerStrategy.processInboundAggregateJob).toHaveBeenCalledWith(job.data)
    expect(triggerStrategy.flushBufferedConversation).not.toHaveBeenCalled()
  })

  it('delegates flush jobs to the trigger strategy', async () => {
    const triggerStrategy = {
      processInboundAggregateJob: jest.fn(async () => undefined),
      flushBufferedConversation: jest.fn(async () => true)
    }
    const processor = new WechatInboundQueueProcessor(triggerStrategy as any)
    const job = {
      name: WECHAT_INBOUND_FLUSH_JOB,
      data: {
        aggregateKey: 'aggregate-1',
        version: 2
      }
    }

    await processor.process(job as any)

    expect(triggerStrategy.flushBufferedConversation).toHaveBeenCalledWith(job.data)
    expect(triggerStrategy.processInboundAggregateJob).not.toHaveBeenCalled()
  })
})
