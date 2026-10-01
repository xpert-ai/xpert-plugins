import { Injectable } from '@nestjs/common'
import { IntegrationStrategyKey, type IntegrationStrategy } from '@xpert-ai/plugin-sdk'
import { CANVA_ICON } from './branding.js'

export const CANVA_CONNECT_INTEGRATION_PROVIDER = 'canva-connect-global'
export type CanvaConnectIntegrationOptions = { clientId: string; clientSecret: string }

@Injectable()
@IntegrationStrategyKey(CANVA_CONNECT_INTEGRATION_PROVIDER)
export class CanvaConnectIntegrationStrategy implements IntegrationStrategy<CanvaConnectIntegrationOptions> {
  readonly meta = {
    name: CANVA_CONNECT_INTEGRATION_PROVIDER,
    label: { en_US: 'Canva Connect OAuth', zh_Hans: 'Canva Connect OAuth' },
    description: {
      en_US: 'Optional global Canva Connect REST OAuth application credentials.',
      zh_Hans: '可选的 Canva Connect 全球 REST OAuth 应用凭证。'
    },
    hidden: true,
    icon: CANVA_ICON,
    helpUrl: 'https://www.canva.com/developers/connect/',
    helpLabel: { en_US: 'Open Canva Connect developer settings', zh_Hans: '打开 Canva Connect 开发者设置' },
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
  async validateConfig(config: CanvaConnectIntegrationOptions) {
    requireValue(config?.clientId, 'Canva Connect client id is required')
    requireValue(config?.clientSecret, 'Canva Connect client secret is required')
    return { mode: 'oauth', region: 'global', probe: { state: 'configured', checkedAt: Date.now() } }
  }
}

function requireValue(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}
