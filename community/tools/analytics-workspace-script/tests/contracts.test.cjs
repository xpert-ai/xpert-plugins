const { test } = require('node:test')
const assert = require('node:assert/strict')
const { registrationSchema, resultSchema, filePath } = require('../dist/lib/schema.js')
const { ScriptDefinitions } = require('../dist/lib/definitions.js')
const { WorkspaceScriptProvider } = require('../dist/lib/provider.js')

test('workspace paths reject traversal, host paths and null bytes', () => {
  for (const value of ['../secret', '/etc/passwd', 'data/../secret', 'a\0b', 'a\\b']) assert.equal(filePath.safeParse(value).success, false)
  for (const value of ['data/orders.csv', '/workspace/scripts/query.py']) assert.equal(filePath.safeParse(value).success, true)
})
test('script output cannot assert platform provenance, freshness or completeness', () => {
  const output = { columns: [{ key: 'amount' }], rows: [{ amount: '9007199254740993.12' }] }
  assert.equal(resultSchema.parse(output).rows[0].amount, '9007199254740993.12')
  for (const extra of [{ sourceFetchedAt: 'now' }, { completeness: { truncated: false } }, { provenance: {} }])
    assert.equal(resultSchema.safeParse({ ...output, ...extra }).success, false)
  assert.equal(resultSchema.safeParse({ ...output, rows: [{ amount: Infinity }] }).success, false)
})
test('definition ACL denies a different actor even if the platform returns an Artifact', async () => {
  const definitions = new ScriptDefinitions({ require: () => ({ getArtifact: async () => ({ pluginName: '@xpert-ai/plugin-analytics-workspace-script', resourceType: 'definition', status: 'active', tenantId: 'tenant', organizationId: 'org', userId: 'other' }) }) })
  await assert.rejects(definitions.open({ tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }, 'artifact', 'version'), /ACCESS_DENIED/)
})
test('definition schema disallows arbitrary commands and scope overrides', () => {
  const value = { title: 'Sales', path: 'script.py', language: 'python', files: [], sources: [], parameters: [],
    output: { datasetId: 'sales', fields: [{ id: 'amount', sourceField: 'amount', label: 'Amount', logicalType: 'decimal', nullable: false, role: 'measure' }], grain: [] } }
  assert.equal(registrationSchema.safeParse(value).success, true)
  for (const extra of [{ command: 'sh' }, { tenantId: 'other' }, { image: 'custom' }, { environment: {} }])
    assert.equal(registrationSchema.safeParse({ ...value, ...extra }).success, false)
})

test('provider propagates upstream truncation, re-executes on refresh and records trusted lineage', async () => {
  const sdk = require('@xpert-ai/plugin-sdk'), { createHash } = require('node:crypto')
  const hash = x => createHash('sha256').update(x).digest('hex')
  const definition = { runtime: { action: 'workspace_script.execute', actionVersion: '1.0.0' }, language: 'javascript', mode: 'pinned', scriptSha256: hash('code'), script: { filePath: 'script' }, title: 'test',
    output: { datasetId: 'test', fields: [{ id: 'amount', sourceField: 'amount', label: 'Amount', logicalType: 'decimal', nullable: false, role: 'measure' }], grain: [] },
    parameters: [], files: [], sources: [{ alias: 'source', binding: { providerId: 'postgres.sql' } }] }
  const output = Buffer.from(JSON.stringify({ columns: [{ key: 'amount' }], rows: [{ amount: '9007199254740993.12' }] }))
  const executions = [], evidence = [], queryCalls = []
  const capabilities = new Map([
    [sdk.WorkspaceFilesRuntimeCapability, { readBuffer: async ref => ({ buffer: ref.filePath === 'script' ? Buffer.from('code') : output }), deleteFile: async () => {} }],
    [sdk.AnalyticsRuntimeCapability, { query: async (...args) => { queryCalls.push(args); return { rows: [{ amount: 1 }], freshness: { sourceFetchedAt: '2026-10-01T00:00:00Z' }, completeness: { truncated: true, scope: 'page' }, provenance: { executionId: 'child' } } } }],
    [sdk.SandboxJobsRuntimeCapability, { run: async (input, options) => { executions.push(input); await options.invocation.handle('source.query', { alias: 'source', controls: {} }, { signal: options.signal }); return { outputs: [{ reference: { filePath: 'output' }, sha256: hash(output) }] } } }],
    [sdk.ArtifactsRuntimeCapability, { createArtifact: async () => ({ id: 'audit' }), ensureArtifactVersion: async input => { evidence.push(input); return {} } }]
  ])
  const provider = new WorkspaceScriptProvider({ require: key => capabilities.get(key) }, { open: async () => definition, store: async (_actor, buffer) => ({ filePath: 'snapshot', size: buffer.length }) })
  const binding = { id: 'binding', providerId: 'workspace_script.query', payload: { artifactId: 'd1234567-1234-4234-8234-123456789012', versionId: 'e1234567-1234-4234-8234-123456789012' }, output: definition.output, parameters: [] }
  const context = { actor: {}, executionId: 'one', deadlineAt: Date.now() + 30000, ancestry: ['workspace_script.query'], maxRows: 1000, signal: new AbortController().signal }
  const first = await provider.execute(binding, {}, context)
  await provider.execute(binding, {}, { ...context, executionId: 'two' })
  assert.equal(first.completeness.truncated, true); assert.equal(first.completeness.scope, 'page'); assert.equal(first.completeness.totalRows, undefined)
  assert.equal(first.sourceFetchedAt, '2026-10-01T00:00:00Z'); assert.equal(first.rows[0].amount, '9007199254740993.12')
  assert.notEqual(executions[0].idempotencyKey, executions[1].idempotencyKey); assert.equal(evidence.length, 2)
  assert.equal(queryCalls[0][2].deadlineAt, context.deadlineAt); assert.deepEqual(queryCalls[0][2].ancestry, context.ancestry)
})

test('CSV adapter handles quoted newlines, commas, escaped quotes and UTF-8 BOM', async () => {
  const { parseCsv } = await import('../sandbox-actions/csv.mjs')
  assert.deepEqual(parseCsv('\ufeffregion,note\r\n华东,"a,b\nline ""two"""\r\n'), [{ region: '华东', note: 'a,b\nline "two"' }])
  assert.deepEqual(parseCsv('region,amount\n'), [])
  assert.throws(() => parseCsv('a,a\n1,2'), /headers/)
  assert.throws(() => parseCsv('a,b\n1'), /length/)
  assert.throws(() => parseCsv('a\n"broken'), /quote/)
})

test('registration rejects invalid source bindings before saving definitions or running scripts', async () => {
  const sdk = require('@xpert-ai/plugin-sdk')
  const { WorkspaceScriptMiddleware } = require('../dist/lib/middleware.js')
  const id = 'd1234567-1234-4234-8234-123456789012'
  const output = { datasetId: 'sales', fields: [{ id: 'amount', sourceField: 'amount', label: 'Amount', logicalType: 'decimal', nullable: false, role: 'measure' }], grain: [] }
  let saved = false, query
  const definitions = { register: async () => { saved = true } }
  const capabilities = new Map([
    [sdk.WorkspaceFilesRuntimeCapability, {}],
    [sdk.AnalyticsRuntimeCapability, {
      list: async () => [{ id, providers: [{ id: 'workspace_script.query' }] }],
      query: async (actor, request) => { query = { actor, request }; throw new Error('NATIVE_PARAMETER_PATH_INVALID') }
    }]
  ])
  const middleware = new WorkspaceScriptMiddleware(definitions).createMiddleware({}, {
    tenantId: id, organizationId: id, userId: id, xpertId: id, runtime: { capabilities: { require: key => capabilities.get(key) } }
  })
  const binding = { schemaVersion: 1, id: 'upstream', dataSourceId: id, providerId: 'source.query', operation: 'query', contractVersion: 1,
    payload: {}, parameters: [{ name: 'region', controlId: 'region', type: 'string', required: false, defaultValue: null }], output }
  await assert.rejects(middleware.tools.find(tool => tool.name === 'workspace_dataset_register').invoke({
    dataSourceId: id, title: 'Sales', path: 'script.py', language: 'python', sources: [{ alias: 'sales', bindingJson: JSON.stringify(binding) }], parameters: [], output
  }), /SOURCE_PREFLIGHT_FAILED.*NATIVE_PARAMETER_PATH_INVALID/)
  assert.equal(saved, false)
  assert.deepEqual(query.request.controls, { region: null })
  assert.equal(query.actor.userId, id)
  await assert.rejects(middleware.tools.find(tool => tool.name === 'workspace_dataset_register').invoke({
    dataSourceId: id, title: 'Sales', path: 'script.py', language: 'python',
    sources: JSON.stringify([{ alias: 'sales', bindingJson: JSON.stringify(binding) }]), parameters: '[]', output: JSON.stringify(output)
  }), /SOURCE_PREFLIGHT_FAILED.*NATIVE_PARAMETER_PATH_INVALID/)
  assert.equal(saved, false)
  await assert.rejects(middleware.tools.find(tool => tool.name === 'workspace_dataset_register').invoke({
    dataSourceId: id, title: 'Sales', path: 'script.py', language: 'python', sources: '[]', parameters: '[]', output: JSON.stringify({ ...output, injected: true })
  }))
  assert.equal(saved, false)
})
test('language diagnostics explain contract errors without echoing script output or private values', () => {
  const { scriptFailureHint } = require('../dist/lib/diagnostics.js')
  const secret = 'private-value-from-input'
  assert.match(scriptFailureHint(`AttributeError: 'dict' object has no attribute 'rows' ${secret}`), /source\["rows"\]/)
  assert.match(scriptFailureHint(`KeyError: '${secret}'`), /field IDs|fields\[\]\.id/)
  assert.match(scriptFailureHint(`ModuleNotFoundError: ${secret}`), /ctx.csv.parse/)
  for (const message of [secret, `KeyError: '${secret}'`, `SyntaxError: ${secret}`]) assert.equal(scriptFailureHint(message).includes(secret), false)
})

test('registration retains the host Dataset field count bounds', () => {
  const field = { id: 'amount', sourceField: 'amount', label: 'Amount', logicalType: 'decimal', nullable: false, role: 'measure' }
  const input = { title: 'Sales', path: 'script.py', language: 'python', parameters: [], output: { datasetId: 'sales', fields: [field], grain: [] } }
  for (const fields of [[], Array.from({ length: 81 }, (_, i) => ({ ...field, id: `field${i}` }))])
    assert.equal(registrationSchema.safeParse({ ...input, output: { ...input.output, fields } }).success, false)
})

test('discovery paginates filtered Artifact pages and rejects incomplete version references', async () => {
  const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
  const seen = []
  const provider = new WorkspaceScriptProvider({ require: () => ({ listArtifacts: async input => {
    seen.push(input)
    return { page: input.page, pageSize: 50, total: 51, items: input.page === 1 ? [{ ...actor, userId: 'other' }] : [
      { ...actor, id: 'definition', title: 'Saved dataset', currentVersionId: 'version' }
    ] }
  } }) }, {})
  const first = await provider.discover({}, { actor })
  assert.deepEqual(first.items, []); assert.deepEqual(first.nextRequest, { page: 2 })
  const second = await provider.discover(first.nextRequest, { actor })
  assert.equal(second.items[0].id, 'definition'); assert.equal(second.nextRequest, undefined)
  for (const request of [{ artifactId: 'd1234567-1234-4234-8234-123456789012' }, { versionId: 'd1234567-1234-4234-8234-123456789012' }])
    await assert.rejects(provider.discover(request, { actor }))
  assert.equal(seen.length, 2)
})

function executionFixture(overrides = {}) {
  const sdk = require('@xpert-ai/plugin-sdk'), { createHash } = require('node:crypto')
  const hash = value => createHash('sha256').update(value).digest('hex')
  const definition = { title: 'File dataset', runtime: { action: 'workspace_script.execute', actionVersion: '1.0.0' },
    language: 'javascript', mode: 'pinned', script: { filePath: 'script' }, scriptSha256: hash('code'),
    output: { datasetId: 'sales', fields: [{ id: 'amount', sourceField: 'amount', label: 'Amount', logicalType: 'float64', nullable: false, role: 'measure' }], grain: [] },
    parameters: [], files: [{ alias: 'orders', reference: { filePath: 'orders' } }], sources: [] }
  const output = Buffer.from(JSON.stringify({ columns: [{ key: 'amount' }], rows: [{ amount: 10 }] }))
  const state = { opened: 0, resolved: 0, fileReads: 0, runs: 0, deleted: 0, audits: 0, evidence: [] }
  const capabilities = new Map([
    [sdk.WorkspaceFilesRuntimeCapability, {
      readBuffer: async ref => {
        if (ref.filePath === 'orders') { state.fileReads++; return { buffer: Buffer.from('amount\n10') } }
        return { buffer: ref.filePath === 'script' ? Buffer.from('code') : output }
      },
      resolveFile: async () => { state.resolved++; if (overrides.revoke && state.resolved > 1) throw new Error('ACCESS_REVOKED') },
      deleteFile: async () => { state.deleted++ }
    }],
    [sdk.SandboxJobsRuntimeCapability, { run: async (input, options) => {
      state.runs++; if (overrides.run) await overrides.run(options, state)
      return { outputs: overrides.missingOutput ? [] : [{ reference: { filePath: 'output' }, sha256: overrides.badHash ? 'wrong' : hash(output) }] }
    } }],
    [sdk.ArtifactsRuntimeCapability, { createArtifact: async () => { state.audits++; return { id: 'audit' } }, ensureArtifactVersion: async () => ({}) }]
  ])
  const definitions = { open: async () => { state.opened++; return definition }, store: async (_actor, bytes, name) => {
    if (name === 'execution.json') state.evidence.push(JSON.parse(bytes.toString()))
    return { filePath: 'snapshot' }
  } }
  const provider = new WorkspaceScriptProvider({ require: key => capabilities.get(key) }, definitions)
  const binding = { id: 'binding', providerId: 'workspace_script.query', payload: { artifactId: 'd1234567-1234-4234-8234-123456789012', versionId: 'e1234567-1234-4234-8234-123456789012' }, output: definition.output, parameters: [] }
  const context = { actor: {}, executionId: 'run', deadlineAt: Date.now() + 30000, ancestry: ['workspace_script.query'], maxRows: 1000, signal: new AbortController().signal }
  return { definition, state, provider, binding, context }
}
test('file aliases cache bytes within a run, but reauthorize each access and record input hashes', async () => {
  const f = executionFixture({ run: async options => {
    const first = await options.invocation.handle('file.read', { alias: 'orders' }, { signal: options.signal })
    const second = await options.invocation.handle('file.read', { alias: 'orders' }, { signal: options.signal })
    assert.deepEqual(first, second)
  } })
  const result = await f.provider.execute(f.binding, {}, f.context)
  assert.equal(f.state.fileReads, 1); assert.equal(f.state.resolved, 2); assert.equal(f.state.opened, 3)
  assert.equal(result.completeness.truncated, false); assert.equal(f.state.evidence[0].files[0].alias, 'orders')
  assert.match(f.state.evidence[0].files[0].sha256, /^[a-f0-9]{64}$/)
  await f.provider.execute(f.binding, {}, { ...f.context, executionId: 'refresh' })
  assert.equal(f.state.fileReads, 2)
})
test('revoked access fails even when file bytes were already cached', async () => {
  const f = executionFixture({ revoke: true, run: async options => {
    await options.invocation.handle('file.read', { alias: 'orders' }, { signal: options.signal })
    await options.invocation.handle('file.read', { alias: 'orders' }, { signal: options.signal })
  } })
  await assert.rejects(f.provider.execute(f.binding, {}, f.context), /ACCESS_REVOKED/)
  assert.equal(f.state.fileReads, 1); assert.equal(f.state.audits, 0)
})
test('invocations deny undeclared operations, aliases and file controls', async () => {
  for (const [operation, request, code] of [
    ['arbitrary', { alias: 'orders' }, /OPERATION_DENIED/],
    ['file.read', { alias: 'missing' }, /ALIAS_DENIED/],
    ['file.read', { alias: 'orders', controls: { x: 1 } }, /FILE_PARAMETERS_DENIED/],
    ['source.query', { alias: 'missing' }, /ALIAS_DENIED/]
  ]) {
    const f = executionFixture({ run: options => options.invocation.handle(operation, request, { signal: options.signal }) })
    await assert.rejects(f.provider.execute(f.binding, {}, f.context), code)
  }
})
test('cancelled or expired work does not launch a Sandbox Job', async () => {
  const f = executionFixture(), controller = new AbortController(); controller.abort()
  await assert.rejects(f.provider.execute(f.binding, {}, { ...f.context, signal: controller.signal }))
  await assert.rejects(f.provider.execute(f.binding, {}, { ...f.context, deadlineAt: Date.now() - 1 }), /DEADLINE_EXCEEDED/)
  assert.equal(f.state.runs, 0)
})
test('tampered pinned code and changed Binding contracts fail before execution', async () => {
  const f = executionFixture()
  await assert.rejects(f.provider.execute({ ...f.binding, output: { ...f.binding.output, grain: ['amount'] } }, {}, f.context), /BINDING_CHANGED/)
  f.definition.scriptSha256 = 'wrong'
  await assert.rejects(f.provider.execute(f.binding, {}, f.context), /CODE_CHANGED/)
  assert.equal(f.state.runs, 0)
})
test('missing or corrupt outputs cannot create successful execution evidence', async () => {
  const missing = executionFixture({ missingOutput: true })
  await assert.rejects(missing.provider.execute(missing.binding, {}, missing.context), /OUTPUT_UNAVAILABLE/)
  const corrupt = executionFixture({ badHash: true })
  await assert.rejects(corrupt.provider.execute(corrupt.binding, {}, corrupt.context), /OUTPUT_CHANGED/)
  assert.equal(corrupt.state.deleted, 1); assert.equal(corrupt.state.audits, 0)
})

test('script middleware exposes domain registration only; file tools belong to SandboxFile', () => {
  const { WorkspaceScriptMiddleware } = require('../dist/lib/middleware.js')
  const middleware = new WorkspaceScriptMiddleware({}).createMiddleware({}, {
    tenantId: 'tenant', organizationId: 'org', userId: 'user', xpertId: 'assistant', runtime: { capabilities: { require: () => ({}) } }
  })
  assert.deepEqual(middleware.tools.map(t => t.name), ['workspace_dataset_register'])
})
