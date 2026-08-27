import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { WeComApiClient } from './api/wecom-api.client.js'
import { WeComConfirmationStore } from './tools/confirmation-store.js'
import { WeComAuthIntegrationStrategy } from './wecom-auth-integration.strategy.js'
import { WeComConnectorRuntimeMiddleware } from './wecom-connector-runtime.middleware.js'
import { WeComConnectorStrategy } from './wecom-connector.strategy.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    WeComApiClient,
    WeComConfirmationStore,
    WeComAuthIntegrationStrategy,
    WeComConnectorStrategy,
    WeComConnectorRuntimeMiddleware
  ]
})
export class WeComConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  constructor(private readonly confirmations: WeComConfirmationStore) {}

  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    this.confirmations.clear()
  }
}
