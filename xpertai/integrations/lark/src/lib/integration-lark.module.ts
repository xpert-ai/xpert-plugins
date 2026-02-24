import chalk from 'chalk'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'

import { LarkChannelStrategy } from './lark-channel.strategy.js'
import { LarkIntegrationStrategy } from './lark-integration.strategy.js'
import { LarkHooksController } from './lark.controller.js'
import { LarkConversationService } from './conversation.service.js'
import { LarkTokenStrategy } from './auth/lark-token.strategy.js'
import { LarkChatDispatchService } from './handoff/lark-chat-dispatch.service.js'
import { LarkChatRunStateService } from './handoff/lark-chat-run-state.service.js'
import { LarkChatStreamCallbackProcessor } from './handoff/lark-chat-callback.processor.js'
import { LarkConversationBindingEntity } from './entities/lark-conversation-binding.entity.js'
import { LarkTriggerBindingEntity } from './entities/lark-trigger-binding.entity.js'
import { ChatBILarkMiddleware, LarkNotifyMiddleware } from './middlewares/index.js'
import { LarkTriggerStrategy } from './workflow/lark-trigger.strategy.js'
import { LarkSourceStrategy } from './source.strategy.js'
import { LarkDocTransformerStrategy } from './transformer.strategy.js'
import { Handlers } from './handoff/commands/handlers/index.js'

@XpertServerPlugin({
	imports: [
		DiscoveryModule,
		CqrsModule,
		TypeOrmModule.forFeature([LarkConversationBindingEntity, LarkTriggerBindingEntity]),
	],
	entities: [LarkConversationBindingEntity, LarkTriggerBindingEntity],
	controllers: [LarkHooksController],
	providers: [
		LarkConversationService,
		LarkChannelStrategy,
		LarkIntegrationStrategy,
		LarkTriggerStrategy,
		LarkChatDispatchService,
		LarkChatRunStateService,
		LarkChatStreamCallbackProcessor,
		LarkTokenStrategy,
		ChatBILarkMiddleware,
		LarkNotifyMiddleware,
		LarkSourceStrategy,
		LarkDocTransformerStrategy,
		...Handlers
	],
	exports: [
		LarkChannelStrategy,
		LarkIntegrationStrategy,
		LarkTriggerStrategy,
		LarkChatDispatchService,
		ChatBILarkMiddleware,
		LarkNotifyMiddleware
	]
})
export class IntegrationLarkPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	private logEnabled = true

	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationLarkPlugin.name} is being bootstrapped...`))
		}
	}

	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${IntegrationLarkPlugin.name} is being destroyed...`))
		}
	}
}
