import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WeComConversationService } from './conversation.service.js'
import { WeComIntegrationStrategy } from './wecom-integration.strategy.js'
import { WeComHooksController } from './wecom.controller.js'
import { WeComTokenStrategy } from './auth/wecom-token.strategy.js'
import { Handlers } from './handoff/commands/handlers/index.js'
import { WeComChatDispatchService } from './handoff/wecom-chat-dispatch.service.js'
import { WeComChatRunStateService } from './handoff/wecom-chat-run-state.service.js'
import { WeComChatStreamCallbackProcessor } from './handoff/wecom-chat-callback.processor.js'
import { WeComNotifyMiddleware } from './middlewares/index.js'
import { WeComChannelStrategy } from './wecom-channel.strategy.js'
import { WeComTriggerBindingEntity } from './entities/wecom-trigger-binding.entity.js'
import { WeComConversationBindingEntity } from './entities/wecom-conversation-binding.entity.js'
import { WeComTriggerStrategy } from './workflow/wecom-trigger.strategy.js'
import { WeComTriggerAggregationService } from './workflow/wecom-trigger-aggregation.service.js'
import { WeComTriggerFlushProcessor } from './workflow/wecom-trigger-flush.processor.js'
import { WeComLongIntegrationStrategy } from './wecom-long-integration.strategy.js'
import { WeComLongConnectionService } from './wecom-long-connection.service.js'
import { WECOM_LONG_CONNECTION_SERVICE } from './tokens.js'
import { WeComIntegrationViewProvider } from './views/wecom-integration-view.provider.js'

@XpertServerPlugin({
  imports: [
    DiscoveryModule,
    CqrsModule,
    TypeOrmModule.forFeature([WeComConversationBindingEntity, WeComTriggerBindingEntity])
  ],
  entities: [WeComConversationBindingEntity, WeComTriggerBindingEntity],
  providers: [
    WeComConversationService,
    WeComChannelStrategy,
    WeComIntegrationStrategy,
    WeComLongIntegrationStrategy,
    WeComTriggerStrategy,
    WeComTriggerAggregationService,
    WeComTriggerFlushProcessor,
    WeComLongConnectionService,
    WeComChatDispatchService,
    WeComChatRunStateService,
    WeComChatStreamCallbackProcessor,
    WeComIntegrationViewProvider,
    WeComTokenStrategy,
    WeComNotifyMiddleware,
    {
      provide: WECOM_LONG_CONNECTION_SERVICE,
      useExisting: WeComLongConnectionService
    },
    ...Handlers
  ],
  controllers: [WeComHooksController],
  exports: [
    WeComChannelStrategy,
    WeComIntegrationStrategy,
    WeComLongIntegrationStrategy,
    WeComTriggerStrategy,
    WeComLongConnectionService,
    WeComChatDispatchService,
    WeComNotifyMiddleware
  ]
})
export class WeComPlugin {}
