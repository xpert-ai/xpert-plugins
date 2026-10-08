import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

export const WpsKnowledgePluginConfigSchema = z.object({}).strict()
export type WpsKnowledgePluginConfig = z.infer<typeof WpsKnowledgePluginConfigSchema>

export const WpsKnowledgePluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {}
}
