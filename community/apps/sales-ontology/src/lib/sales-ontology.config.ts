import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

const DEFAULT_TIMEOUT_MS = 60000

export const SalesOntologyPluginConfigSchema = z.object({
  dataXpert: z
    .object({
      apiBaseUrl: z.string().optional(),
      defaultResourceId: z.string().optional(),
      timeoutMs: z.number().int().positive().optional()
    })
    .optional()
})

export type SalesOntologyPluginConfig = z.infer<typeof SalesOntologyPluginConfigSchema>

export interface ResolvedSalesOntologyPluginConfig {
  apiBaseUrl?: string
  defaultResourceId?: string
  timeoutMs: number
}

export function readSalesOntologyPluginEnvDefaults(): SalesOntologyPluginConfig {
  return {
    dataXpert: {
      apiBaseUrl: readOptionalString(process.env['DATA_XPERT_API_BASE_URL']),
      defaultResourceId: readOptionalString(process.env['SALES_ONTOLOGY_RESOURCE_ID']),
      timeoutMs: readOptionalNumber(process.env['SALES_ONTOLOGY_DATA_XPERT_TIMEOUT_MS'])
    }
  }
}

export function resolveSalesOntologyPluginConfig(input: SalesOntologyPluginConfig | undefined): ResolvedSalesOntologyPluginConfig {
  const env = readSalesOntologyPluginEnvDefaults()
  const dataXpert = input?.dataXpert ?? {}
  return {
    apiBaseUrl: readOptionalString(dataXpert.apiBaseUrl) ?? env.dataXpert?.apiBaseUrl,
    defaultResourceId:
      readOptionalString(dataXpert.defaultResourceId) ?? env.dataXpert?.defaultResourceId ?? 'sales-ontology',
    timeoutMs: dataXpert.timeoutMs ?? env.dataXpert?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }
}

export const SalesOntologyPluginConfigFormSchema = {
  type: 'object',
  properties: {
    dataXpert: {
      type: 'object',
      title: text('data-xpert API', 'data-xpert API'),
      properties: {
        apiBaseUrl: {
          type: 'string',
          title: text('API Base URL', 'API 地址'),
          description: text('Example: http://localhost:3000 or http://localhost:3000/api', '例如：http://localhost:3000 或 http://localhost:3000/api')
        },
        defaultResourceId: {
          type: 'string',
          title: text('Default Ontology Resource', '默认本体资源'),
          description: text('Business ontology resource id used by Sales Ontology.', 'Sales Ontology 使用的业务本体资源 ID。')
        },
        timeoutMs: {
          type: 'number',
          title: text('Timeout (ms)', '超时时间（毫秒）')
        }
      }
    }
  }
} satisfies JsonSchemaObjectType

function readOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function readOptionalNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
