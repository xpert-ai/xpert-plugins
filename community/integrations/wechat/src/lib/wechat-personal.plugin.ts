import { PluginWebhookAuthGuard, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule } from '@nestjs/core'
import { BullModule } from '@nestjs/bullmq'
import { WechatPersonalController } from './wechat-personal.controller.js'
import { WechatPersonalConversationService } from './conversation.service.js'
import { WechatPersonalClient } from './wechat-personal.client.js'
import {
  WECHAT_PERSONAL_INBOUND_QUEUE_NAME,
  WECHAT_PERSONAL_INBOUND_QUEUE_PREFIX,
  WECHAT_PERSONAL_OUTBOUND_QUEUE_NAME,
  WECHAT_PERSONAL_OUTBOUND_QUEUE_PREFIX
} from './constants.js'
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
import { getWechatPersonalBullMqConnection } from './wechat-personal-redis.js'
import { WechatPersonalOutboundQueueService } from './wechat-personal-outbound-queue.service.js'
import { WechatPersonalOutboundQueueProcessor } from './wechat-personal-outbound-queue.processor.js'
import {
  WechatPersonalInboundQueueProcessor,
  WechatPersonalTriggerAggregationService,
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
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature(entities),
    BullModule.forRoot({
      connection: getWechatPersonalBullMqConnection()
    }),
    BullModule.registerQueue({
      name: WECHAT_PERSONAL_OUTBOUND_QUEUE_NAME,
      prefix: WECHAT_PERSONAL_OUTBOUND_QUEUE_PREFIX,
      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 5000
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 5000
        }
      }
    }),
    BullModule.registerQueue({
      name: WECHAT_PERSONAL_INBOUND_QUEUE_NAME,
      prefix: WECHAT_PERSONAL_INBOUND_QUEUE_PREFIX,
      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 5000
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 5000
        }
      }
    })
  ],
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
    WechatPersonalInboundQueueProcessor,
    WechatPersonalChatDispatchService,
    WechatPersonalChatRunStateService,
    WechatPersonalChatCallbackProcessor,
    WechatPersonalOutboundQueueService,
    WechatPersonalOutboundQueueProcessor,
    WechatPersonalRuntimeMiddleware,
    WechatPersonalViewProvider,
    PluginWebhookAuthGuard
  ],
  controllers: [WechatPersonalController],
  exports: [
    WechatPersonalTunnelBrokerService,
    WechatPersonalWebsocketTunnelService,
    WechatPersonalClient,
    WechatPersonalChannelStrategy,
    WechatPersonalIntegrationStrategy,
    WechatPersonalTriggerStrategy,
    WechatPersonalOutboundQueueService,
    WechatPersonalConversationService,
    WechatPersonalRuntimeMiddleware,
    WechatPersonalViewProvider
  ]
})
export class WechatPersonalPlugin {}
