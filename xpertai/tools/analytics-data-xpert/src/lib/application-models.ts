import type { AnalyticsBinding, AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import type { DataSourceActor } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import type { DataXpertAnalyticsClient, DataXpertClientContext } from './client'
import { createDataXpertOutput, dataXpertResultColumnSchema } from './result-schema'
import { dataXpertPayloadSchema } from './payload'

export type SetupContext = {
  includeProvisioned?: boolean
  readConnectionOptions(): Promise<unknown>
  actor: DataSourceActor
  integrationId: string
  signal: AbortSignal
  deadlineAt: number
}
const recipeSchema = z
  .object({
    kind: z.literal('sql-cube-slice'),
    cube: z.string().min(1),
    dimensions: z.array(z.string()),
    measures: z.array(z.string()).min(1),
    filters: z.array(z.object({ field: z.string(), op: z.literal('eq'), value: z.string() })),
    aliases: z.record(z.string()),
    // An application can declare the SQL wire projection for servers that return only column keys.
    legacyOutputTypes: z.record(z.enum(['string', 'decimal'])).optional(),
    limit: z.number().int().min(1).max(100),
    singleRow: z.boolean()
  })
  .strict()
const cubeMeta = z.object({
  definition: z.object({
    adapterId: z.literal('semantic_model'),
    contractVersion: z.literal(1),
    metadata: z.object({ analysisContract: z.object({ cubeName: z.string() }) })
  }),
  target: dataXpertPayloadSchema.shape.target
})
const actionMeta = z.object({
  actionTypeCode: z.literal('sql.query_cube_slice'),
  target: dataXpertPayloadSchema.shape.target
})
const resourceMeta = z.object({ adapterId: z.literal('semantic_model'), entityTypes: z.array(z.string()) })

function previewColumns(
  recipe: z.output<typeof recipeSchema>,
  columns: z.output<typeof dataXpertResultColumnSchema>[],
  rows: Record<string, AnalyticsValue>[]
) {
  if (!recipe.legacyOutputTypes || columns.every((c) => c.logicalType !== undefined && c.role !== undefined && c.nullable !== undefined))
    return columns
  const declarations = new Map(Object.entries(recipe.legacyOutputTypes))
  const selectors = [...recipe.dimensions, ...recipe.measures]
  if (new Set(selectors).size !== selectors.length || selectors.length !== declarations.size ||
      selectors.length !== columns.length || selectors.some((s) => !declarations.has(s)))
    throw Error('DATAX_MODEL_RESULT_INCOMPLETE')
  return columns.map((column) => {
    const matches = selectors.filter((selector) => selector === column.key || selector === column.semanticRef)
    if (matches.length !== 1) throw Error('DATAX_MODEL_RESULT_INCOMPLETE')
    const selector = matches[0]
    const logicalType = declarations.get(selector)
    const role = column.role ?? (recipe.measures.includes(selector) ? 'measure' : 'dimension')
    if (!logicalType || (column.logicalType !== undefined && column.logicalType !== logicalType) ||
        (role === 'measure') !== recipe.measures.includes(selector))
      throw Error('DATAX_MODEL_PROJECTION_TYPE_MISMATCH')
    for (const row of rows) {
      const value = row[column.key]
      if (typeof value !== 'string' || (logicalType === 'decimal' && !/^-?\d+(\.\d+)?$/.test(value)))
        throw Error('DATAX_MODEL_PROJECTION_TYPE_MISMATCH')
    }
    return { ...column, role, logicalType, nullable: column.nullable ?? true }
  })
}

export async function listModels(client: DataXpertAnalyticsClient, ctx: DataXpertClientContext) {
  const models = new Map<string, string>()
  const seen = new Set<string>()
  let request: JSONValue | undefined = { kind: 'resources' }
  while (request) {
    const cursor = JSON.stringify(request)
    if (seen.has(cursor) || seen.size >= 100) throw Error('DATAX_MODEL_CATALOG_INCOMPLETE')
    seen.add(cursor)
    const page = await client.discover(request, ctx)
    for (const item of page.items) {
      const meta = resourceMeta.safeParse(item.metadata)
      if (item.kind === 'collection' && meta.success && meta.data.entityTypes.includes('semantic_cube'))
        models.set(item.id, item.name)
    }
    request = page.nextRequest
  }
  return Array.from(models, ([id, label]) => ({ id, label }))
}

export async function previewModel(
  client: DataXpertAnalyticsClient,
  ctx: DataXpertClientContext,
  modelId: string,
  recipes: Record<string, JSONValue>
) {
  const model = (await listModels(client, ctx)).find((item) => item.id === modelId)
  if (!model) throw Error('DATAX_MODEL_UNAVAILABLE')
  const queries = []
  for (const [key, raw] of Object.entries(recipes)) {
    const recipe = recipeSchema.parse(raw)
    const cubes = await client.discover(
      { kind: 'entities', resourceId: modelId, entityTypeCode: 'semantic_cube', query: recipe.cube },
      ctx
    )
    const matches = cubes.items.flatMap((item) => {
      const meta = cubeMeta.safeParse(item.metadata)
      return meta.success && meta.data.definition.metadata.analysisContract.cubeName === recipe.cube
        ? [meta.data.target]
        : []
    })
    if (matches.length !== 1) throw Error('DATAX_MODEL_RECIPE_UNAVAILABLE')
    const actions = await client.discover({ kind: 'actions', resourceId: modelId, target: matches[0] }, ctx)
    const action = actions.items
      .map((item) => actionMeta.safeParse(item.metadata))
      .find((result) => result.success)?.data
    if (!action) throw Error('DATAX_MODEL_RECIPE_UNAVAILABLE')
    const payload = dataXpertPayloadSchema.parse({
      resourceId: modelId,
      actionTypeCode: action.actionTypeCode,
      target: action.target,
      params: {
        dimensions: recipe.dimensions,
        measures: recipe.measures,
        filters: recipe.filters,
        limit: recipe.limit
      },
      parameterPaths: {}
    })
    const result = await client.previewApplicationQuery(key, payload, ctx)
    if (
      result.effect.summary.truncated ||
      !result.effect.rows.length ||
      result.effect.rows.length >= recipe.limit ||
      result.effect.summary.returnedRowCount !== result.effect.rows.length ||
      result.effect.summary.rowCount !== result.effect.rows.length ||
      (recipe.singleRow && result.effect.rows.length !== 1)
    )
      throw Error('DATAX_MODEL_RESULT_INCOMPLETE')
    const output = createDataXpertOutput(key, previewColumns(recipe, result.effect.columns, result.effect.rows))
    for (const [alias, selector] of Object.entries(recipe.aliases)) {
      const fields = output.fields.filter(
        (field) => field.semanticRef === selector || field.sourceField === selector
      )
      if (fields.length !== 1 || !['int64', 'decimal', 'float64'].includes(fields[0].logicalType))
        throw Error('DATAX_MODEL_REQUIRED_MEASURE')
      if (result.effect.rows.some((row) => row[fields[0].sourceField] == null))
        throw Error('DATAX_MODEL_REQUIRED_MEASURE')
      fields[0].id = alias
    }
    // A successful aggregate must contain each dimension and measure requested by the application.
    for (const selector of [...recipe.dimensions, ...recipe.measures]) {
      const columns = output.fields.filter((f) => f.semanticRef === selector || f.sourceField === selector)
      if (columns.length !== 1 || result.effect.rows.some((row) => !Object.hasOwn(row, columns[0].sourceField)))
        throw Error('DATAX_MODEL_RESULT_INCOMPLETE')
    }
    const binding: Omit<AnalyticsBinding, 'source'> = {
      id: key,
      providerId: 'data-xpert.ontology',
      operation: 'action',
      contractVersion: 1,
      parameters: [],
      payload,
      output
    }
    const sample: Array<Record<string, AnalyticsValue>> = result.effect.rows
      .slice(0, 3)
      .map((row) => Object.fromEntries(output.fields.map((f) => [f.id, row[f.sourceField]])))
    queries.push({ key, binding, rowCount: result.effect.rows.length, sample })
  }
  return { modelLabel: model.label, queries }
}
