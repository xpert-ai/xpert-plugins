jest.mock('@xpert-ai/plugin-sdk', () => ({
  XpertServerPlugin: () => (target: unknown) => target
}))

jest.mock('@nestjs/cqrs', () => ({
  CqrsModule: class CqrsModule {}
}))

jest.mock('@nestjs/core', () => ({
  DiscoveryModule: class DiscoveryModule {}
}))

jest.mock('@nestjs/typeorm', () => ({
  InjectDataSource: () => () => undefined,
  TypeOrmModule: {
    forFeature: jest.fn(() => ({}))
  }
}))

jest.mock('./dingtalk-channel.strategy.js', () => ({
  DingTalkChannelStrategy: class DingTalkChannelStrategy {}
}))
jest.mock('./dingtalk-integration.strategy.js', () => ({
  DingTalkIntegrationStrategy: class DingTalkIntegrationStrategy {}
}))
jest.mock('./dingtalk-long-integration.strategy.js', () => ({
  DingTalkLongIntegrationStrategy: class DingTalkLongIntegrationStrategy {}
}))
jest.mock('./dingtalk-long-connection.service.js', () => ({
  DingTalkLongConnectionService: class DingTalkLongConnectionService {}
}))
jest.mock('./dingtalk.controller.js', () => ({
  DingTalkHooksController: class DingTalkHooksController {}
}))
jest.mock('./conversation.service.js', () => ({
  DingTalkConversationService: class DingTalkConversationService {}
}))
jest.mock('./auth/dingtalk-token.strategy.js', () => ({
  DingTalkTokenStrategy: class DingTalkTokenStrategy {}
}))
jest.mock('./handoff/dingtalk-chat-dispatch.service.js', () => ({
  DingTalkChatDispatchService: class DingTalkChatDispatchService {}
}))
jest.mock('./handoff/dingtalk-chat-run-state.service.js', () => ({
  DingTalkChatRunStateService: class DingTalkChatRunStateService {}
}))
jest.mock('./handoff/dingtalk-chat-callback.processor.js', () => ({
  DingTalkChatStreamCallbackProcessor: class DingTalkChatStreamCallbackProcessor {}
}))
jest.mock('./entities/dingtalk-conversation-binding.entity.js', () => ({
  DingTalkConversationBindingEntity: class DingTalkConversationBindingEntity {}
}))
jest.mock('./entities/dingtalk-trigger-binding.entity.js', () => ({
  DingTalkTriggerBindingEntity: class DingTalkTriggerBindingEntity {}
}))
jest.mock('./middlewares/index.js', () => ({
  DingTalkNotifyMiddleware: class DingTalkNotifyMiddleware {}
}))
jest.mock('./handoff/commands/handlers/index.js', () => ({
  Handlers: []
}))
jest.mock('./workflow/dingtalk-trigger.strategy.js', () => ({
  DingTalkTriggerStrategy: class DingTalkTriggerStrategy {}
}))
jest.mock('./workflow/dingtalk-trigger-aggregation.service.js', () => ({
  DingTalkTriggerAggregationService: class DingTalkTriggerAggregationService {}
}))
jest.mock('./workflow/dingtalk-trigger-flush.processor.js', () => ({
  DingTalkTriggerFlushProcessor: class DingTalkTriggerFlushProcessor {}
}))
jest.mock('./views/dingtalk-integration-view.provider.js', () => ({
  DingTalkIntegrationViewProvider: class DingTalkIntegrationViewProvider {}
}))
jest.mock('./tokens.js', () => ({
  DINGTALK_TRIGGER_STRATEGY: 'DINGTALK_TRIGGER_STRATEGY'
}))

import { IntegrationDingTalkPlugin } from './integration-dingtalk.module.js'

describe('IntegrationDingTalkPlugin', () => {
  it('ensures conversation binding schema on plugin bootstrap', async () => {
    const longConnection = {
      disconnectAll: jest.fn().mockResolvedValue(undefined)
    }
    const conversation = {
      closeQueues: jest.fn().mockResolvedValue(undefined)
    }
    const conversationBindingSchema = {
      ensureSchema: jest.fn().mockResolvedValue(undefined)
    }
    const plugin = new (IntegrationDingTalkPlugin as any)(longConnection, conversation, conversationBindingSchema)

    await plugin.onPluginBootstrap()

    expect(conversationBindingSchema.ensureSchema).toHaveBeenCalledTimes(1)
  })
})
