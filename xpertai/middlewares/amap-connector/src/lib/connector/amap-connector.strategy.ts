import { Buffer } from 'node:buffer'
import { Injectable } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk'
import { AMAP_ICON } from '../branding.js'
import { AmapWebServiceClient } from '../client/amap-webservice.client.js'
import type { AmapRuntimeCredential } from '../client/types.js'
import {
  AMAP_AUTH_METHOD_ID,
  AMAP_CONNECTOR_PROVIDER,
  AMAP_KEY_HELP_URL,
  AMAP_RUNTIME_MIDDLEWARE_NAME
} from '../constants.js'
import { AmapConnectorError } from '../errors.js'

@Injectable()
@ConnectorStrategyKey(AMAP_CONNECTOR_PROVIDER)
export class AmapConnectorStrategy implements ConnectorMultiAuthStrategy {
  constructor(private readonly client: AmapWebServiceClient) {}

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: AMAP_CONNECTOR_PROVIDER,
    label: { en_US: 'AMap', zh_Hans: '高德地图' },
    description: {
      en_US: 'Connect the official AMap Web Service API for geocoding, place search, routes, distance, weather, and IP location.',
      zh_Hans: '连接高德开放平台 Web 服务 API，提供地址解析、地点搜索、路线规划、距离、天气和 IP 定位。'
    },
    icon: AMAP_ICON,
    authMethods: [
      {
        id: AMAP_AUTH_METHOD_ID,
        type: 'api_key',
        label: { en_US: 'AMap Web Service Key', zh_Hans: '高德地图 Web 服务 Key' },
        credentials: {
          fields: [
            {
              name: 'apiKey',
              label: { en_US: 'Key', zh_Hans: 'Key' },
              type: 'password',
              required: true,
              secret: true,
              placeholder: { en_US: 'Enter the Web Service Key', zh_Hans: '请输入 Web 服务 Key' },
              description: {
                en_US: 'A Key created for the Web Service platform. Xpert encrypts it in the platform vault.',
                zh_Hans: '应用中创建的 Web 服务 Key，由 Xpert 平台凭据库加密保存。'
              }
            },
            {
              name: 'privateKey',
              label: { en_US: 'Digital signature private key (optional)', zh_Hans: '数字签名私钥（可选）' },
              type: 'password',
              required: false,
              secret: true,
              placeholder: { en_US: 'Only required when signature verification is enabled', zh_Hans: '仅开启数字签名校验时填写' },
              description: {
                en_US: 'The private key configured for AMap digital signature verification. It is never returned by tools.',
                zh_Hans: '高德控制台数字签名校验对应的私钥，工具不会返回该值。'
              }
            }
          ],
          help: {
            label: { en_US: 'Create an AMap Web Service Key', zh_Hans: '如何获取高德地图 Web 服务 Key' },
            url: AMAP_KEY_HELP_URL
          }
        }
      }
    ],
    permissions: [
      {
        key: 'amap.location_read',
        label: { en_US: 'Use AMap location services', zh_Hans: '使用高德地图位置服务' },
        description: {
          en_US: 'Credentials are resolved only while read-only AMap tools are running.',
          zh_Hans: '凭据仅在执行只读高德地图工具时解析使用。'
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
    const credential = readCredential(input.values)
    await this.client.verifyCredential(credential)
    return {
      status: 'active',
      credential: {
        data: credential,
        scopes: ['map.read'],
        profile: {
          name: 'AMap',
          runtimeMiddleware: AMAP_RUNTIME_MIDDLEWARE_NAME
        }
      }
    }
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput): AmapRuntimeCredential {
    assertAuthMethod(input.authMethodId)
    return readCredential(input.credential.data)
  }
}

function assertAuthMethod(authMethodId: string): void {
  if (authMethodId !== AMAP_AUTH_METHOD_ID) {
    throw new AmapConnectorError('CONFIGURATION_INVALID', `Unsupported AMap authentication method '${authMethodId}'.`)
  }
}

function readCredential(values: Record<string, unknown> | undefined): AmapRuntimeCredential {
  const apiKey = readRequiredSecret(values?.apiKey, 'AMap Web Service Key')
  const privateKey = readOptionalSecret(values?.privateKey, 'AMap digital signature private key')
  return { apiKey, ...(privateKey ? { privateKey } : {}) }
}

function readRequiredSecret(value: unknown, label: string): string {
  const secret = readSecret(value)
  if (!secret) throw invalidSecret(label)
  return secret
}

function readOptionalSecret(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const secret = readSecret(value)
  if (!secret) throw invalidSecret(label)
  return secret
}

function readSecret(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const secret = value.trim()
  if (
    Buffer.byteLength(secret, 'utf8') < 8 ||
    Buffer.byteLength(secret, 'utf8') > 256 ||
    /\s/.test(secret) ||
    hasControlCharacter(secret)
  ) return undefined
  return secret
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 31 || codePoint === 127) return true
  }
  return false
}

function invalidSecret(label: string): AmapConnectorError {
  return new AmapConnectorError('CONFIGURATION_INVALID', `${label} must contain 8-256 non-whitespace UTF-8 bytes.`)
}
