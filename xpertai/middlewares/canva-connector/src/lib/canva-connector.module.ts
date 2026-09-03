import { IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { CanvaConnectIntegrationStrategy } from './canva-connect-integration.strategy.js'
import { CanvaConnectorStrategy } from './canva-connector.strategy.js'
import { CanvaDesignService } from './canva-design.service.js'
import { CanvaConnectorRuntimeMiddleware } from './middlewares/canva-connector-runtime.middleware.js'
import { CanvaMcpIntegrationStrategy } from './canva-mcp-integration.strategy.js'
import { CanvaConnectClient } from './connect/canva-connect.client.js'
import { CanvaMcpClient } from './mcp/canva-mcp.client.js'
import { CanvaOAuthClient } from './oauth/canva-oauth.client.js'
import { CanvaConfirmationStore } from './tools/confirmation-store.js'

@XpertServerPlugin({
  imports: [],
  providers: [CanvaMcpIntegrationStrategy, CanvaConnectIntegrationStrategy, CanvaOAuthClient, CanvaMcpClient, CanvaConnectClient, CanvaDesignService, CanvaConfirmationStore, CanvaConnectorStrategy, CanvaConnectorRuntimeMiddleware]
})
export class CanvaConnectorPluginModule implements IOnPluginDestroy {
  constructor(private readonly mcp: CanvaMcpClient, private readonly confirmations: CanvaConfirmationStore) {}
  async onPluginDestroy() { this.confirmations.clear(); await this.mcp.closeAll() }
}
