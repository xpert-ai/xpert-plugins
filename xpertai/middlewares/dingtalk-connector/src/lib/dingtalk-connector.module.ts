import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ConfigModule } from '@nestjs/config'
import { DingTalkConnectorApiClient } from './api/dingtalk-connector-api.client.js'
import { DingTalkConnectorRuntimeMiddleware } from './middlewares/dingtalk-connector-runtime.middleware.js'
import { DingTalkConnectorIntegrationStrategy } from './dingtalk-connector-integration.strategy.js'
import { DingTalkConnectorSecretService } from './dingtalk-connector-secret.service.js'
import { DingTalkConnectorStrategy } from './dingtalk-connector.strategy.js'
import { DingTalkConfirmationStore } from './tools/confirmation-store.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [
    DingTalkConnectorSecretService,
    DingTalkConnectorApiClient,
    DingTalkConfirmationStore,
    DingTalkConnectorIntegrationStrategy,
    DingTalkConnectorStrategy,
    DingTalkConnectorRuntimeMiddleware
  ]
})
export class DingTalkConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  constructor(
    private readonly api: DingTalkConnectorApiClient,
    private readonly confirmations: DingTalkConfirmationStore
  ) {}

  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    this.api.clear()
    this.confirmations.clear()
  }
}
