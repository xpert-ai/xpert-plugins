import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { KdocsConnectorRuntimeMiddleware } from './kdocs-connector-runtime.middleware.js'
import { KdocsConnectorStrategy } from './kdocs-connector.strategy.js'
import { KdocsSkillHubAuthClient } from './kdocs-skillhub-auth.client.js'
import { KdocsMcpClient } from './mcp/kdocs-mcp.client.js'

@XpertServerPlugin({
  imports: [],
  providers: [KdocsSkillHubAuthClient, KdocsMcpClient, KdocsConnectorStrategy, KdocsConnectorRuntimeMiddleware]
})
export class KdocsConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  constructor(private readonly mcp: KdocsMcpClient) {}

  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  async onPluginDestroy() {
    await this.mcp.closeAll()
  }
}
