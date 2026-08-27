import { Injectable } from '@nestjs/common'
import type { IIntegration } from '@xpert-ai/contracts'
import {
  IntegrationStrategyKey,
  type IntegrationStrategy,
  type TIntegrationStrategyParams
} from '@xpert-ai/plugin-sdk'
import { NOTION_ICON } from './branding.js'
import { NOTION_SYSTEM_INTEGRATION_PROVIDER } from './constants.js'

export type NotionIntegrationOptions = {
  clientId: string
  clientSecret: string
}

@Injectable()
@IntegrationStrategyKey(NOTION_SYSTEM_INTEGRATION_PROVIDER)
export class NotionIntegrationStrategy implements IntegrationStrategy<NotionIntegrationOptions> {
  readonly meta = {
    name: NOTION_SYSTEM_INTEGRATION_PROVIDER,
    label: { en_US: 'Notion Public OAuth', zh_Hans: 'Notion Public OAuth' },
    description: {
      en_US: 'Notion Public Connection credentials used to authorize organization workspace connectors.',
      zh_Hans: '用于授权组织工作区连接器的 Notion Public Connection 应用凭证。'
    },
    icon: NOTION_ICON,
    helpUrl: 'https://www.notion.so/profile/integrations',
    helpLabel: {
      en_US: 'Open Notion integrations to create or manage a Public Connection',
      zh_Hans: '打开 Notion 集成管理页面，创建或管理 Public Connection'
    },
    schema: {
      type: 'object' as const,
      properties: {
        clientId: {
          type: 'string' as const,
          title: { en_US: 'OAuth Client ID', zh_Hans: 'OAuth Client ID' },
          description: {
            en_US: 'Client ID from the Notion Public Connection settings.',
            zh_Hans: 'Notion Public Connection 设置中的 Client ID。'
          }
        },
        clientSecret: {
          type: 'string' as const,
          title: { en_US: 'OAuth Client Secret', zh_Hans: 'OAuth Client Secret' },
          description: {
            en_US: 'Client secret from the Notion Public Connection settings.',
            zh_Hans: 'Notion Public Connection 设置中的 Client Secret。'
          },
          'x-ui': { component: 'password' as const }
        }
      },
      required: ['clientId', 'clientSecret'],
      secret: ['clientSecret']
    }
  }

  async execute(
    _integration: IIntegration<NotionIntegrationOptions>,
    _payload: TIntegrationStrategyParams
  ): Promise<null> {
    return null
  }

  async validateConfig(config: NotionIntegrationOptions) {
    readRequired(config?.clientId, 'Notion OAuth Client ID is required.')
    readRequired(config?.clientSecret, 'Notion OAuth Client Secret is required.')
    return {
      mode: 'public-oauth',
      probe: { state: 'configured', checkedAt: Date.now() }
    }
  }
}

function readRequired(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}
