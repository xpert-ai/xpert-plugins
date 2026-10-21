// Parsing and aggregation run off the API event loop and can be terminated at the host deadline.
import { parentPort, workerData } from 'node:worker_threads'
import { z } from 'zod/v3'
import { datasetSchema, payloadSchema, scalar } from './schema'
import { readRows } from './readers'
import { executeQuery } from './query'

const inputSchema = z.object({ definition: datasetSchema, query: payloadSchema,
  parameters: z.record(scalar), maxRows: z.number().int().min(1).max(1000),
  bytes: z.instanceof(Uint8Array) }).strict()
async function run() {
  const input = inputSchema.parse(workerData)
  const rows = await readRows(Buffer.from(input.bytes), input.definition)
  return executeQuery(rows, input.definition, input.query, input.parameters, input.maxRows)
}
run().then(result => parentPort?.postMessage({ result }), (error: unknown) => {
  const message = error instanceof Error && /^FILE_DATASET_[A-Z_]+(?:: [A-Za-z][A-Za-z0-9_]*)?$/.test(error.message) ? error.message : 'FILE_DATASET_PARSE_FAILED'
  parentPort?.postMessage({ error: message })
})
