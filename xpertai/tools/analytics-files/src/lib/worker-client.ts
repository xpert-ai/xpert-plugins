import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { AnalyticsValue } from '@xpert-ai/contracts'
import { scalar, type FileDataset, type FileQuery } from './schema'

const responseSchema = z.union([
  z.object({ error: z.string().max(160) }).strict(),
  z.object({ result: z.object({ columns: z.array(z.object({ key: z.string() }).strict()).max(80),
    rows: z.array(z.record(scalar)).max(1000), completeness: z.object({ totalRows: z.number().int(), returnedRows: z.number().int(),
      totalAccuracy: z.literal('exact'), scope: z.enum(['page', 'full_query_result']), truncated: z.boolean() }).strict() }).strict() }).strict()
])
export async function queryWorker(bytes: Buffer, definition: FileDataset, query: FileQuery,
  parameters: Record<string, AnalyticsValue>, maxRows: number, signal: AbortSignal, deadlineAt: number) {
  signal.throwIfAborted()
  const timeout = deadlineAt - Date.now()
  if (timeout <= 0) throw new Error('FILE_DATASET_DEADLINE_EXCEEDED')
  const worker = new Worker(join(__dirname, 'worker.js'), { workerData: { bytes, definition, query, parameters, maxRows },
    // Do not inherit the host's ts-node preloads or debugger into the shipped JavaScript worker.
    execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 } })
  try {
    return await new Promise<ReturnType<typeof parseResult>>((resolve, reject) => {
      const fail = () => reject(new Error('FILE_DATASET_CANCELLED'))
      const timer = setTimeout(() => reject(new Error('FILE_DATASET_DEADLINE_EXCEEDED')), timeout)
      signal.addEventListener('abort', fail, { once: true })
      const clean = () => { clearTimeout(timer); signal.removeEventListener('abort', fail) }
      worker.once('message', (data: unknown) => { clean(); try { resolve(parseResult(data)) } catch (e) { reject(e) } })
      worker.once('error', () => { clean(); reject(new Error('FILE_DATASET_WORKER_FAILED')) })
      worker.once('exit', () => { clean(); reject(new Error('FILE_DATASET_WORKER_EXITED')) })
      if (signal.aborted) fail()
    })
  } finally { await worker.terminate() }
}
function parseResult(data: unknown) {
  const message = responseSchema.parse(data)
  if ('error' in message) throw new Error(message.error)
  return message.result
}
