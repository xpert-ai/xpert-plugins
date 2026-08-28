import { Injectable } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk'
import { TENCENT_MAP_ICON } from '../branding.js'
import { TencentMapWebServiceClient } from '../client/tencent-map-webservice.client.js'
import type { TencentMapRuntimeCredential } from '../client/types.js'
import {
  TENCENT_MAP_AUTH_METHOD_ID,
  TENCENT_MAP_CONNECTOR_PROVIDER,
  TENCENT_MAP_KEY_HELP_URL,
  TENCENT_MAP_RUNTIME_MIDDLEWARE_NAME
} from '../constants.js'
import { TencentMapConnectorError } from '../errors.js'

@Injectable()
@ConnectorStrategyKey(TENCENT_MAP_CONNECTOR_PROVIDER)
export class TencentMapConnectorStrategy implements ConnectorMultiAuthStrategy {
  constructor(private readonly client: TencentMapWebServiceClient) {}

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: TENCENT_MAP_CONNECTOR_PROVIDER,
    label: { en_US: 'Tencent Maps', zh_Hans: '腾讯地图' },
    description: {
      en_US: 'Connect Tencent LBS for geocoding, place search, route planning, distance, weather, and IP location.',
      zh_Hans: '连接腾讯位置服务，提供地址解析、地点搜索、路线规划、距离矩阵、天气和 IP 定位。'
    },
    icon: TENCENT_MAP_ICON,
    authMethods: [
      {
        id: TENCENT_MAP_AUTH_METHOD_ID,
        type: 'api_key',
        label: { en_US: 'Tencent LBS developer Key', zh_Hans: '腾讯位置服务开发者 Key' },
        credentials: {
          fields: [
            {
              name: 'apiKey',
              label: { en_US: 'Key', zh_Hans: 'Key' },
              type: 'password',
              required: true,
              secret: true,
              placeholder: { en_US: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX', zh_Hans: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX' },
              description: {
                en_US: 'A Tencent LBS Key with WebService API access. It is encrypted by the Xpert platform.',
                zh_Hans: '具有 WebService API 权限的腾讯位置服务 Key，由 Xpert 平台加密保存。'
              }
            }
          ],
          help: {
            label: { en_US: 'Create a Tencent LBS Key', zh_Hans: '如何获取腾讯位置服务 Key' },
            url: TENCENT_MAP_KEY_HELP_URL
          }
        }
      }
    ],
    permissions: [
      {
        key: 'tencent_map.location_read',
        label: { en_US: 'Use Tencent Maps location services', zh_Hans: '使用腾讯地图位置服务' },
        description: {
          en_US: 'The Key is resolved only while read-only Tencent Maps tools are running.',
          zh_Hans: 'Key 仅在执行只读腾讯地图工具时解析使用。'
        },
        identity: 'user',
        scopes: ['map.read'],
        credential: 'api_key',
        storage: 'platform_vault',
        required: true
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    assertAuthMethod(input.authMethodId)
    const apiKey = readApiKey(input.values?.apiKey)
    await this.client.verifyCredential(apiKey)
    return {
      status: 'active',
      credential: {
        data: { apiKey },
        scopes: ['map.read'],
        profile: {
          name: 'Tencent Maps',
          runtimeMiddleware: TENCENT_MAP_RUNTIME_MIDDLEWARE_NAME
        }
      }
    }
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput): TencentMapRuntimeCredential {
    assertAuthMethod(input.authMethodId)
    return { apiKey: readApiKey(input.credential.data.apiKey) }
  }
}

function assertAuthMethod(authMethodId: string): void {
  if (authMethodId !== TENCENT_MAP_AUTH_METHOD_ID) {
    throw new TencentMapConnectorError('CONFIGURATION_INVALID', `Unsupported Tencent Maps authentication method '${authMethodId}'.`)
  }
}

function readApiKey(value: unknown): string {
  if (typeof value !== 'string') throw invalidKey()
  const apiKey = value.trim()
  if (apiKey.length < 16 || apiKey.length > 128 || !/^[A-Za-z0-9-]+$/.test(apiKey)) throw invalidKey()
  return apiKey
}

function invalidKey(): TencentMapConnectorError {
  return new TencentMapConnectorError('CONFIGURATION_INVALID', 'Tencent Maps Key must be 16-128 letters, digits, or hyphens.')
}
