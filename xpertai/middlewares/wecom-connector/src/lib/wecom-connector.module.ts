import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { WeComCliBootstrapService } from './wecom-cli-bootstrap.service.js'
import { WeComConnectorRuntimeMiddleware } from './wecom-connector-runtime.middleware.js'
import { WeComConnectorStrategy } from './wecom-connector.strategy.js'

@XpertServerPlugin({
  imports: [],
  providers: [WeComCliBootstrapService, WeComConnectorStrategy, WeComConnectorRuntimeMiddleware]
})
export class WeComConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}
