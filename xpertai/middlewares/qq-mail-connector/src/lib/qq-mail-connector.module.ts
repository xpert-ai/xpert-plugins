import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { QqMailConnectorRuntimeMiddleware } from './middlewares/qq-mail-connector-runtime.middleware.js'
import { QqMailMcpClient } from './mcp/qq-mail-mcp.client.js'
import { QqMailOAuthClient } from './oauth/qq-mail-oauth.client.js'
import { ImapClientFactory } from './protocol/imap-client.factory.js'
import { MailReferenceService } from './protocol/mail-reference.service.js'
import { QqMailProtocolService } from './protocol/qq-mail-protocol.service.js'
import { SmtpClientFactory } from './protocol/smtp-client.factory.js'
import { QqMailConnectorStrategy } from './qq-mail-connector.strategy.js'
import { QqMailIntegrationStrategy } from './qq-mail-integration.strategy.js'
import { QqMailConfirmationStore } from './tools/confirmation-store.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    QqMailOAuthClient,
    QqMailMcpClient,
    ImapClientFactory,
    SmtpClientFactory,
    MailReferenceService,
    QqMailProtocolService,
    QqMailConfirmationStore,
    QqMailIntegrationStrategy,
    QqMailConnectorStrategy,
    QqMailConnectorRuntimeMiddleware
  ]
})
export class QqMailConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  constructor(private readonly mcp: QqMailMcpClient, private readonly confirmations: QqMailConfirmationStore) {}

  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  async onPluginDestroy() {
    this.confirmations.clear()
    await this.mcp.closeAll()
  }
}
