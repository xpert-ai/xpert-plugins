import { Injectable } from '@nestjs/common'
import type { IIntegration } from '@xpert-ai/contracts'
import { IntegrationStrategyKey, type IntegrationStrategy, type TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { BAIDU_NETDISK_ICON } from './branding.js'
import { BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER } from './constants.js'
import { BaiduNetdiskOAuthIntegrationOptionsSchema, type BaiduNetdiskOAuthIntegrationOptions } from './plugin-config.js'

@Injectable()
@IntegrationStrategyKey(BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER)
export class BaiduNetdiskIntegrationStrategy implements IntegrationStrategy<BaiduNetdiskOAuthIntegrationOptions> {
  readonly meta = {
    name: BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER,
    label: { en_US: 'Baidu Netdisk OAuth', zh_Hans: '百度网盘 OAuth' },
    description: {
      en_US:
        'Tenant-level Baidu Netdisk OAuth application used by organization connectors. End users authorize in Baidu without entering app credentials.',
      zh_Hans: '供租户内组织连接器使用的百度网盘 OAuth 应用。用户连接时直接跳转百度授权，无需填写应用凭据。'
    },
    icon: BAIDU_NETDISK_ICON,
    helpUrl: 'https://pan.baidu.com/union/document/oauth',
    helpLabel: {
      en_US: 'Open Baidu Netdisk Open Platform OAuth documentation',
      zh_Hans: '打开百度网盘开放平台 OAuth 文档'
    },
    schema: {
      type: 'object' as const,
      properties: {
        appKey: {
          type: 'string' as const,
          title: { en_US: 'App Key', zh_Hans: 'AppKey' },
          description: {
            en_US: 'App key issued by the Baidu Netdisk Open Platform.',
            zh_Hans: '百度网盘开放平台签发的 AppKey。'
          }
        },
        secretKey: {
          type: 'string' as const,
          title: { en_US: 'Secret Key', zh_Hans: 'SecretKey' },
          description: {
            en_US: 'Secret key issued by the Baidu Netdisk Open Platform.',
            zh_Hans: '百度网盘开放平台签发的 SecretKey。'
          },
          'x-ui': { component: 'password' as const }
        },
        scopes: {
          type: 'array' as const,
          items: { type: 'string' as const },
          title: { en_US: 'OAuth scopes', zh_Hans: 'OAuth 权限范围' },
          default: ['basic', 'netdisk']
        }
      },
      required: ['appKey', 'secretKey'],
      secret: ['secretKey']
    }
  }

  async execute(
    _integration: IIntegration<BaiduNetdiskOAuthIntegrationOptions>,
    _payload: TIntegrationStrategyParams
  ): Promise<null> {
    return null
  }

  async validateConfig(
    config: BaiduNetdiskOAuthIntegrationOptions,
    integration?: IIntegration<BaiduNetdiskOAuthIntegrationOptions>
  ) {
    if (integration?.organizationId) {
      throw new Error('Baidu Netdisk OAuth System Integration must be created at tenant scope, not organization scope')
    }
    const parsed = BaiduNetdiskOAuthIntegrationOptionsSchema.parse(config)
    return {
      mode: 'oauth',
      probe: { state: 'configured', checkedAt: Date.now() },
      scopes: parsed.scopes
    }
  }
}
