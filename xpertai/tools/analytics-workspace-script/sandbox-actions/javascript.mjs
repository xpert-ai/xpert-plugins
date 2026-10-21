import { parseCsv } from './csv.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
const request = JSON.parse(await readFile('/workspace/input/job.json', 'utf8'))
let sequence = 0
async function invoke(operation, alias, controls = {}) {
  const id = `call_${++sequence}`
  process.stdout.write('XPERT_SANDBOX_INVOKE ' + JSON.stringify({ id, operation, payload: { alias, controls } }) + '\n')
  const deadline = Date.now() + 28000
  while (Date.now() < deadline) {
    try { const result = JSON.parse(await readFile(`/workspace/invocations/${id}.json`, 'utf8')); return result.value }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await setTimeout(25)
  }
  throw new Error('Invocation timed out')
}
const code = await readFile('/workspace/input/script', 'utf8')
const { query } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
if (typeof query !== 'function') throw new Error('Export async function query(ctx)')
const result = await query({ csv: { parse: parseCsv }, parameters: request.payload.parameters,
  sources: { query: (alias, controls) => invoke('source.query', alias, controls) }, files: { read: alias => invoke('file.read', alias) },
  dataset: rows => ({ columns: request.payload.outputKeys.map(key => ({ key })), rows }) })
const encoded = JSON.stringify(result)
if (Buffer.byteLength(encoded) > 2000000) throw new Error('Dataset output exceeds 2 MB')
await writeFile('/workspace/output/dataset.json', encoded)
