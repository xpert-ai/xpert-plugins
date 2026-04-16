import type { JsonSchemaObjectType } from '@metad/contracts'
import type { ISchemaSecretField } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'

const RequiredStringSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1)
)

const OptionalUrlSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  },
  z.string().url().optional()
)

export const LarkIdentityPluginConfigSchema = z.object({
  appId: RequiredStringSchema,
  appSecret: RequiredStringSchema,
  publicBaseUrl: OptionalUrlSchema
})

export type LarkIdentityPluginConfig = z.infer<typeof LarkIdentityPluginConfigSchema>

export const LarkIdentityPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    appId: {
      type: 'string',
      title: {
        en_US: 'App ID',
        zh_Hans: '应用 ID'
      },
      description: {
        en_US: 'Feishu app id used only by the identity plugin.',
        zh_Hans: '仅供身份插件使用的飞书应用 ID。'
      } as any
    },
    appSecret: {
      type: 'string',
      title: {
        en_US: 'App Secret',
        zh_Hans: '应用密钥'
      },
      description: {
        en_US: 'Feishu app secret used for OAuth and JWT state signing.',
        zh_Hans: '用于 OAuth 和 JWT state 签名的飞书应用密钥。'
      },
      'x-ui': <ISchemaSecretField>{
        component: 'secretInput',
        revealable: true,
        maskSymbol: '*',
        persist: true
      }
    },
    publicBaseUrl: {
      type: 'string',
      title: {
        en_US: 'Public Base URL',
        zh_Hans: '公开访问地址'
      },
      description: {
        en_US:
          'Optional public base URL used for callback generation and same-origin absolute returnTo validation.',
        zh_Hans: '可选的公开访问地址，用于生成回调地址并校验同源的绝对 returnTo。'
      }
    }
  },
  required: ['appId', 'appSecret']
}
