import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createDorisStreamLoad, parseStreamLoadReceipt } from '../dist/lib/doris-stream-load.js'

const input = { database: 'analytics', table: 'orders', columns: ['id'], rows: [['9007199254740993']], operationId: 'stable-operation-123' }
const success = { Status: 'Success', NumberLoadedRows: 1, NumberFilteredRows: 0 }

async function endpoint(context, respond) {
  const requests = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    requests.push({ headers: request.headers, method: request.method, url: request.url, body: Buffer.concat(chunks).toString() })
    const result = respond(request, requests.length)
    response.writeHead(result.status ?? 200, { 'content-type': 'application/json', ...result.headers })
    response.end(JSON.stringify(result.body ?? success))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return { requests, port: address.port }
}

function options(port) {
  return { host: '127.0.0.1', apiPort: port, username: 'test-user', password: 'test-password' }
}

test('FE Stream Load sends the required Expect header and preserves large values', async (context) => {
  const server = await endpoint(context, (request) => ({ body: request.headers.expect === '100-continue' ? success : { status: 'FAILED', msg: 'There is no 100-continue header' } }))
  const receipt = await createDorisStreamLoad(options(server.port))(input)
  assert.equal(receipt.outcome, 'succeeded')
  assert.equal(receipt.loadedRows, 1)
  assert.equal(server.requests[0].method, 'PUT')
  assert.deepEqual(JSON.parse(server.requests[0].body), [{ id: '9007199254740993' }])
})

test('publish timeout retains a stable label without automatic replay', async (context) => {
  const server = await endpoint(context, () => ({ body: { Status: 'Publish Timeout' } }))
  const load = createDorisStreamLoad(options(server.port))
  assert.equal((await load(input)).outcome, 'pending')
  assert.equal(server.requests.length, 1)
  assert.equal((await load(input)).outcome, 'pending')
  assert.equal(server.requests[0].headers.label, server.requests[1].headers.label)
})

test('unlisted redirect hosts never receive credentials', async (context) => {
  const server = await endpoint(context, () => ({ status: 307, headers: { location: 'http://outside.invalid:8040/api/analytics/orders/_stream_load' } }))
  const receipt = await createDorisStreamLoad(options(server.port))(input)
  assert.equal(receipt.outcome, 'unknown')
  assert.equal(server.requests.length, 1)
})

test('allowed FE to BE redirect preserves request headers and row counts', async (context) => {
  const backend = await endpoint(context, () => ({ body: { ...success, NumberFilteredRows: 1 } }))
  const frontend = await endpoint(context, () => ({ status: 307, headers: { location: `http://127.0.0.1:${backend.port}/api/analytics/orders/_stream_load` } }))
  const receipt = await createDorisStreamLoad(options(frontend.port))(input)
  assert.equal(receipt.outcome, 'succeeded')
  assert.equal(receipt.filteredRows, 1)
  assert.ok(receipt.diagnostics.includes('filtered_rows_reported'))
  assert.equal(frontend.requests.length, 1)
  assert.equal(backend.requests.length, 1)
  assert.equal(backend.requests[0].headers.expect, '100-continue')
  assert.equal(backend.requests[0].headers.authorization, frontend.requests[0].headers.authorization)
  assert.equal(backend.requests[0].body, frontend.requests[0].body)
})

test('duplicate finished labels do not invent counts or request a replay', () => {
  assert.deepEqual(parseStreamLoadReceipt({ Status: 'Label Already Exists', ExistingJobStatus: 'FINISHED' }, 'existing'), {
    outcome: 'succeeded', label: 'existing', diagnostics: ['duplicate_label_no_replay', 'original_row_counts_unavailable']
  })
  assert.throws(() => parseStreamLoadReceipt({ Status: 'Success' }, 'missing'), /count/)
})

test('FE redirect URL credentials cannot override the configured credentials', async (context) => {
  const backend = await endpoint(context, () => ({ body: success }))
  const frontend = await endpoint(context, () => ({ status: 307, headers: { location: `http://redirect-user:redirect-password@127.0.0.1:${backend.port}/api/analytics/orders/_stream_load` } }))
  const receipt = await createDorisStreamLoad(options(frontend.port))(input)
  assert.equal(receipt.outcome, 'succeeded')
  assert.equal(backend.requests.length, 1)
  assert.equal(backend.requests[0].headers.authorization, `Basic ${Buffer.from('test-user:test-password').toString('base64')}`)
})
