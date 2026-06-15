import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule } from '@nestjs/core'
import { WechatPersonalController } from './wechat-personal.controller.js'
import { WechatPersonalConversationService } from './conversation.service.js'
import { WechatPersonalClient } from './wechat-personal.client.js'
import { WechatPersonalTunnelBrokerService } from './wechat-personal-tunnel-broker.service.js'
import { WechatPersonalWebsocketTunnelService } from './wechat-personal-websocket-tunnel.service.js'
import { WechatPersonalChannelStrategy } from './wechat-personal-channel.strategy.js'
import { WechatPersonalIntegrationStrategy } from './wechat-personal-integration.strategy.js'
import {
  WechatPersonalAccountEntity,
  WechatPersonalConversationBindingEntity,
  WechatPersonalMessageLogEntity,
  WechatPersonalTriggerBindingEntity
} from './entities/index.js'
import {
  WechatPersonalChatCallbackProcessor,
  WechatPersonalChatDispatchService,
  WechatPersonalChatRunStateService
} from './handoff/index.js'
import {
  WechatPersonalTriggerAggregationService,
  WechatPersonalTriggerFlushProcessor,
  WechatPersonalTriggerStrategy
} from './workflow/index.js'
import { WechatPersonalViewProvider } from './views/wechat-personal-view.provider.js'
import { WechatPersonalRuntimeMiddleware } from './wechat-personal.middleware.js'

const entities = [
  WechatPersonalTriggerBindingEntity,
  WechatPersonalConversationBindingEntity,
  WechatPersonalAccountEntity,
  WechatPersonalMessageLogEntity
]

@XpertServerPlugin({
  imports: [DiscoveryModule, TypeOrmModule.forFeature(entities)],
  entities,
  providers: [
    WechatPersonalTunnelBrokerService,
    WechatPersonalWebsocketTunnelService,
    WechatPersonalClient,
    WechatPersonalConversationService,
    WechatPersonalChannelStrategy,
    WechatPersonalIntegrationStrategy,
    WechatPersonalTriggerStrategy,
    WechatPersonalTriggerAggregationService,
    WechatPersonalTriggerFlushProcessor,
    WechatPersonalChatDispatchService,
    WechatPersonalChatRunStateService,
    WechatPersonalChatCallbackProcessor,
    WechatPersonalRuntimeMiddleware,
    WechatPersonalViewProvider
  ],
  controllers: [WechatPersonalController],
  exports: [
    WechatPersonalTunnelBrokerService,
    WechatPersonalWebsocketTunnelService,
    WechatPersonalClient,
    WechatPersonalChannelStrategy,
    WechatPersonalIntegrationStrategy,
    WechatPersonalTriggerStrategy,
    WechatPersonalConversationService,
    WechatPersonalRuntimeMiddleware,
    WechatPersonalViewProvider
  ]
})
export class WechatPersonalPlugin {}
