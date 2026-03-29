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
import { LarkCapabilityService } from './lark-capability.service.js'
import { LarkInboundIdentityService } from './lark-inbound-identity.service.js'
import { LarkContextToolService } from './lark-context-tool.service.js'
import { LarkConversationBindingSchemaService } from './lark-conversation-binding-schema.service.js'
import { LarkLongConnectionService } from './lark-long-connection.service.js'
import { LarkGroupMentionWindowService } from './lark-group-mention-window.service.js'
import { LarkRecipientDirectoryService } from './lark-recipient-directory.service.js'
import { LarkConversationBindingEntity } from './entities/lark-conversation-binding.entity.js'
import { LarkTriggerBindingEntity } from './entities/lark-trigger-binding.entity.js'
import {
	ChatBILarkMiddleware,
	LarkConversationContextMiddleware,
	LarkNotifyMiddleware
} from './middlewares/index.js'
import { LarkTriggerStrategy } from './workflow/lark-trigger.strategy.js'
import { LarkSourceStrategy } from './source.strategy.js'
import { LarkDocTransformerStrategy } from './transformer.strategy.js'
import { Handlers } from './handoff/commands/handlers/index.js'
import { LARK_CONVERSATION_QUEUE_SERVICE, LARK_LONG_CONNECTION_SERVICE } from './tokens.js'

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
		LarkConversationBindingSchemaService,
		LarkContextToolService,
		LarkGroupMentionWindowService,
		LarkChannelStrategy,
		LarkCapabilityService,
		LarkInboundIdentityService,
		LarkIntegrationStrategy,
		LarkTriggerStrategy,
		LarkLongConnectionService,
		LarkChatDispatchService,
		LarkChatRunStateService,
		LarkChatStreamCallbackProcessor,
		LarkRecipientDirectoryService,
		LarkTokenStrategy,
		ChatBILarkMiddleware,
		LarkConversationContextMiddleware,
		LarkNotifyMiddleware,
		LarkSourceStrategy,
		LarkDocTransformerStrategy,
		{
			provide: LARK_LONG_CONNECTION_SERVICE,
			useExisting: LarkLongConnectionService
		},
		{
			provide: LARK_CONVERSATION_QUEUE_SERVICE,
			useExisting: LarkConversationService
		},
		...Handlers
	],
	exports: [
		LarkChannelStrategy,
		LarkCapabilityService,
		LarkIntegrationStrategy,
		LarkTriggerStrategy,
		LarkLongConnectionService,
		LarkChatDispatchService,
		LarkRecipientDirectoryService,
		LarkGroupMentionWindowService,
		LarkContextToolService,
		ChatBILarkMiddleware,
		LarkConversationContextMiddleware,
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
