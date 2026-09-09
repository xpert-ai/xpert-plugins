// Local acceptance client. Credentials stay in this Node process and are never sent to an App iframe.
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const checkout = process.env.XPERT_HOST_CHECKOUT
const organizationId = process.env.XPERT_ORGANIZATION_ID
if (!checkout || !organizationId) throw new Error('Set XPERT_HOST_CHECKOUT and XPERT_ORGANIZATION_ID.')
const { requireAuthentication, createRequestHeaders } = await import(
  pathToFileURL(join(resolve(checkout), 'tools/scripts/local-plugin-cli.mjs')).href
)
const args = {
  apiUrl: process.env.XPERT_API_URL ?? 'http://localhost:3333',
  scope: 'organization',
  orgId: organizationId
}
const auth = await requireAuthentication(args)
const headers = createRequestHeaders(args, auth.token, auth.tenantId)
const base = `${args.apiUrl}/api/plugin/${encodeURIComponent(
  '@xpert-ai/plugin-excalidraw'
)}/resources/mcp/excalidraw-tools`
const response = await fetch(`${base}/credential`, { method: 'POST', headers, body: '{}' })
if (!response.ok)
  throw new Error(
    `MCP credential unavailable (${response.status}); enable this organization in plugin management first.`
  )
const credential = await response.json()
let sequence = 0

export async function rpc(method, params = {}, options = {}) {
  const request = {
    jsonrpc: '2.0',
    id: ++sequence,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'Excalidraw local acceptance', version: '1' },
        'io.modelcontextprotocol/clientCapabilities': options.noInput ? {} : { elicitation: { form: {} } }
      }
    }
  }
  if (options.legacy) delete request.params._meta
  const result = await fetch(credential.connectionInfo.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': options.legacy ? '2025-11-25' : '2026-07-28',
      'mcp-method': method,
      ...(params.name ?? params.uri ? { 'mcp-name': params.name ?? params.uri } : {})
    },
    body: JSON.stringify(request)
  })
  const text = await result.text()
  const parsed = JSON.parse(
    text.startsWith('event:')
      ? text
          .split('\n')
          .find((line) => line.startsWith('data:'))
          .slice(5)
      : text
  )
  if (parsed.error) throw new Error(`MCP ${method}: ${JSON.stringify(parsed.error)}`)
  return parsed.result
}

// Acceptance must never silently grant an interactive approval.
export const client = {
  listTools: () => rpc('tools/list'),
  listResources: () => rpc('resources/list'),
  readResource: (params) => rpc('resources/read', params),
  close: async () => {},
  callTool: async (params) => {
    const result = await rpc('tools/call', params, { noInput: true })
    if (result.resultType === 'input_required') throw new Error('Unexpected elicitation: Excalidraw should follow its direct application policy.')
    return result
  }
}
export async function call(name, input) {
  const result = await client.callTool({ name, arguments: input })
  if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`)
  return result.structuredContent
}
export async function wait(initial) {
  let job = initial
  const deadline = Date.now() + 180000
  while (!job.terminal && Date.now() < deadline)
    job = await call('excalidraw_wait_job', { jobId: job.jobId, cursor: job.cursor })
  if (!job.terminal) throw new Error('Acceptance render deadline exceeded; query the persisted job to resume.')
  return job
}
