import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { WeComAuthIntegrationStrategy } from './wecom-auth-integration.strategy.js'
import { WeComConnectorRuntimeMiddleware } from './wecom-connector-runtime.middleware.js'
import { WeComConnectorStrategy } from './wecom-connector.strategy.js'

@XpertServerPlugin({
  imports: [],
  providers: [WeComAuthIntegrationStrategy, WeComConnectorStrategy, WeComConnectorRuntimeMiddleware]
})
export class WeComConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}
