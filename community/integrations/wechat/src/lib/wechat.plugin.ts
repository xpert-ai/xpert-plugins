import { PluginWebhookAuthGuard, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule } from '@nestjs/core'
import { WechatController } from './wechat.controller.js'
import { WechatAccountManagementService } from './wechat-account-management.service.js'
import { WechatConversationService } from './conversation.service.js'
import { WechatClient } from './wechat.client.js'
import { WechatTunnelBrokerService } from './wechat-tunnel-broker.service.js'
import { WechatWebsocketTunnelService } from './wechat-websocket-tunnel.service.js'
import { WechatChannelStrategy } from './wechat-channel.strategy.js'
import { WechatIntegrationStrategy } from './wechat-integration.strategy.js'
import {
  WechatAccountEntity,
  WechatMessageFileEntity,
  WechatMessageLogEntity,
  WechatTriggerBindingEntity
} from './entities/index.js'
import {
  WechatChatCallbackProcessor,
  WechatChatDispatchService,
  WechatChatRunStateService
} from './handoff/index.js'
import { WechatOutboundQueueService } from './wechat-outbound-queue.service.js'
import { WechatOutboundQueueProcessor } from './wechat-outbound-queue.processor.js'
import {
  WechatInboundQueueProcessor,
  WechatTriggerAggregationService,
  WechatTriggerStrategy
} from './workflow/index.js'
import { WechatViewProvider } from './views/wechat-view.provider.js'
import { WechatRuntimeMiddleware } from './wechat.middleware.js'

const entities = [
  WechatTriggerBindingEntity,
  WechatAccountEntity,
  WechatMessageFileEntity,
  WechatMessageLogEntity
]

@XpertServerPlugin({
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature(entities)
  ],
  entities,
  providers: [
    WechatTunnelBrokerService,
    WechatWebsocketTunnelService,
    WechatClient,
    WechatAccountManagementService,
    WechatConversationService,
    WechatChannelStrategy,
    WechatIntegrationStrategy,
    WechatTriggerStrategy,
    WechatTriggerAggregationService,
    WechatInboundQueueProcessor,
    WechatChatDispatchService,
    WechatChatRunStateService,
    WechatChatCallbackProcessor,
    WechatOutboundQueueService,
    WechatOutboundQueueProcessor,
    WechatRuntimeMiddleware,
    WechatViewProvider,
    PluginWebhookAuthGuard
  ],
  controllers: [WechatController],
  exports: [
    WechatTunnelBrokerService,
    WechatWebsocketTunnelService,
    WechatClient,
    WechatAccountManagementService,
    WechatChannelStrategy,
    WechatIntegrationStrategy,
    WechatTriggerStrategy,
    WechatOutboundQueueService,
    WechatConversationService,
    WechatRuntimeMiddleware,
    WechatViewProvider
  ]
})
export class WechatPlugin {}
