import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

export const SmartMaintenancePluginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  similarLookbackDays: z.number().int().min(1).max(30).default(7)
})

export const SmartMaintenancePluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: {
        en_US: 'Enabled',
        zh_Hans: '启用'
      },
      default: true
    },
    similarLookbackDays: {
      type: 'number',
      title: {
        en_US: 'Similar work order lookback days',
        zh_Hans: '相似工单回溯天数'
      },
      minimum: 1,
      maximum: 30,
      default: 7
    }
  }
}

export function readSmartMaintenancePluginEnvDefaults() {
  const rawLookbackDays = Number(process.env['SMART_MAINTENANCE_SIMILAR_LOOKBACK_DAYS'])
  return {
    enabled: process.env['SMART_MAINTENANCE_ENABLED'] !== 'false',
    similarLookbackDays: Number.isInteger(rawLookbackDays) && rawLookbackDays > 0 ? rawLookbackDays : 7
  }
}
