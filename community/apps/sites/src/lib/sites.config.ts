import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

export const SitesPluginConfigSchema = z.object({
  hosting: z
    .object({
      publicBaseUrl: z.string().optional(),
      defaultAccessMode: z.enum(['admins_only', 'workspace_all', 'custom']).optional()
    })
    .optional()
})

export type SitesPluginConfig = z.infer<typeof SitesPluginConfigSchema>

export function readSitesPluginEnvDefaults(): SitesPluginConfig {
  return {
    hosting: {
      publicBaseUrl: readOptionalString(process.env['XPERT_SITES_PUBLIC_BASE_URL']),
      defaultAccessMode: readAccessMode(process.env['XPERT_SITES_DEFAULT_ACCESS_MODE'])
    }
  }
}

export const SitesPluginConfigFormSchema = {
  type: 'object',
  properties: {
    hosting: {
      type: 'object',
      title: text('Sites Hosting', 'Sites 托管'),
      properties: {
        publicBaseUrl: {
          type: 'string',
          title: text('Public Base URL', '公开访问基址'),
          description: text(
            'Example: http://localhost:3000/api/xpert-sites',
            '例如：http://localhost:3000/api/xpert-sites'
          )
        },
        defaultAccessMode: {
          type: 'string',
          title: text('Default Access Mode', '默认访问模式'),
          enum: ['admins_only', 'workspace_all', 'custom']
        }
      }
    }
  }
} satisfies JsonSchemaObjectType

function readOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function readAccessMode(value: string | undefined) {
  if (value === 'admins_only' || value === 'workspace_all' || value === 'custom') {
    return value
  }
  return undefined
}
