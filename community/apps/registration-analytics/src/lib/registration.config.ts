import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

export const RegistrationPluginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  seedDemoData: z.boolean().default(true),
  defaultPageSize: z.number().int().min(5).max(100).default(25)
})

export const RegistrationPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: { en_US: 'Enabled', zh_Hans: '启用' },
      default: true
    },
    seedDemoData: {
      type: 'boolean',
      title: { en_US: 'Seed demo data', zh_Hans: '初始化演示数据' },
      default: true
    },
    defaultPageSize: {
      type: 'number',
      title: { en_US: 'Default page size', zh_Hans: '默认分页大小' },
      minimum: 5,
      maximum: 100,
      default: 25
    }
  }
}

export function readRegistrationPluginEnvDefaults() {
  const rawPageSize = Number(process.env['REGISTRATION_DEFAULT_PAGE_SIZE'])
  return {
    enabled: process.env['REGISTRATION_ENABLED'] !== 'false',
    seedDemoData: process.env['REGISTRATION_SEED_DEMO_DATA'] !== 'false',
    defaultPageSize: Number.isInteger(rawPageSize) && rawPageSize >= 5 && rawPageSize <= 100 ? rawPageSize : 25
  }
}
