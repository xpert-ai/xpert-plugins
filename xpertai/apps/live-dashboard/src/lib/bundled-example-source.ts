import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AnalyticsBinding } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import {
  analyticsBindingSchema, analyticsOptionsSchema, type AnalyticsDefinitionAuthoringApi, type AnalyticsAuthoringScope, type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'

// These skill recipes ship a synthetic CSV and a file.table definition. The Superstore recipe uses a governed ontology.
export const exampleIdSchema = z.enum(['regional-sales', 'sales-overview', 'production-quality'])
export const EXAMPLE_SOURCE_GUIDANCE = 'For an explicitly requested bundled demo (regional-sales, sales-overview, production-quality), including a choice made earlier in this conversation, first call analytics_definition_register with only exampleId set to that exact key. When the request matches a returned prepared query, pass its previewRequest unchanged to dashboard_preview_binding. For other requests start from the returned canonical binding. Preserve its source, datasetId, revision and contractHash. Use its actual fields as aggregate inputs, and the aggregate alias as output.sourceField. Preview the requested query before saving. A registered source with similar fields or a similar name is a different dataset. For named registered business sources use dashboard_list_sources as usual.'
const recipeMetadata = z.object({ path: z.string(), name: z.string().min(1) })

export async function registerExampleSource(
  exampleId: z.infer<typeof exampleIdSchema>, projectId: string | undefined, runtime: AnalyticsDefinitionAuthoringApi,
  scope: AnalyticsAuthoringScope, files: WorkspaceFilesApi
) {
  if (!projectId) throw new Error('DASHBOARD_EXAMPLE_PROJECT_REQUIRED')
  const dir = join(__dirname, '../../skills/live-dashboard/examples', exampleIdSchema.parse(exampleId))
  const [csv, json] = await Promise.all([readFile(join(dir, 'demo.csv')), readFile(join(dir, 'definition.json'), 'utf8')])
  const definition = analyticsOptionsSchema.parse(JSON.parse(json))
  const { path, name } = recipeMetadata.parse(definition)
  const selection = (await runtime.catalog(scope)).find(item => item.providerId === 'file.table')
  if (!selection) throw new Error('DASHBOARD_EXAMPLE_FILE_PROVIDER_UNAVAILABLE')
  // Recipes belong to the Project root even when the Agent has a conversation-specific working directory.
  const runtimePath = `/workspace/${path}`
  const ref = await files.resolveRuntimeReference(runtimePath)
  if (ref.catalog !== 'projects' || ref.projectId !== projectId) throw new Error('DASHBOARD_EXAMPLE_PROJECT_MISMATCH')
  try {
    const existing = await files.readBuffer(ref)
    if (!existing.buffer.equals(csv)) throw new Error('DASHBOARD_EXAMPLE_FILE_CHANGED: the project file differs from the packaged sample.')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    await files.writeRuntimeBuffer({ path: runtimePath, buffer: csv, mimeType: 'text/csv' })
  }
  const hash = createHash('sha256').update(json).update(csv).digest('hex')
  return runtime.register(scope, {
    providerId: selection.providerId, connectionKey: selection.connectionKey,
    requestId: `example-${projectId}-${hash}`, name, definition: { ...definition, path: runtimePath }
  })
}

// Prepared queries are authored alongside each bundled sample. Attach them to the registered,
// inspected binding so source and contract identity always come from the active project.
export async function exampleSummaryQuery(exampleId: z.infer<typeof exampleIdSchema>, binding: AnalyticsBinding) {
  const path = join(__dirname, '../../skills/live-dashboard/examples', exampleIdSchema.parse(exampleId), 'query.json')
  const { summary } = JSON.parse(await readFile(path, 'utf8'))
  if (!summary) return
  const prepared = analyticsBindingSchema.parse({
    ...binding, parameters: [],
    payload: { ...analyticsOptionsSchema.parse(binding.payload), select: summary.payloadFields.select, groupBy: summary.payloadFields.groupBy,
      aggregates: summary.payloadFields.aggregates, orderBy: summary.payloadFields.orderBy },
    output: { ...binding.output, grain: summary.grain, fields: summary.fields }
  })
  return { key: `${exampleId}/${summary.key}`, description: String(summary.description), binding: prepared }
}
