import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

export const SqlReviewPluginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxSqlLength: z.number().int().min(1000).max(100_000).default(100_000)
})

export const SqlReviewPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: { en_US: 'Enabled', zh_Hans: '启用' },
      default: true
    },
    maxSqlLength: {
      type: 'number',
      title: { en_US: 'Max SQL length', zh_Hans: 'SQL 最大长度' },
      minimum: 1000,
      maximum: 100000,
      default: 100000
    }
  }
}

export function readSqlReviewPluginEnvDefaults() {
  const raw = Number(process.env['SQL_REVIEW_MAX_SQL_LENGTH'])
  return {
    enabled: process.env['SQL_REVIEW_ENABLED'] !== 'false',
    maxSqlLength: Number.isInteger(raw) && raw >= 1000 ? raw : 100_000
  }
}
