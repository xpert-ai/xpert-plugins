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
  },
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

import { PLUGIN_JOB_PROCESSOR_METADATA } from '@xpert-ai/plugin-sdk'
import {
  WECHAT_INBOUND_AGGREGATE_JOB,
  WECHAT_INBOUND_FLUSH_JOB,
  WECHAT_INBOUND_QUEUE_NAME,
  WECHAT_PLUGIN_NAME
} from '../constants.js'
import { WechatInboundQueueProcessor } from './wechat-inbound-queue.processor.js'

describe('WechatInboundQueueProcessor', () => {
  function createPluginContext() {
    return {
      scopeKey: 'org:org-1',
      resolve: jest.fn(() => null)
    }
  }

  function createAggregateJob() {
    return {
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
  }

  it('declares aggregate and flush handlers through PluginJobProcessor metadata', () => {
    const metadata = Reflect.getMetadata(PLUGIN_JOB_PROCESSOR_METADATA, WechatInboundQueueProcessor)

    expect(metadata).toHaveLength(2)
    expect(metadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginName: WECHAT_PLUGIN_NAME,
          queueName: WECHAT_INBOUND_QUEUE_NAME,
          jobName: WECHAT_INBOUND_AGGREGATE_JOB
        }),
        expect.objectContaining({
          pluginName: WECHAT_PLUGIN_NAME,
          queueName: WECHAT_INBOUND_QUEUE_NAME,
          jobName: WECHAT_INBOUND_FLUSH_JOB
        })
      ])
    )
  })

  it('exposes the current plugin scope to the platform explorer', () => {
    const triggerStrategy = {
      processInboundAggregateJob: jest.fn(async () => undefined),
      flushBufferedConversation: jest.fn(async () => true)
    }
    const processor = new WechatInboundQueueProcessor(triggerStrategy as any, createPluginContext() as any)

    expect(processor.scopeKey).toBe('org:org-1')
  })

  it('delegates aggregate jobs to the trigger strategy', async () => {
    const triggerStrategy = {
      processInboundAggregateJob: jest.fn(async () => undefined),
      flushBufferedConversation: jest.fn(async () => true)
    }
    const processor = new WechatInboundQueueProcessor(triggerStrategy as any, createPluginContext() as any)
    const job = createAggregateJob()

    await processor.handle(job as any)

    expect(triggerStrategy.processInboundAggregateJob).toHaveBeenCalledWith(job.data)
    expect(triggerStrategy.flushBufferedConversation).not.toHaveBeenCalled()
  })

  it('delegates flush jobs to the trigger strategy', async () => {
    const triggerStrategy = {
      processInboundAggregateJob: jest.fn(async () => undefined),
      flushBufferedConversation: jest.fn(async () => true)
    }
    const processor = new WechatInboundQueueProcessor(triggerStrategy as any, createPluginContext() as any)
    const job = {
      name: WECHAT_INBOUND_FLUSH_JOB,
      data: {
        aggregateKey: 'aggregate-1',
        version: 2
      }
    }

    await processor.handle(job as any)

    expect(triggerStrategy.flushBufferedConversation).toHaveBeenCalledWith(job.data)
    expect(triggerStrategy.processInboundAggregateJob).not.toHaveBeenCalled()
  })

  it('keeps process as a compatibility alias for handle', async () => {
    const triggerStrategy = {
      processInboundAggregateJob: jest.fn(async () => undefined),
      flushBufferedConversation: jest.fn(async () => true)
    }
    const processor = new WechatInboundQueueProcessor(triggerStrategy as any, createPluginContext() as any)
    const job = createAggregateJob()

    await processor.process(job as any)

    expect(triggerStrategy.processInboundAggregateJob).toHaveBeenCalledWith(job.data)
  })
})
