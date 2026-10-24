import { z } from 'zod/v3'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { JSONValue } from '@xpert-ai/contracts'

export const PROVIDER = 'file.table'
export const MAX_BYTES = 8_000_000
export const MAX_ROWS = 50_000
export const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
export const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).refine(value => !forbidden.has(value))
const segment = z.string().min(1).max(256).refine(value => !forbidden.has(value))
export const selector = z.array(segment).max(12)
export const scalar = z.union([z.string().max(4096), z.number().finite(), z.boolean(), z.null()])
const filePath = z.string().min(1).max(1024).refine(value => !value.startsWith('/') && !value.includes('\\') &&
  !value.includes('\0') && value.split('/').every(part => !!part && part !== '.' && part !== '..'))
// Source configuration is administrator-owned; neither queries nor controls contain a file locator.
export const fileSchema = z.discriminatedUnion('catalog', [
  z.object({ catalog: z.literal('xperts'), xpertId: z.string().uuid(), filePath }).strict(),
  z.object({ catalog: z.literal('user-xperts'), xpertId: z.string().uuid(), userId: z.string().uuid(), filePath }).strict(),
  z.object({ catalog: z.literal('users'), userId: z.string().uuid(), filePath }).strict(),
  z.object({ catalog: z.literal('projects'), projectId: z.string().uuid(), filePath }).strict()
])
export const readerSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('csv'), delimiter: z.enum([',', ';', '\t']).default(','), headerRow: z.number().int().min(1).max(100).default(1) }).strict(),
  z.object({ format: z.literal('json'), rowsPath: selector }).strict(),
  z.object({ format: z.literal('xlsx'), sheet: z.string().min(1).max(31), headerRow: z.number().int().min(1).max(100).default(1), formulaPolicy: z.enum(['reject', 'cached']).default('reject') }).strict()
])
export const columnSchema = z.object({
  key, path: selector.min(1), label: z.string().min(1).max(160), description: z.string().max(2000),
  logicalType: z.enum(['string', 'boolean', 'int64', 'decimal', 'float64', 'date', 'timestamp']),
  nullable: z.boolean(), role: z.enum(['dimension', 'measure', 'time', 'identifier']), unit: z.string().max(80).optional(),
  // CSV empty cells are not silently converted to null or zero.
  nullValues: z.array(z.string().max(64)).max(10).default([])
}).strict()
export const datasetSchema = z.object({
  id: key, revision: key, name: z.string().min(1).max(160), description: z.string().min(1).max(4000),
  file: fileSchema, reader: readerSchema, columns: z.array(columnSchema).min(1).max(80)
}).strict().superRefine((dataset, ctx) => {
  if (new Set(dataset.columns.map(c => c.key)).size !== dataset.columns.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate column key' })
  if (dataset.reader.format !== 'json' && dataset.columns.some(c => c.path.length !== 1))
    ctx.addIssue({ code: 'custom', message: 'CSV/XLSX column paths must contain one exact header' })
  if (Buffer.byteLength(JSON.stringify(dataset)) > 48000)
    ctx.addIssue({ code: 'custom', message: 'Dataset exceeds discovery metadata budget' })
})
export const optionsSchema = z.object({ datasets: z.array(datasetSchema).length(1) }).strict()
  .refine(value => new Set(value.datasets.map(d => d.id)).size === value.datasets.length, 'Duplicate dataset ID')
const operand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('literal'), value: scalar }).strict(),
  z.object({ type: z.literal('parameter'), name: key }).strict()
])
export const filterSchema = z.object({ column: key, operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains']),
  value: operand, skipWhenNull: z.boolean().default(false) }).strict()
export const aggregateSchema = z.object({ key, operation: z.enum(['sum', 'count', 'min', 'max']), column: key.optional() }).strict()
export const payloadSchema = z.object({
  datasetId: key, revision: key, contractHash: z.string().regex(/^[a-f0-9]{64}$/),
  select: z.array(key).min(1).max(80), filters: z.array(filterSchema).max(20).default([]),
  groupBy: z.array(key).max(12).default([]), aggregates: z.array(aggregateSchema).max(20).default([]),
  orderBy: z.array(z.object({ column: key, direction: z.enum(['asc', 'desc']) }).strict()).max(12).default([])
}).strict()
export const discoverySchema = z.object({ datasetId: key.optional(), page: z.number().int().min(1).max(5).default(1) }).strict()
export type FileDataset = z.output<typeof datasetSchema>
export type Column = z.output<typeof columnSchema>
export type FileQuery = z.output<typeof payloadSchema>
export type FileReader = z.output<typeof readerSchema>
export function jsonSchema(schema: z.ZodTypeAny): Record<string, JSONValue> {
  return JSON.parse(JSON.stringify(zodToJsonSchema(schema, { $refStrategy: 'root' })))
}
export function readPath(value: unknown, path: string[]): unknown {
  let current = value
  for (const part of path) {
    if (forbidden.has(part) || !current || typeof current !== 'object' || !Object.hasOwn(current, part))
      throw new Error('FILE_DATASET_FIELD_MISSING')
    current = Object.getOwnPropertyDescriptor(current, part)?.value
  }
  return current
}
