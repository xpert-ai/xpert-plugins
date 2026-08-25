import chalk from 'chalk'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'

import { DingTalkChannelStrategy } from './dingtalk-channel.strategy.js'
import { DingTalkIntegrationStrategy } from './dingtalk-integration.strategy.js'
import { DingTalkLongIntegrationStrategy } from './dingtalk-long-integration.strategy.js'
import { DingTalkLongConnectionService } from './dingtalk-long-connection.service.js'
import { DingTalkHooksController } from './dingtalk.controller.js'
import { DingTalkConversationService } from './conversation.service.js'
import { DingTalkTokenStrategy } from './auth/dingtalk-token.strategy.js'
import { DingTalkChatDispatchService } from './handoff/dingtalk-chat-dispatch.service.js'
import { DingTalkChatRunStateService } from './handoff/dingtalk-chat-run-state.service.js'
import { DingTalkChatStreamCallbackProcessor } from './handoff/dingtalk-chat-callback.processor.js'
import { DingTalkConversationBindingEntity } from './entities/dingtalk-conversation-binding.entity.js'
import { DingTalkTriggerBindingEntity } from './entities/dingtalk-trigger-binding.entity.js'
import { DingTalkNotifyMiddleware } from './middlewares/index.js'
import { Handlers } from './handoff/commands/handlers/index.js'
import { DingTalkTriggerStrategy } from './workflow/dingtalk-trigger.strategy.js'
import { DingTalkTriggerAggregationService } from './workflow/dingtalk-trigger-aggregation.service.js'
import { DingTalkTriggerFlushProcessor } from './workflow/dingtalk-trigger-flush.processor.js'
import { DingTalkIntegrationViewProvider } from './views/dingtalk-integration-view.provider.js'
import { DingTalkConversationBindingSchemaService } from './dingtalk-conversation-binding-schema.service.js'
import { DINGTALK_TRIGGER_STRATEGY } from './tokens.js'

@XpertServerPlugin({
  imports: [DiscoveryModule, CqrsModule, TypeOrmModule.forFeature([DingTalkConversationBindingEntity, DingTalkTriggerBindingEntity])],
  entities: [DingTalkConversationBindingEntity, DingTalkTriggerBindingEntity],
  controllers: [DingTalkHooksController],
  providers: [
    DingTalkConversationService,
    DingTalkConversationBindingSchemaService,
    DingTalkChannelStrategy,
    DingTalkLongConnectionService,
    DingTalkLongIntegrationStrategy,
    DingTalkIntegrationStrategy,
    DingTalkTriggerStrategy,
    DingTalkTriggerAggregationService,
    DingTalkTriggerFlushProcessor,
    {
      provide: DINGTALK_TRIGGER_STRATEGY,
      useExisting: DingTalkTriggerStrategy
    },
    DingTalkChatDispatchService,
    DingTalkChatRunStateService,
    DingTalkChatStreamCallbackProcessor,
    DingTalkIntegrationViewProvider,
    DingTalkTokenStrategy,
    DingTalkNotifyMiddleware,
    ...Handlers
  ],
  exports: [
    DingTalkChannelStrategy,
    DingTalkLongConnectionService,
    DingTalkLongIntegrationStrategy,
    DingTalkIntegrationStrategy,
    DingTalkTriggerStrategy,
    DingTalkChatDispatchService,
    DingTalkNotifyMiddleware
  ]
})
export class IntegrationDingTalkPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  constructor(
    private readonly longConnection: DingTalkLongConnectionService,
    private readonly conversation: DingTalkConversationService,
    private readonly conversationBindingSchema: DingTalkConversationBindingSchemaService
  ) {}

  async onPluginBootstrap(): Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${IntegrationDingTalkPlugin.name} is being bootstrapped...`))
    }
    await this.conversationBindingSchema.ensureSchema()
  }

  async onPluginDestroy(): Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${IntegrationDingTalkPlugin.name} is being destroyed...`))
    }
    await this.longConnection.disconnectAll()
    await this.conversation.closeQueues()
  }
}
