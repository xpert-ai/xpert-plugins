import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

export const TencentMapPluginConfigSchema = z.object({}).strict()

export const TencentMapPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {}
}
