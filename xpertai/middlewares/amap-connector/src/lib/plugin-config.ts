import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

export const AmapPluginConfigSchema = z.object({}).strict()

export const AmapPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {}
}
