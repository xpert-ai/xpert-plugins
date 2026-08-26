import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ConfigModule } from '@nestjs/config'
import { DingTalkConnectorRuntimeMiddleware } from './middlewares/dingtalk-connector-runtime.middleware.js'
import { DingTalkConnectorIntegrationStrategy } from './dingtalk-connector-integration.strategy.js'
import { DingTalkConnectorSecretService } from './dingtalk-connector-secret.service.js'
import { DingTalkConnectorStrategy } from './dingtalk-connector.strategy.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [
    DingTalkConnectorSecretService,
    DingTalkConnectorIntegrationStrategy,
    DingTalkConnectorStrategy,
    DingTalkConnectorRuntimeMiddleware
  ]
})
export class DingTalkConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}
