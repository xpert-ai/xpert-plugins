import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

export const SitesPluginConfigSchema = z.object({
  environmentEncryptionKey: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  defaultAccessMode: z.enum(['admins_only', 'workspace_all', 'custom']).optional()
})

export type SitesPluginConfig = z.infer<typeof SitesPluginConfigSchema>

export function readSitesPluginEnvDefaults(): SitesPluginConfig {
  return {}
}

export const SitesPluginConfigFormSchema = {
  type: 'object',
  properties: {
    environmentEncryptionKey: {
      type: 'string',
      title: text('Environment encryption key', '环境值加密密钥'),
      description: text('32 random bytes encoded as 64 hexadecimal characters. Keep stable while encrypted values exist.', '32 随机字节，编码为 64 位十六进制。存在加密值时需保留此密钥。'),
      'x-ui': { component: 'secretInput', revealable: false }
    },
    defaultAccessMode: {
      type: 'string',
      title: text('Default Access Mode', '默认访问模式'),
      enum: ['admins_only', 'workspace_all', 'custom']
    }
  }
} satisfies JsonSchemaObjectType
