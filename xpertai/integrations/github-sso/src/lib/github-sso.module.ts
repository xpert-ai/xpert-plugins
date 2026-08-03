import { ConfigModule } from '@nestjs/config'
import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { GitHubOAuthClient } from './github-oauth.client.js'
import { GitHubStateService } from './github-state.service.js'
import { GitHubSsoController } from './github-sso.controller.js'
import { GitHubSsoIntegrationResolver } from './github-sso-integration.resolver.js'
import { GitHubSsoIntegrationStrategy } from './github-sso-integration.strategy.js'
import { GitHubSsoProviderStrategy } from './github-sso-provider.strategy.js'
import { GitHubSsoSecretService } from './github-sso-secret.service.js'
import { GitHubSsoService } from './github-sso.service.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  controllers: [GitHubSsoController],
  providers: [
    GitHubOAuthClient,
    GitHubStateService,
    GitHubSsoIntegrationResolver,
    GitHubSsoIntegrationStrategy,
    GitHubSsoProviderStrategy,
    GitHubSsoSecretService,
    GitHubSsoService
  ]
})
export class GitHubSsoPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}
