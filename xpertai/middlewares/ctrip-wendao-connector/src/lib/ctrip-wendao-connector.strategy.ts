import { Injectable } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk'
import { CTRIP_WENDAO_ICON } from './branding.js'
import { CtripWendaoClient } from './ctrip-wendao.client.js'
import {
  CTRIP_WENDAO_AUTH_METHOD_ID,
  CTRIP_WENDAO_CONNECTOR_PROVIDER,
  CTRIP_WENDAO_HELP_URL,
  CTRIP_WENDAO_RUNTIME_MIDDLEWARE_NAME
} from './constants.js'
import { createCtripWendaoCredential } from './credential.js'
import { CtripWendaoError } from './errors.js'
import type { CtripWendaoCredential } from './types.js'

@Injectable()
@ConnectorStrategyKey(CTRIP_WENDAO_CONNECTOR_PROVIDER)
export class CtripWendaoConnectorStrategy implements ConnectorMultiAuthStrategy {
  constructor(private readonly client: CtripWendaoClient) {}

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: CTRIP_WENDAO_CONNECTOR_PROVIDER,
    label: {
      en_US: 'Ctrip Wendao',
      zh_Hans: '携程问道'
    },
    description: {
      en_US: 'Use a Ctrip Wendao API Token for travel information, recommendations, and itinerary planning.',
      zh_Hans: '使用携程问道 API Token 查询旅行信息、获取推荐并规划行程。'
    },
    icon: CTRIP_WENDAO_ICON,
    authMethods: [
      {
        id: CTRIP_WENDAO_AUTH_METHOD_ID,
        type: 'api_key',
        label: {
          en_US: 'API Token',
          zh_Hans: 'API Token'
        },
        credentials: {
          fields: [
            {
              name: 'apiToken',
              label: { en_US: 'API Token', zh_Hans: 'API Token' },
              type: 'password',
              required: true,
              secret: true,
              placeholder: {
                en_US: 'Enter the API Token issued by Ctrip Wendao',
                zh_Hans: '输入从携程问道开放平台获取的 API Token'
              },
              description: {
                en_US: 'Create and copy the token from the Ctrip Wendao OpenClaw portal.',
                zh_Hans: '在携程问道开放平台申请并复制 API Token。'
              }
            }
          ],
          help: {
            label: {
              en_US: 'Apply for a token on Ctrip Wendao',
              zh_Hans: '去携程问道开放平台申请 Token'
            },
            url: CTRIP_WENDAO_HELP_URL
          }
        }
      }
    ],
    permissions: [
      {
        key: 'ctrip_wendao.travel_query',
        label: {
          en_US: 'Query Ctrip Wendao travel information',
          zh_Hans: '查询携程问道旅行信息'
        },
        description: {
          en_US: 'The API Token is encrypted by Xpert and resolved only while the connector tool runs.',
          zh_Hans: 'API Token 由 Xpert 加密保存，仅在连接器工具运行期间解析。'
        },
        identity: 'user',
        scopes: ['travel.query'],
        credential: 'api_key',
        storage: 'platform_vault',
        required: true
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    assertAuthMethod(input.authMethodId)
    const credential = createCtripWendaoCredential(input.values?.apiToken)
    await this.client.validateCredential(credential.apiToken)

    return {
      status: 'active',
      credential: {
        data: credential,
        scopes: ['travel.query'],
        profile: {
          name: 'Ctrip Wendao',
          runtimeMiddleware: CTRIP_WENDAO_RUNTIME_MIDDLEWARE_NAME
        }
      }
    }
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput): CtripWendaoCredential {
    assertAuthMethod(input.authMethodId)
    return createCtripWendaoCredential(input.credential.data.apiToken)
  }
}

function assertAuthMethod(authMethodId: string): void {
  if (authMethodId !== CTRIP_WENDAO_AUTH_METHOD_ID) {
    throw new CtripWendaoError(
      'WENDAO_AUTH_INVALID',
      `Unsupported Ctrip Wendao authentication method '${authMethodId}'.`
    )
  }
}
