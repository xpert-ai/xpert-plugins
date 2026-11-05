import 'reflect-metadata'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { z } from 'zod'
import { DemandEntity } from '../dist/entity.js'
import { DemandService } from '../dist/service.js'
import { JevEvaluator, type Evaluator } from '../dist/jev.js'
import { BusinessError } from '../dist/domain.js'
import { remoteHtml } from '../dist/view.js'
import { loadJevCredentials } from './credentials.js'

loadJevCredentials()
const root = resolve('.preview'); await mkdir(root, { recursive: true })
const file = resolve(root, 'demands.sqlite')
let persisted: Buffer | undefined
try { persisted = await readFile(file) } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
let writes = Promise.resolve()
const db = new DataSource({ type: 'sqljs', ...(persisted ? { database: persisted } : {}), entities: [DemandEntity], synchronize: true, autoSave: true,
 autoSaveCallback: bytes => { const snapshot = Buffer.from(bytes); writes = writes.then(async () => { await writeFile(file + '.tmp', snapshot); await rename(file + '.tmp', file) }); return writes } })
await db.initialize()
const live = new JevEvaluator()
let failNext = false
const evaluator: Evaluator = { evaluate: async source => { if (failNext) { failNext = false; throw new BusinessError('model_busy') }; return live.evaluate(source) } }
const service = new DemandService(db.getRepository(DemandEntity), evaluator)
const scope = { tenantId: 'local-preview', organizationId: 'synthetic-demo', userId: 'local-reviewer' }
const port = Number(process.env.PREVIEW_PORT || 4317)
const origin = `http://127.0.0.1:${port}`
const querySchema = z.object({ page: z.number().optional(), pageSize: z.number().optional(), search: z.string().optional(), selectionId: z.string().optional(), parameters: z.object({ status: z.string() }).optional() })
const actionSchema = z.object({ actionKey: z.enum(['create', 'edit', 'evaluate', 'confirm']), targetId: z.string().optional(), input: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}) })
const server = createServer(async (req, res) => {
 res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff')
 if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403).end(); return }
 const requestPath = new URL(req.url || '/', origin).pathname
 try {
  if (req.method === 'GET' && requestPath === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await readFile(new URL('./preview-host.html', import.meta.url))); return }
  if (req.method === 'GET' && requestPath === '/host.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('./preview-host.js', import.meta.url))); return }
  if (req.method === 'GET' && requestPath === '/frame') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await remoteHtml()); return }
  if (req.method === 'GET' && requestPath === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'ready', mode: 'local-preview', modelConfigured: Boolean(process.env.TYPESAFE_API_KEY) })); return }
  if (req.method !== 'POST' || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403).end(); return }
  let body = ''; for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 70000) { res.writeHead(413).end(); return } }
  const raw = JSON.parse(body || '{}')
  res.setHeader('Content-Type', 'application/json')
  if (requestPath === '/api/query') {
   const q = querySchema.parse(raw); const page = await service.list(scope, { ...q, status: q.parameters?.status })
   res.end(JSON.stringify({ items: page.records, item: page.selected ?? undefined, total: page.total, meta: { page: page.page, pageSize: page.pageSize } })); return
  }
  if (requestPath === '/api/action') {
   const { actionKey: action, targetId: id = '', input } = actionSchema.parse(raw)
   const data = action === 'create' ? await service.create(scope, input) : action === 'edit' ? await service.edit(scope, id, input)
    : action === 'evaluate' ? await service.evaluate(scope, id) : await service.confirm(scope, id, input)
   await writes; res.end(JSON.stringify({ success: true, data })); return
  }
  if (requestPath === '/api/test/fail-next' && process.argv.includes('--allow-failure-test')) { failNext = true; res.end(JSON.stringify({ success: true })); return }
  res.writeHead(404).end()
 } catch (error) {
  const code = error instanceof BusinessError ? error.code : error instanceof z.ZodError || error instanceof SyntaxError ? 'invalid_input' : 'operation_failed'
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: false, data: { errorCode: code } }))
 }
})
server.listen(port, '127.0.0.1', () => console.log(`Local integration preview ready: ${origin} (not Xpert platform acceptance)`))
async function stop() { server.close(); await writes; await db.destroy() }
process.once('SIGINT', () => { void stop().then(() => process.exit(0)) })
process.once('SIGTERM', () => { void stop().then(() => process.exit(0)) })
