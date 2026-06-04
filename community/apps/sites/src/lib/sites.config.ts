import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

export const SitesPluginConfigSchema = z.object({
  defaultAccessMode: z.enum(['admins_only', 'workspace_all', 'custom']).optional()
})

export type SitesPluginConfig = z.infer<typeof SitesPluginConfigSchema>

export function readSitesPluginEnvDefaults(): SitesPluginConfig {
  return {}
}

export const SitesPluginConfigFormSchema = {
  type: 'object',
  properties: {
    defaultAccessMode: {
      type: 'string',
      title: text('Default Access Mode', '默认访问模式'),
      enum: ['admins_only', 'workspace_all', 'custom']
    }
  }
} satisfies JsonSchemaObjectType
