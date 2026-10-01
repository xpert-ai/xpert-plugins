import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { NeteaseMailConfirmationStore } from './confirmation-store.js'
import { ImapClientFactory } from './imap-client.factory.js'
import { MailReferenceService } from './mail-reference.service.js'
import { NeteaseMailConnectorStrategy } from './netease-mail-connector.strategy.js'
import { NeteaseMailRuntimeMiddleware } from './netease-mail-runtime.middleware.js'
import { NeteaseMailService } from './netease-mail.service.js'
import { SmtpClientFactory } from './smtp-client.factory.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    ImapClientFactory,
    SmtpClientFactory,
    MailReferenceService,
    NeteaseMailConfirmationStore,
    NeteaseMailService,
    NeteaseMailConnectorStrategy,
    NeteaseMailRuntimeMiddleware
  ]
})
export class NeteaseMailConnectorPluginModule {}
