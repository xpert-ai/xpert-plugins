import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { analyticsBindingObjectSchema, analyticsFieldSchema } from '@xpert-ai/plugin-sdk/analytics'
import type { JSONValue } from '@xpert-ai/contracts'

// Optional on legacy responses; schema authoring requires explicit declarations.
export const dataXpertResultColumnSchema = analyticsFieldSchema
  .omit({ id: true, sourceField: true })
  .partial()
  .extend({ key: z.string() })
  .strip()

export const dataXpertOutputSchema = analyticsBindingObjectSchema.shape.output

export function createDataXpertDatasetId(payload: JSONValue, requestedId?: string): string {
  const parsed = dataXpertOutputSchema.shape.datasetId.safeParse(requestedId)
  if (parsed.success) return parsed.data
  // Native references are not output keys. Include the query projection to separate bindings.
  return `dataset_${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
}

export function createDataXpertOutput(datasetId: string, columns: z.output<typeof dataXpertResultColumnSchema>[]) {
  if (columns.length === 0 || columns.length > 80)
    throw new Error('DATAX_RESULT_SCHEMA_UNAVAILABLE: expected 1 to 80 declared columns')
  if (new Set(columns.map(column => column.key)).size !== columns.length)
    throw new Error('DATAX_RESULT_SCHEMA_AMBIGUOUS')
  const fields = columns.map(column => {
    if (column.logicalType === undefined || column.role === undefined || column.nullable === undefined)
      throw new Error('DATAX_RESULT_SCHEMA_UNAVAILABLE')
    // Repeated semantic selectors cannot identify a column; its unique native key can.
    const semanticRef = columns.filter(item => item.semanticRef === column.semanticRef).length === 1
      ? column.semanticRef : undefined
    return {
      id: `field_${createHash('sha256').update(column.key).digest('hex')}`,
      sourceField: column.key, label: column.label ?? column.key.slice(0, 160),
      logicalType: column.logicalType, role: column.role, nullable: column.nullable,
      ...(semanticRef === undefined ? {} : { semanticRef }),
      ...(column.unit === undefined ? {} : { unit: column.unit })
    }
  })
  // Column roles do not establish row uniqueness or business aggregation grain.
  return dataXpertOutputSchema.parse({ datasetId, fields, grain: [] })
}
