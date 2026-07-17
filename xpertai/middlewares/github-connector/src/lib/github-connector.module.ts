import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { GitHubConnectorRuntimeMiddleware } from './github-connector-runtime.middleware.js'
import { GitHubConnectorStrategy } from './github-connector.strategy.js'

@XpertServerPlugin({
  imports: [],
  providers: [GitHubConnectorStrategy, GitHubConnectorRuntimeMiddleware]
})
export class GitHubConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}
