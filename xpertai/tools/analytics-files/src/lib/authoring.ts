import { createHash } from 'node:crypto'
import type { JSONValue } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { type AnalyticsDefinitionAuthoring, type AnalyticsAuthoringContext } from '@xpert-ai/plugin-sdk'
import { datasetSchema, fileSchema, jsonSchema, MAX_BYTES, optionsSchema, payloadSchema } from './schema'
import { queryWorker } from './worker-client'
const inspectSchema = z.object({ path: z.string().min(1).max(1024).optional() }).strict()
const definitionSchema = datasetSchema.innerType().omit({ id: true, revision: true, file: true }).extend({ path: z.string().min(1).max(1024) }).strict()
async function resolve(path: string, context: AnalyticsAuthoringContext) {
  if (context.connection.kind !== 'workspace-files') throw new Error('ANALYTICS_CONNECTION_INVALID')
  const reference = await context.files.resolveRuntimeReference(path)
  const base = { catalog: reference.catalog, filePath: reference.filePath }
  const file = fileSchema.parse(reference.catalog === 'projects' ? { ...base, projectId: reference.projectId }
    : reference.catalog === 'users' ? { ...base, userId: reference.userId }
    : reference.catalog === 'user-xperts' ? { ...base, xpertId: reference.xpertId, userId: reference.userId }
    : { ...base, xpertId: reference.xpertId })
  const metadata = await context.files.resolveFile(reference)
  if (!metadata.size || metadata.size > MAX_BYTES) throw new Error('FILE_DATASET_SIZE_LIMIT')
  context.signal.throwIfAborted()
  return { reference, file, size: metadata.size }
}
export const fileAuthoring: AnalyticsDefinitionAuthoring = {
  inspectSchema: jsonSchema(inspectSchema), definitionSchema: jsonSchema(definitionSchema),
  instructions: 'Use SandboxFile tools to list/read the current authorized workspace files. Select the exact runtime path, inspect CSV headers/JSON rows/XLSX sheet and documented business semantics, then generate reader and columns. Do not ask the user for internal file scope or IDs. Register validates the real file and mapping. Do not infer business meanings without evidence.',
  async inspect(original, context): Promise<JSONValue> {
    const input = inspectSchema.parse(original)
    if (!input.path) return { next: 'List/read authorized files with SandboxFile tools, then inspect with {path}.' }
    const resolved = await resolve(input.path, context)
    return { path: input.path, size: resolved.size, formats: ['csv', 'json', 'xlsx'] }
  },
  async prepare(original, context) {
    const { path, ...input } = definitionSchema.parse(original)
    const resolved = await resolve(path, context)
    const options = optionsSchema.parse({ datasets: [{ ...input, id: 'dataset', revision: 'initial', file: resolved.file }] })
    const dataset = options.datasets[0], { buffer } = await context.files.readBuffer(resolved.reference)
    if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('FILE_DATASET_SIZE_LIMIT')
    const payload = payloadSchema.parse({ datasetId: dataset.id, revision: dataset.revision, contractHash: createHash('sha256').update(JSON.stringify(dataset)).digest('hex'), select: dataset.columns.map(column => column.key) })
    await queryWorker(buffer, dataset, payload, {}, 5, context.signal, context.deadlineAt)
    await resolve(path, context)
    return options
  }
}
