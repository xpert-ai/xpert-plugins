import { Injectable } from '@nestjs/common'
import { IntegrationStrategyKey, type IntegrationStrategy } from '@xpert-ai/plugin-sdk'
import { QQ_MAIL_ICON } from './branding.js'
import { QQ_MAIL_SYSTEM_INTEGRATION_PROVIDER } from './constants.js'
import { createQqMailProtocolCredential } from './protocol/credential.js'
import { QqMailProtocolService } from './protocol/qq-mail-protocol.service.js'

export type QqMailIntegrationOptions = {
  email: string
  authorizationCode: string
}

@Injectable()
@IntegrationStrategyKey(QQ_MAIL_SYSTEM_INTEGRATION_PROVIDER)
export class QqMailIntegrationStrategy implements IntegrationStrategy<QqMailIntegrationOptions> {
  constructor(private readonly mailService: QqMailProtocolService) {}

  readonly meta = {
    name: QQ_MAIL_SYSTEM_INTEGRATION_PROVIDER,
    label: { en_US: 'QQ Mail (IMAP/SMTP)', zh_Hans: 'QQ 邮箱（IMAP/SMTP）' },
    description: {
      en_US: 'QQ Mail mailbox credentials for receiving through IMAP and sending through SMTP.',
      zh_Hans: '用于通过 IMAP 收信、SMTP 发信的 QQ 邮箱授权码配置。'
    },
    icon: QQ_MAIL_ICON,
    helpUrl: 'https://mail.qq.com/',
    helpLabel: {
      en_US: 'Open QQ Mail to enable IMAP/SMTP and generate an authorization code',
      zh_Hans: '打开 QQ 邮箱，启用 IMAP/SMTP 并生成授权码'
    },
    schema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string' as const,
          title: { en_US: 'Full mailbox address', zh_Hans: '完整邮箱地址' },
          description: {
            en_US: 'For example, 123456@qq.com or an enabled Foxmail alias.',
            zh_Hans: '例如 123456@qq.com，或已启用的 Foxmail 别名。'
          }
        },
        authorizationCode: {
          type: 'string' as const,
          title: { en_US: '16-character authorization code', zh_Hans: '16 位授权码' },
          description: {
            en_US: 'Generated after enabling IMAP/SMTP in QQ Mail. Never enter the QQ login password.',
            zh_Hans: '在 QQ 邮箱中启用 IMAP/SMTP 后生成。不要填写 QQ 登录密码。'
          },
          'x-ui': { component: 'password' as const }
        }
      },
      required: ['email', 'authorizationCode'],
      secret: ['authorizationCode']
    }
  }

  async execute(): Promise<null> {
    return null
  }

  async validateConfig(config: QqMailIntegrationOptions) {
    const credential = createQqMailProtocolCredential(config.email, config.authorizationCode)
    await this.mailService.verifyCredential(credential)
    return {
      mode: 'imap-smtp',
      probe: { connected: true, state: 'ready', checkedAt: Date.now() },
      imap: { host: 'imap.qq.com', port: 993, secure: true },
      smtp: { host: 'smtp.qq.com', port: 465, secure: true }
    }
  }
}
