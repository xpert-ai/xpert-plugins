import { Injectable } from '@nestjs/common'
import { IntegrationStrategyKey, type IntegrationStrategy } from '@xpert-ai/plugin-sdk'
import { CANVA_ICON } from './branding.js'

export const CANVA_MCP_INTEGRATION_PROVIDER = 'canva-mcp-cn'
export type CanvaMcpIntegrationOptions = { clientId: string; clientSecret: string }

@Injectable()
@IntegrationStrategyKey(CANVA_MCP_INTEGRATION_PROVIDER)
export class CanvaMcpIntegrationStrategy implements IntegrationStrategy<CanvaMcpIntegrationOptions> {
  readonly meta = {
    name: CANVA_MCP_INTEGRATION_PROVIDER,
    label: { en_US: 'Canva China MCP OAuth', zh_Hans: 'Canva 可画中国区 MCP OAuth' },
    description: {
      en_US: 'OAuth application credentials for the Canva China MCP connector.',
      zh_Hans: '用于 Canva 可画中国区 MCP 连接器的 OAuth 应用凭证。'
    },
    hidden: false,
    icon: CANVA_ICON,
    helpUrl: 'https://www.canva.cn/developers/',
    helpLabel: { en_US: 'Open Canva developer settings', zh_Hans: '打开 Canva 开发者设置' },
    schema: {
      type: 'object' as const,
      properties: {
        clientId: { type: 'string' as const, title: { en_US: 'Client ID', zh_Hans: 'Client ID' } },
        clientSecret: {
          type: 'string' as const,
          title: { en_US: 'Client Secret', zh_Hans: 'Client Secret' },
          'x-ui': { component: 'password' as const }
        }
      },
      required: ['clientId', 'clientSecret'],
      secret: ['clientSecret']
    }
  }

  async execute(): Promise<null> {
    return null
  }
  async validateConfig(config: CanvaMcpIntegrationOptions) {
    requireValue(config?.clientId, 'Canva MCP client id is required')
    requireValue(config?.clientSecret, 'Canva MCP client secret is required')
    return { mode: 'oauth', region: 'cn', probe: { state: 'configured', checkedAt: Date.now() } }
  }
}

function requireValue(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}
