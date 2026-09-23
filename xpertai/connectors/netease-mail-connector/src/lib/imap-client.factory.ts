import { Injectable } from '@nestjs/common'
import { ImapFlow } from 'imapflow'
import {
  NETEASE_MAIL_CLIENT_INFO,
  NETEASE_MAIL_CONNECTION_TIMEOUT_MS,
  NETEASE_MAIL_MAX_ATTACHMENT_BYTES,
  NETEASE_MAIL_SOCKET_TIMEOUT_MS
} from './constants.js'
import { resolveNeteaseMailPreset } from './server-presets.js'
import type { NeteaseMailCredential } from './types.js'

@Injectable()
export class ImapClientFactory {
  create(credential: NeteaseMailCredential): ImapFlow {
    const preset = resolveNeteaseMailPreset(credential.providerPreset)
    const client = new ImapFlow({
      host: preset.imap.host,
      port: preset.imap.port,
      secure: true,
      auth: {
        user: credential.email,
        pass: credential.authorizationCode,
        loginMethod: 'AUTH=LOGIN'
      },
      tls: {
        rejectUnauthorized: true,
        servername: preset.imap.host
      },
      clientInfo: NETEASE_MAIL_CLIENT_INFO,
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: NETEASE_MAIL_CONNECTION_TIMEOUT_MS,
      greetingTimeout: NETEASE_MAIL_CONNECTION_TIMEOUT_MS,
      socketTimeout: NETEASE_MAIL_SOCKET_TIMEOUT_MS,
      maxLineLength: 1024 * 1024,
      maxLiteralSize: NETEASE_MAIL_MAX_ATTACHMENT_BYTES + 1024 * 1024,
      maxResponseSize: NETEASE_MAIL_MAX_ATTACHMENT_BYTES + 2 * 1024 * 1024
    })

    // ImapFlow reports operation failures through rejected promises as well as this event.
    client.on('error', () => undefined)
    return client
  }
}
