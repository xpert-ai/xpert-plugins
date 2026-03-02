import chalk from 'chalk'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'

import { DingTalkChannelStrategy } from './dingtalk-channel.strategy.js'
import { DingTalkIntegrationStrategy } from './dingtalk-integration.strategy.js'
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

@XpertServerPlugin({
  imports: [DiscoveryModule, CqrsModule, TypeOrmModule.forFeature([DingTalkConversationBindingEntity, DingTalkTriggerBindingEntity])],
  entities: [DingTalkConversationBindingEntity, DingTalkTriggerBindingEntity],
  controllers: [DingTalkHooksController],
  providers: [
    DingTalkConversationService,
    DingTalkChannelStrategy,
    DingTalkIntegrationStrategy,
    DingTalkTriggerStrategy,
    DingTalkChatDispatchService,
    DingTalkChatRunStateService,
    DingTalkChatStreamCallbackProcessor,
    DingTalkTokenStrategy,
    DingTalkNotifyMiddleware,
    ...Handlers
  ],
  exports: [
    DingTalkChannelStrategy,
    DingTalkIntegrationStrategy,
    DingTalkTriggerStrategy,
    DingTalkChatDispatchService,
    DingTalkNotifyMiddleware
  ]
})
export class IntegrationDingTalkPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${IntegrationDingTalkPlugin.name} is being bootstrapped...`))
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(chalk.green(`${IntegrationDingTalkPlugin.name} is being destroyed...`))
    }
  }
}
