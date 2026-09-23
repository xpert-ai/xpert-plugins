import { Injectable } from '@nestjs/common'
import { ImapFlow } from 'imapflow'
import {
  QQ_MAIL_PROTOCOL_CLIENT_INFO,
  QQ_MAIL_PROTOCOL_CONNECTION_TIMEOUT_MS,
  QQ_MAIL_PROTOCOL_MAX_ATTACHMENT_BYTES,
  QQ_MAIL_PROTOCOL_SOCKET_TIMEOUT_MS
} from '../constants.js'
import type { QqMailProtocolCredential } from './types.js'

@Injectable()
export class ImapClientFactory {
  create(credential: QqMailProtocolCredential): ImapFlow {
    const client = new ImapFlow({
      host: 'imap.qq.com',
      port: 993,
      secure: true,
      auth: {
        user: credential.email,
        pass: credential.authorizationCode,
        loginMethod: 'AUTH=LOGIN'
      },
      tls: {
        rejectUnauthorized: true,
        servername: 'imap.qq.com'
      },
      clientInfo: QQ_MAIL_PROTOCOL_CLIENT_INFO,
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: QQ_MAIL_PROTOCOL_CONNECTION_TIMEOUT_MS,
      greetingTimeout: QQ_MAIL_PROTOCOL_CONNECTION_TIMEOUT_MS,
      socketTimeout: QQ_MAIL_PROTOCOL_SOCKET_TIMEOUT_MS,
      maxLineLength: 1024 * 1024,
      maxLiteralSize: QQ_MAIL_PROTOCOL_MAX_ATTACHMENT_BYTES + 1024 * 1024,
      maxResponseSize: QQ_MAIL_PROTOCOL_MAX_ATTACHMENT_BYTES + 2 * 1024 * 1024
    })

    // ImapFlow reports operation failures through rejected promises as well as this event.
    client.on('error', () => undefined)
    return client
  }
}
