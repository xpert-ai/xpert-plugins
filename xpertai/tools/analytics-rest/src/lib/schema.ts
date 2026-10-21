import { z } from 'zod/v3'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { JSONValue } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'

const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
export const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/).refine((value) => !forbidden.has(value))
const scalar = z.union([z.string().max(32000), z.number().finite(), z.boolean(), z.null()])
const json: z.ZodType<JSONValue> = z.lazy(() => z.union([scalar, z.array(json).max(1000), z.record(json)]))
export const path = z.array(z.string().min(1).max(256).refine((value) => !forbidden.has(value))).max(12)
export const columnSchema = z.object({
  key, path, label: z.string().min(1).max(160), description: z.string().max(2000),
  logicalType: z.enum(['string', 'boolean', 'int64', 'decimal', 'float64', 'date', 'timestamp']),
  nullable: z.boolean(), role: z.enum(['dimension', 'measure', 'time', 'identifier']),
  unit: z.string().max(80).optional(), semanticRef: z.string().min(1).max(512).optional()
}).strict()
const parameter = z.object({ in: z.enum(['query', 'body']), name: key }).strict()
const pageLimits = { pageSize: z.number().int().min(1).max(500), maxPages: z.number().int().min(1).max(10) }
export const paginationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('offset'), ...pageLimits, offset: parameter, limit: parameter, hasMorePath: path.min(1) }).strict(),
  z.object({ type: z.literal('cursor'), ...pageLimits, cursor: parameter, initialCursor: z.union([z.string().max(2000), z.null()]), limit: parameter, nextCursorPath: path.min(1) }).strict()
])
export const datasetSchema = z.object({
  id: key, revision: key, name: z.string().min(1).max(160), description: z.string().min(1).max(4000),
  operationId: z.string().min(1).max(160), readOnly: z.literal(true),
  defaultArguments: z.record(json).default({}), pagination: paginationSchema.default({ type: 'none' }),
  result: z.object({
    rowsPath: path, columns: z.array(columnSchema).min(1).max(80),
    scope: z.enum(['full_query_result', 'page']), truncatedPath: path.min(1).optional(),
    totalPath: path.min(1).optional(), dataAsOfPath: path.min(1).optional()
  }).strict()
}).strict().superRefine((dataset, ctx) => {
  if (dataset.pagination.type !== 'none') {
    const p = dataset.pagination, position = p.type === 'offset' ? p.offset : p.cursor
    if (position.in === p.limit.in && position.name === p.limit.name)
      ctx.addIssue({ code: 'custom', message: 'Pagination parameters must be distinct' })
  }
  const keys = dataset.result.columns.map((column) => column.key)
  const refs = dataset.result.columns.flatMap((column) => column.semanticRef ? [column.semanticRef] : [])
  if (new Set(keys).size !== keys.length || new Set(refs).size !== refs.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate column or semantic reference' })
  if (Buffer.byteLength(JSON.stringify(dataset)) > 48000)
    ctx.addIssue({ code: 'custom', message: 'Dataset definition exceeds discovery metadata budget' })
})

/** A separate approved catalog; connection credentials and server URLs remain platform-owned. */
export const optionsSchema = z.object({
  workspaceId: z.string().uuid(), toolsetId: z.string().uuid(),
  datasets: z.array(datasetSchema).min(1).max(100)
}).strict().refine((options) => new Set(options.datasets.map((item) => item.id)).size === options.datasets.length, 'Duplicate dataset ID')
export const payloadSchema = z.object({
  datasetId: key, revision: key, operationContractHash: z.string().regex(/^[a-f0-9]{64}$/),
  arguments: z.record(json), parameterPaths: z.record(key, path.min(1)).default({})
}).strict()
export const discoverySchema = z.object({ datasetId: key.optional(), page: z.number().int().min(1).max(5).default(1) }).strict()
export type RestDatasetDefinition = z.output<typeof datasetSchema>
export type RestPayload = z.output<typeof payloadSchema>
export type RestColumn = z.output<typeof columnSchema>

export function jsonSchema(schema: z.ZodTypeAny): Record<string, JSONValue> {
  return JSON.parse(JSON.stringify(zodToJsonSchema(schema, { $refStrategy: 'root' })))
}

/** Own-property selectors only; JSONPath expressions, prototype traversal and resource fetching are absent. */
export function readPath(value: unknown, segments: string[]): unknown {
  let current = value
  for (const segment of segments) {
    if (forbidden.has(segment) || !current || typeof current !== 'object' || !Object.hasOwn(current, segment))
      throw new Error('REST_DATASET_FIELD_MISSING')
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) throw new Error('REST_DATASET_PATH_INVALID')
      current = current[Number(segment)]
    } else current = Object.getOwnPropertyDescriptor(current, segment)?.value
  }
  return current
}

export function bindArguments(payload: RestPayload, values: Record<string, string | number | boolean | null>) {
  const paths = payload.parameterPaths
  if (Object.keys(values).some((name) => !Object.hasOwn(paths, name)) || Object.keys(paths).some((name) => !Object.hasOwn(values, name)) ||
      new Set(Object.values(paths).map((segments) => JSON.stringify(segments))).size !== Object.keys(paths).length)
    throw new Error('REST_DATASET_PARAMETER_MAPPING_INVALID')
  const result = structuredClone(payload.arguments)
  for (const [name, segments] of Object.entries(paths)) {
    let existing: unknown
    try { existing = readPath(result, segments) } catch {
      // The host preserves explicit HTTP errors; never expose REST responses or argument values.
      throw new BadRequestException({ code: 'REST_DATASET_PARAMETER_PATH_INVALID',
        message: 'REST_DATASET_PARAMETER_PATH_INVALID: parameterPaths are relative to arguments. For arguments:{query:{region:""}}, use parameterPaths:{region:["query","region"]}, not ["arguments","query","region"]. Keep the target field present with its literal default in arguments.' })
    }
    if (existing !== null && typeof existing === 'object') throw new Error('REST_DATASET_PARAMETER_NOT_SCALAR')
    const parent = readPath(result, segments.slice(0, -1))
    if (!parent || typeof parent !== 'object') throw new Error('REST_DATASET_PATH_INVALID')
    Object.defineProperty(parent, segments.at(-1)!, { value: values[name], enumerable: true, configurable: true, writable: true })
  }
  return result
}
