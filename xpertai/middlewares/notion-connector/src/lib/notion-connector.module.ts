import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { NotionConnectorRuntimeMiddleware } from './notion-connector-runtime.middleware.js'
import { NotionConnectorStrategy } from './notion-connector.strategy.js'
import { NotionOAuthClient } from './notion-oauth.client.js'
import { NotionApiClient } from './notion-api.client.js'
import { NotionRateLimiter } from './notion-rate-limiter.js'
import { NotionIntegrationStrategy } from './notion-integration.strategy.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    NotionOAuthClient,
    NotionRateLimiter,
    NotionApiClient,
    NotionIntegrationStrategy,
    NotionConnectorStrategy,
    NotionConnectorRuntimeMiddleware
  ]
})
export class NotionConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}
