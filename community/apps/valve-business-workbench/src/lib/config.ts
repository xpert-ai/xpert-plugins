import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

const DEFAULT_API_BASE_URL = 'http://localhost:3001'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RESULT_LIMIT = 30

export const ValvePluginConfigSchema = z
  .object({
    enabled: z.boolean(),
    demo: z
      .object({
        enabled: z.boolean(),
        includeFallbackActions: z.boolean()
      })
      .strict(),
    dataXpert: z
      .object({
        apiBaseUrl: z.string().url(),
        rootEntityTypeCode: z.string().min(1),
        resourceIds: z.array(z.string().min(1)).optional(),
        definitionResourceId: z.string().min(1).optional(),
        timeoutMs: z.number().int().min(1_000).max(120_000),
        resultLimit: z.number().int().min(1).max(100)
      })
      .strict()
  })
  .strict()

export type ValvePluginConfig = z.infer<typeof ValvePluginConfigSchema>

export const ValvePluginConfigFormSchema = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: { en_US: 'Enabled', zh_Hans: '启用' },
      default: true
    },
    demo: {
      type: 'object',
      title: { en_US: 'Customer demo', zh_Hans: '客户演示' },
      properties: {
        enabled: {
          type: 'boolean',
          title: { en_US: 'Enable demo execution adapters', zh_Hans: '启用 Demo 执行适配器' },
          default: true
        },
        includeFallbackActions: {
          type: 'boolean',
          title: { en_US: 'Show demo actions missing from ontology', zh_Hans: '显示本体中尚未定义的 Demo Action' },
          default: true
        }
      },
      required: ['enabled', 'includeFallbackActions']
    },
    dataXpert: {
      type: 'object',
      title: { en_US: 'data-xpert', zh_Hans: 'data-xpert' },
      properties: {
        apiBaseUrl: {
          type: 'string',
          title: { en_US: 'API base URL', zh_Hans: 'API 地址' },
          default: DEFAULT_API_BASE_URL
        },
        rootEntityTypeCode: {
          type: 'string',
          title: { en_US: 'Root entity type code', zh_Hans: '根实体类型代码' },
          default: 'valve'
        },
        resourceIds: {
          type: 'array',
          title: { en_US: 'Allowed resource ids', zh_Hans: '资源白名单' },
          items: { type: 'string' }
        },
        definitionResourceId: {
          type: 'string',
          title: { en_US: 'Definition resource id', zh_Hans: '本体定义资源 ID' }
        },
        timeoutMs: {
          type: 'number',
          title: { en_US: 'Timeout (ms)', zh_Hans: '超时（毫秒）' },
          minimum: 1000,
          maximum: 120000,
          default: DEFAULT_TIMEOUT_MS
        },
        resultLimit: {
          type: 'number',
          title: { en_US: 'Result limit', zh_Hans: '结果上限' },
          minimum: 1,
          maximum: 100,
          default: DEFAULT_RESULT_LIMIT
        }
      },
      required: ['apiBaseUrl', 'rootEntityTypeCode', 'timeoutMs', 'resultLimit']
    }
  },
  required: ['enabled', 'demo', 'dataXpert']
} satisfies JsonSchemaObjectType

export function readValvePluginEnvDefaults(): ValvePluginConfig {
  const resourceIds = readString(process.env['VALVE_WORKBENCH_RESOURCE_IDS'])
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return ValvePluginConfigSchema.parse({
    enabled: process.env['VALVE_WORKBENCH_ENABLED'] !== 'false',
    demo: {
      enabled: process.env['VALVE_WORKBENCH_DEMO_ENABLED'] !== 'false',
      includeFallbackActions: process.env['VALVE_WORKBENCH_DEMO_FALLBACK_ACTIONS'] !== 'false'
    },
    dataXpert: {
      apiBaseUrl: readString(process.env['VALVE_WORKBENCH_DATA_XPERT_API_BASE_URL']) ?? DEFAULT_API_BASE_URL,
      rootEntityTypeCode: readString(process.env['VALVE_WORKBENCH_ROOT_ENTITY_TYPE_CODE']) ?? 'valve',
      resourceIds: resourceIds?.length ? resourceIds : undefined,
      definitionResourceId: readString(process.env['VALVE_WORKBENCH_DEFINITION_RESOURCE_ID']),
      timeoutMs: readNumber(process.env['VALVE_WORKBENCH_TIMEOUT_MS']) ?? DEFAULT_TIMEOUT_MS,
      resultLimit: readNumber(process.env['VALVE_WORKBENCH_RESULT_LIMIT']) ?? DEFAULT_RESULT_LIMIT
    }
  })
}

export function resolveValvePluginConfig(input?: Partial<ValvePluginConfig>): ValvePluginConfig {
  const defaults = readValvePluginEnvDefaults()
  return ValvePluginConfigSchema.parse({
    ...defaults,
    ...input,
    demo: {
      ...defaults.demo,
      ...input?.demo
    },
    dataXpert: {
      ...defaults.dataXpert,
      ...input?.dataXpert
    }
  })
}

function readString(value: string | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}

function readNumber(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
