import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { parse } from 'yaml'
import plugin from '../dist/index.js'
import { ContractServiceClient } from '../dist/lib/client.js'
import { ContractReviewMiddleware } from '../dist/lib/middleware.js'
import { ContractReviewViewProvider } from '../dist/lib/view-provider.js'
import { resolveConfig } from '../dist/lib/config.js'
import { candidatesSchema, intakeSchema, createSchema, confirmSchema, updateSchema } from '../dist/lib/contracts.js'
import { scopeFromAgent, scopeFromView } from '../dist/lib/scope.js'
import { TOOL_NAMES, ACTION_KEYS, TEMPLATE_KEY, VIEW_KEY, FEATURE, MIDDLEWARE_NAME } from '../dist/lib/constants.js'

const scope = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', assistantId: 'assistant-1' }
const agentContext = { ...scope, xpertId: scope.assistantId }
const viewContext = { ...scope, hostType: 'agent' as const, hostId: scope.assistantId, slots: [] }
const fields = { partyA: { value: '甲公司', evidence: '甲方：甲公司' }, partyB: null, amount: null, effectiveDate: null, expiryDate: null, paymentTerms: null }
const input = { requestKey: 'same-submission', title: '样例合同', sourceText: '甲方：甲公司', fields }
const id = '7bb66ec0-c7b7-4af0-8f42-95b449df98de'
const row = { id, title: input.title, status: 'DRAFT', version: 1, warnings: ['缺少乙方'], updatedAt: '2026-09-21T12:00:00Z' }
const contract = { ...row, extractionPending: false, sourceText: input.sourceText, fields, createdAt: row.updatedAt, audit: [{ action: 'CREATED', actorId: scope.userId, at: row.updatedAt }] }
const config = { serviceUrl: 'http://127.0.0.1:8097', serviceToken: 'test-only-token', timeoutMs: 1000 }
const jsonResponse = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

test('trusted identity is mandatory on agent and workbench paths', () => {
  assert.deepEqual(scopeFromAgent(agentContext), scope)
  assert.deepEqual(scopeFromView(viewContext), scope)
  assert.deepEqual(scopeFromView({ ...viewContext, hostId: '', xpertId: scope.assistantId } as never), scope)
  for (const key of ['tenantId', 'organizationId', 'userId', 'xpertId']) {
    assert.throws(() => scopeFromAgent({ ...agentContext, [key]: undefined }), /身份/)
  }
  for (const key of ['tenantId', 'organizationId', 'userId', 'hostId']) {
    assert.throws(() => scopeFromView({ ...viewContext, [key]: '' }), /身份/)
  }
  assert.throws(() => scopeFromView({ ...viewContext, hostType: 'project' as never }), /身份/)
  assert.throws(() => scopeFromAgent({ ...agentContext, tenantId: 'a\r\nx-evil: yes' }), /身份/)
})

test('server configuration defaults, secret fallback and bounds', () => {
  assert.deepEqual(resolveConfig({}, { CONTRACT_SERVICE_TOKEN: 'env-token' }), { serviceUrl: 'http://127.0.0.1:8097', serviceToken: 'env-token', timeoutMs: 10000 })
  assert.equal(resolveConfig(config, { CONTRACT_SERVICE_TOKEN: 'env-token' }).serviceToken, 'test-only-token')
  for (const invalid of [
    { serviceUrl: 'file:///tmp/file' }, { serviceUrl: 'http://user:pass@localhost' },
    { serviceUrl: 'http://localhost/api?secret=x' }, { timeoutMs: 30001 },
    { serviceToken: 'token\r\nheader' }, { headers: { authorization: 'x' } }
  ]) assert.throws(() => resolveConfig({ ...config, ...invalid }), /配置/)
  assert.throws(() => resolveConfig({}, {}), /配置/)
})

test('input schemas require exact evidence and refuse identity, URLs, extra fields and bad versions', () => {
  assert.deepEqual(createSchema.parse(input), input)
  for (const extra of ['tenantId', 'organizationId', 'userId', 'assistantId', 'serviceUrl', 'serviceToken']) {
    assert.equal(createSchema.safeParse({ ...input, [extra]: 'attacker' }).success, false)
    assert.equal(updateSchema.safeParse({ contractId: id, expectedVersion: 1, fields, [extra]: 'attacker' }).success, false)
  }
  assert.equal(createSchema.safeParse({ ...input, fields: { ...fields, amount: { value: '100', evidence: '不存在100' } } }).success, false)
  assert.equal(createSchema.safeParse({ ...input, fields: { ...fields, partyA: { value: '乙公司', evidence: '甲方：甲公司' } } }).success, false)
  assert.equal(createSchema.safeParse({ ...input, sourceText: 'x'.repeat(50001) }).success, false)
  assert.equal(createSchema.safeParse({ ...input, fields: { partyA: fields.partyA } }).success, false)
  for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(confirmSchema.safeParse({ contractId: id, expectedVersion: version }).success, false)
  assert.equal(confirmSchema.safeParse({ contractId: '../../health', expectedVersion: 1 }).success, false)
})

test('intake saves original text and model candidates cannot supply or replace it', async (t) => {
  const calls: { url: string, body: unknown }[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) })
    return jsonResponse(contract)
  })
  const client = new ContractServiceClient(config)
  const original = { title: input.title, sourceText: input.sourceText }
  assert.deepEqual(intakeSchema.parse(original), original)
  await client.intake(scope, original)
  await client.candidates(scope, { contractId: id, fields })
  assert.deepEqual(calls, [
    { url: `${config.serviceUrl}/api/contracts/intake`, body: original },
    { url: `${config.serviceUrl}/api/contracts/${id}/candidates`, body: { fields } }
  ])
  for (const key of ['sourceText', 'requestKey', 'tenantId', 'userId']) {
    assert.equal(candidatesSchema.safeParse({ contractId: id, fields, [key]: 'forged' }).success, false)
  }
})

test('client reads replaced host configuration for the next request', async (t) => {
  const calls: { url: string; token: string }[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, token: new Headers(init.headers).get('authorization')! })
    return jsonResponse(contract)
  })
  const context = { config }
  const client = new ContractServiceClient(() => context.config)
  await client.get(scope, { contractId: id })
  context.config = { ...config, serviceUrl: 'http://127.0.0.1:8098', serviceToken: 'rotated-test-token' }
  await client.get(scope, { contractId: id })
  assert.deepEqual(calls, [
    { url: `${config.serviceUrl}/api/contracts/${id}`, token: 'Bearer test-only-token' },
    { url: `http://127.0.0.1:8098/api/contracts/${id}`, token: 'Bearer rotated-test-token' }
  ])
})


test('client constructs only trusted scope headers and fixed service paths', async (t) => {
  const calls: { url: string; init: RequestInit }[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => { calls.push({ url, init }); return jsonResponse(contract, 201) })
  const client = new ContractServiceClient(config)
  assert.deepEqual(await client.create(scope, input), contract)
  assert.equal(calls[0].url, `${config.serviceUrl}/api/contracts`)
  assert.equal(calls[0].init.redirect, 'error')
  assert.deepEqual(calls[0].init.headers, {
    authorization: 'Bearer test-only-token', accept: 'application/json', 'content-type': 'application/json',
    'x-tenant-id': scope.tenantId, 'x-organization-id': scope.organizationId, 'x-user-id': scope.userId, 'x-assistant-id': scope.assistantId
  })
  assert.deepEqual(JSON.parse(calls[0].init.body as string), input)
  await assert.rejects(client.get(scope, { contractId: '../../health' }))
  await assert.rejects(client.list({ ...scope, organizationId: '' }))
  assert.equal(calls.length, 1)
})

test('malformed, excess and sensitive service responses are never exposed', async (t) => {
  const client = new ContractServiceClient(config)
  for (const response of [
    jsonResponse({ ...contract, status: 'PROCESSING' }), jsonResponse({ ...contract, debugToken: 'private-token' }),
    new Response('private-token', { headers: { 'content-type': 'text/plain' } }),
    new Response('private-token', { headers: { 'content-type': 'application/json' } }),
    new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } })
  ]) {
    const mocked = t.mock.method(globalThis, 'fetch', async () => response)
    await assert.rejects(client.get(scope, { contractId: id }), (error: any) => error.code === 'INVALID_RESPONSE' && !error.message.includes('private-token'))
    mocked.mock.restore()
  }
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [404, 'NOT_FOUND'], [409, 'CONFLICT'], [422, 'VALIDATION_FAILED'], [500, 'SERVICE_UNAVAILABLE']] as const) {
    const mocked = t.mock.method(globalThis, 'fetch', async () => jsonResponse({ code: 'SQL', message: 'test-only-token private-token SQL stack trace' }, status))
    await assert.rejects(client.get(scope, { contractId: id }), (error: any) => error.code === code && !/token|SQL|stack/.test(error.message))
    mocked.mock.restore()
  }
})

test('real HTTP redirects cannot forward credentials and hanging service times out', async () => {
  let destinationCalls = 0
  const server = createServer((request, response) => {
    if (request.url === '/leak') { destinationCalls++; response.end('leaked'); return }
    if (request.headers['x-user-id'] === 'timeout-user') return
    response.writeHead(302, { location: '/leak' }); response.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const client = new ContractServiceClient({ ...config, serviceUrl: `http://127.0.0.1:${address.port}`, timeoutMs: 100 })
  try {
    await assert.rejects(client.list(scope), (error: any) => error.code === 'SERVICE_UNAVAILABLE')
    assert.equal(destinationCalls, 0)
    await assert.rejects(client.list({ ...scope, userId: 'timeout-user' }), (error: any) => error.code === 'SERVICE_TIMEOUT')
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close') }
})

test('model tools expose create and reads only, retaining trusted host identity', async (t) => {
  const captured: RequestInit[] = []
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => { captured.push(init); return jsonResponse({ items: [row] }) })
  const middleware = new ContractReviewMiddleware(new ContractServiceClient(config))
  assert.deepEqual(middleware.getToolNames(), [...TOOL_NAMES])
  assert.equal(middleware.getToolNames().some((name) => /confirm|update/.test(name)), false)
  assert.throws(() => middleware.createMiddleware({}, { ...agentContext, xpertId: undefined }))
  const active = middleware.createMiddleware({}, agentContext)
  assert.deepEqual(active.tools!.map((tool: any) => tool.name), [...TOOL_NAMES])
  const listTool = active.tools![1] as any
  assert.deepEqual(JSON.parse(await listTool.invoke({})), { items: [row] })
  assert.equal((captured[0].headers as Record<string, string>)['x-assistant-id'], scope.assistantId)
  await assert.rejects(listTool.invoke({ tenantId: 'other' }))
  assert.equal(captured.length, 1)
})

test('workbench uses the SDK action signature, exact query, scoped detail and explicit human actions', async (t) => {
  const urls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url)
    return jsonResponse(url.endsWith('/summary') ? { status: 'DRAFT', summary: '待核对' } : url.endsWith('/api/contracts') ? { items: [row] } : contract)
  })
  const provider = new ContractReviewViewProvider(new ContractServiceClient(config))
  assert.deepEqual(await provider.getViewData(viewContext, VIEW_KEY, {}), { items: [row], meta: { selected: null } })
  assert.deepEqual(await provider.getViewData(viewContext, VIEW_KEY, { parameters: { contractId: id } }), { items: [row], meta: { selected: contract } })
  const beforeInvalid = urls.length
  await assert.rejects(provider.getViewData(viewContext, VIEW_KEY, { parameters: { tenantId: 'other' } }))
  assert.equal(urls.length, beforeInvalid)
  const updated = await provider.executeViewAction(viewContext, VIEW_KEY, 'update_contract', { input: { contractId: id, expectedVersion: 1, fields } })
  assert.deepEqual(updated, { success: true, data: contract, refresh: true })
  assert.deepEqual(await provider.executeViewAction(viewContext, VIEW_KEY, 'get_summary', { input: { contractId: id } }), { success: true, data: { status: 'DRAFT', summary: '待核对' } })
  assert.equal((await provider.executeViewAction(viewContext, VIEW_KEY, 'create_contract', { input })).success, false)
  assert.equal((await provider.executeViewAction({ ...viewContext, userId: '' }, VIEW_KEY, 'confirm_contract', { input: { contractId: id, expectedVersion: 1 } })).success, false)
})

test('app metadata, template provider, tools, manifest and packaged remote entry agree', async () => {
  const provider = new ContractReviewViewProvider(new ContractServiceClient(config))
  const [manifest] = provider.getViewManifests(viewContext, 'agent.workbench.fixed')
  assert.equal(manifest.key, VIEW_KEY)
  assert.deepEqual(manifest.activation?.requiredFeatures, [FEATURE])
  assert.deepEqual(manifest.actions?.map((action) => action.key), [...ACTION_KEYS])
  assert.deepEqual(manifest.clientCommands?.map((command) => command.key), ['assistant.chat.send_message'])
  assert.equal(manifest.view.type, 'remote_component')
  assert.equal(JSON.stringify(manifest).includes('test-only-token'), false)
  assert.equal(JSON.stringify(manifest).includes(config.serviceUrl), false)
  const entry = await provider.getRemoteComponentEntry(viewContext, VIEW_KEY, { isolation: 'iframe', entry: 'contract-review.html' })
  assert.ok(entry.html?.includes('合同'))
  await assert.rejects(provider.getRemoteComponentEntry(viewContext, VIEW_KEY, { isolation: 'iframe', entry: '../../package.json' }))
  const templates = plugin.templates as any[]
  assert.equal(templates[0].key, TEMPLATE_KEY)
  const dsl = parse(templates[0].dslContent)
  assert.equal(dsl.team.options.templateKey, TEMPLATE_KEY)
  assert.equal(dsl.nodes.find((node: any) => node.type === 'workflow').entity.provider, MIDDLEWARE_NAME)
  for (const name of TOOL_NAMES) assert.ok(templates[0].dslContent.includes(name))
  const app = plugin.meta.targetAppMeta!.xpert!.marketplace!.contents!.find((item: any) => item.type === 'app') as any
  assert.equal(app.appConfig.assistantTemplateKey, TEMPLATE_KEY)
  assert.equal(plugin.meta.artifactNamespace, 'contract_review')
  assert.equal(JSON.stringify(plugin.meta).includes('test-only-token'), false)
  assert.equal(await readFile(new URL('../dist/assistant.yaml', import.meta.url), 'utf8'), await readFile(new URL('../assistant.yaml', import.meta.url), 'utf8'))
})
