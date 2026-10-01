import { Injectable } from '@nestjs/common'
import * as nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { QQ_MAIL_PROTOCOL_CONNECTION_TIMEOUT_MS, QQ_MAIL_PROTOCOL_SOCKET_TIMEOUT_MS } from '../constants.js'
import type { QqMailProtocolCredential } from './types.js'

export type QqMailProtocolSmtpTransport = nodemailer.Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>

@Injectable()
export class SmtpClientFactory {
  create(credential: QqMailProtocolCredential): QqMailProtocolSmtpTransport {
    return nodemailer.createTransport({
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      auth: {
        user: credential.email,
        pass: credential.authorizationCode
      },
      tls: {
        rejectUnauthorized: true,
        servername: 'smtp.qq.com'
      },
      connectionTimeout: QQ_MAIL_PROTOCOL_CONNECTION_TIMEOUT_MS,
      greetingTimeout: QQ_MAIL_PROTOCOL_CONNECTION_TIMEOUT_MS,
      socketTimeout: QQ_MAIL_PROTOCOL_SOCKET_TIMEOUT_MS,
      disableFileAccess: true,
      disableUrlAccess: true
    })
  }
}
