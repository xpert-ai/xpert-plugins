import { PluginWebhookAuthGuard, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule } from '@nestjs/core'
import { BullModule } from '@nestjs/bullmq'
import { WechatController } from './wechat.controller.js'
import { WechatAccountManagementService } from './wechat-account-management.service.js'
import { WechatConversationService } from './conversation.service.js'
import { WechatClient } from './wechat.client.js'
import {
  WECHAT_INBOUND_QUEUE_NAME,
  WECHAT_INBOUND_QUEUE_PREFIX,
  WECHAT_OUTBOUND_QUEUE_NAME,
  WECHAT_OUTBOUND_QUEUE_PREFIX
} from './constants.js'
import { WechatTunnelBrokerService } from './wechat-tunnel-broker.service.js'
import { WechatWebsocketTunnelService } from './wechat-websocket-tunnel.service.js'
import { WechatChannelStrategy } from './wechat-channel.strategy.js'
import { WechatIntegrationStrategy } from './wechat-integration.strategy.js'
import {
  WechatAccountEntity,
  WechatMessageLogEntity,
  WechatTriggerBindingEntity
} from './entities/index.js'
import {
  WechatChatCallbackProcessor,
  WechatChatDispatchService,
  WechatChatRunStateService
} from './handoff/index.js'
import { getWechatBullMqConnection } from './wechat-redis.js'
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
  WechatMessageLogEntity
]

@XpertServerPlugin({
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature(entities),
    BullModule.forRoot({
      connection: getWechatBullMqConnection()
    }),
    BullModule.registerQueue({
      name: WECHAT_OUTBOUND_QUEUE_NAME,
      prefix: WECHAT_OUTBOUND_QUEUE_PREFIX,
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
      name: WECHAT_INBOUND_QUEUE_NAME,
      prefix: WECHAT_INBOUND_QUEUE_PREFIX,
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
