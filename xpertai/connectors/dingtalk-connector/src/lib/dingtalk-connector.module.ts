import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ConfigModule } from '@nestjs/config'
import { DingTalkConnectorApiClient } from './api/dingtalk-connector-api.client.js'
import { DingTalkCliBootstrapService } from './middlewares/dingtalk-cli-bootstrap.service.js'
import { DingTalkConnectorRuntimeMiddleware } from './middlewares/dingtalk-connector-runtime.middleware.js'
import { DingTalkConnectorIntegrationStrategy } from './dingtalk-connector-integration.strategy.js'
import { DingTalkConnectorSecretService } from './dingtalk-connector-secret.service.js'
import { DingTalkConnectorStrategy } from './dingtalk-connector.strategy.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [
    DingTalkConnectorSecretService,
    DingTalkConnectorApiClient,
    DingTalkConnectorIntegrationStrategy,
    DingTalkConnectorStrategy,
    DingTalkCliBootstrapService,
    DingTalkConnectorRuntimeMiddleware
  ]
})
export class DingTalkConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  constructor(private readonly api: DingTalkConnectorApiClient) {}

  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    this.api.clear()
  }
}
