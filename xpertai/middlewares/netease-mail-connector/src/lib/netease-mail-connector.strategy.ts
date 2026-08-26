import { Injectable } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk'
import {
  NETEASE_MAIL_AUTH_METHOD_ID,
  NETEASE_MAIL_CONNECTOR_PROVIDER,
  NETEASE_MAIL_RUNTIME_MIDDLEWARE_NAME
} from './constants.js'
import { NeteaseMailError } from './errors.js'
import { NETEASE_MAIL_ICON } from './branding.js'
import { NeteaseMailService } from './netease-mail.service.js'
import {
  createNeteaseMailCredential,
  readRequiredCredentialString,
  resolveNeteaseMailPreset
} from './server-presets.js'

const NETEASE_MAIL_AUTH_HELP_URL =
  'https://help.mail.126.com/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171305fa1ce630d7f67ac2a5feb28b66796d3b'

@Injectable()
@ConnectorStrategyKey(NETEASE_MAIL_CONNECTOR_PROVIDER)
export class NeteaseMailConnectorStrategy implements ConnectorMultiAuthStrategy {
  constructor(private readonly mailService: NeteaseMailService) {}

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: NETEASE_MAIL_CONNECTOR_PROVIDER,
    label: {
      en_US: 'NetEase Mail',
      zh_Hans: '网易邮箱'
    },
    description: {
      en_US: 'Connect 163, 126, or yeah.net mail with an IMAP/SMTP client authorization code.',
      zh_Hans: '使用 IMAP/SMTP 客户端授权码连接 163、126 或 yeah.net 邮箱。'
    },
    icon: NETEASE_MAIL_ICON,
    authMethods: [
      {
        id: NETEASE_MAIL_AUTH_METHOD_ID,
        type: 'api_key',
        label: {
          en_US: 'Mailbox authorization code',
          zh_Hans: '邮箱授权码'
        },
        credentials: {
          fields: [
            {
              name: 'email',
              label: { en_US: 'Mailbox address', zh_Hans: '邮箱地址' },
              type: 'text',
              required: true,
              placeholder: { en_US: 'yourname@163.com', zh_Hans: 'yourname@163.com' },
              description: {
                en_US: 'Full 163.com, 126.com, or yeah.net mailbox address.',
                zh_Hans: '完整的 163.com、126.com 或 yeah.net 邮箱地址。'
              }
            },
            {
              name: 'authorizationCode',
              label: { en_US: 'IMAP/SMTP authorization code', zh_Hans: 'IMAP/SMTP 授权码' },
              type: 'password',
              required: true,
              secret: true,
              placeholder: { en_US: 'Client authorization code', zh_Hans: '邮箱设置中生成的客户端授权码' },
              description: {
                en_US: 'Use the client authorization code generated after enabling IMAP/SMTP, not the login password.',
                zh_Hans: '请填写开启 IMAP/SMTP 后生成的客户端授权码，不是邮箱登录密码。'
              }
            }
          ],
          help: {
            label: {
              en_US: 'Enable IMAP/SMTP and create an authorization code',
              zh_Hans: '如何开启 IMAP/SMTP 并获取授权码'
            },
            url: NETEASE_MAIL_AUTH_HELP_URL
          }
        }
      }
    ],
    permissions: [
      {
        key: 'netease_mail.mailbox_access',
        label: {
          en_US: 'Read and send NetEase Mail',
          zh_Hans: '读取和发送网易邮件'
        },
        description: {
          en_US:
            'The client authorization code is encrypted by the platform and resolved only during connector tool calls.',
          zh_Hans: '客户端授权码由平台加密保存，仅在连接器工具调用期间解析。'
        },
        identity: 'user',
        scopes: ['mail.read', 'mail.write'],
        credential: 'api_key',
        storage: 'platform_vault',
        required: true
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    assertAuthMethod(input.authMethodId)
    const email = readRequiredCredentialString(input.values?.email, 'Mailbox address')
    const authorizationCode = readRequiredCredentialString(
      input.values?.authorizationCode,
      'IMAP/SMTP authorization code'
    )
    const credential = createNeteaseMailCredential(email, authorizationCode)
    await this.mailService.verifyCredential(credential)
    const preset = resolveNeteaseMailPreset(credential.providerPreset)

    return {
      status: 'active',
      credential: {
        data: credential,
        scopes: ['mail.read', 'mail.write'],
        profile: {
          email: credential.email,
          name: credential.email,
          providerPreset: credential.providerPreset,
          providerName: preset.label,
          runtimeMiddleware: NETEASE_MAIL_RUNTIME_MIDDLEWARE_NAME
        }
      }
    }
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    assertAuthMethod(input.authMethodId)
    const email = readRequiredCredentialString(input.credential.data.email, 'Mailbox address')
    const authorizationCode = readRequiredCredentialString(
      input.credential.data.authorizationCode,
      'IMAP/SMTP authorization code'
    )
    return createNeteaseMailCredential(email, authorizationCode)
  }
}

function assertAuthMethod(authMethodId: string): void {
  if (authMethodId !== NETEASE_MAIL_AUTH_METHOD_ID) {
    throw new NeteaseMailError('MAIL_AUTH_FAILED', `Unsupported NetEase Mail authentication method '${authMethodId}'.`)
  }
}
