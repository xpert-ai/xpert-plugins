import { Injectable } from '@nestjs/common'
import * as nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { NETEASE_MAIL_CONNECTION_TIMEOUT_MS, NETEASE_MAIL_SOCKET_TIMEOUT_MS } from './constants.js'
import { resolveNeteaseMailPreset } from './server-presets.js'
import type { NeteaseMailCredential } from './types.js'

export type NeteaseMailSmtpTransport = nodemailer.Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>

@Injectable()
export class SmtpClientFactory {
  create(credential: NeteaseMailCredential): NeteaseMailSmtpTransport {
    const preset = resolveNeteaseMailPreset(credential.providerPreset)
    return nodemailer.createTransport({
      host: preset.smtp.host,
      port: preset.smtp.port,
      secure: true,
      auth: {
        user: credential.email,
        pass: credential.authorizationCode
      },
      tls: {
        rejectUnauthorized: true,
        servername: preset.smtp.host
      },
      connectionTimeout: NETEASE_MAIL_CONNECTION_TIMEOUT_MS,
      greetingTimeout: NETEASE_MAIL_CONNECTION_TIMEOUT_MS,
      socketTimeout: NETEASE_MAIL_SOCKET_TIMEOUT_MS,
      disableFileAccess: true,
      disableUrlAccess: true
    })
  }
}
