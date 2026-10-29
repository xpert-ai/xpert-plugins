const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { mkdtempSync, symlinkSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { execFileSync } = require('node:child_process')
const { dashboardWorkspacePrompts } = require('../dist/lib/prompt-workflows.js')

function fixture() {
  const organizationId = randomUUID(), assistantId = randomUUID(), workspaceId = randomUUID()
  const nodeKey = 'dashboard-node'
  const assistant = { id: assistantId, organizationId, workspaceId, latest: true,
    graph: { nodes: [{ type: 'workflow', key: nodeKey, entity: { type: 'middleware', provider: 'LiveDashboard', required: true } }] } }
  const records = new Map(), requests = [], logs = []
  const state = { assistant, records, requests, logs, failPost: 0, runtimeOverride: commands => commands }
  const runtime = () => state.runtimeOverride([
    { name: 'dashboard-standard-auto', source: { type: 'middleware', provider: 'LiveDashboard', nodeKey } },
    ...[...records.values()].filter(record => !record.archivedAt && (!record.associatedXpertIds?.length || record.associatedXpertIds.includes(assistantId)))
      .map(record => ({ name: record.name, kind: 'prompt_workflow',
        source: { type: 'workspace_prompt_workflow', workflowId: record.id },
        action: { type: record.actionType ?? 'insert_text', template: record.template } }))
  ])
  state.options = { apiUrl: 'https://example.test/api', organizationId, assistantId, token: 'Bearer private-token',
    log: text => logs.push(text), request: async (url, options) => {
      requests.push({ url, ...options })
      assert.equal(options.headers['organization-id'], organizationId)
      assert.equal(options.headers.Authorization, 'Bearer private-token')
      assert.equal(options.redirect, 'error')
      let result
      if (url.pathname === `/api/xpert/${assistantId}`) result = assistant
      else if (url.pathname === `/api/xpert/${assistantId}/runtime-capabilities`) result = { commands: runtime() }
      else if (options.method === 'GET' && url.pathname === `/api/prompt-workflow/by-workspace/${workspaceId}`) {
        const filter = JSON.parse(url.searchParams.get('data'))
        assert.equal(filter.take, 2)
        const record = records.get(filter.where.name)
        result = { items: record ? [record] : [], total: record ? 1 : 0 }
      } else if (options.method === 'POST' && url.pathname === `/api/prompt-workflow/workspace/${workspaceId}`) {
        if (state.failPost && requests.filter(request => request.method === 'POST').length === state.failPost)
          return { ok: false, status: 503 }
        const body = JSON.parse(options.body)
        assert.deepEqual(body.associatedXpertIds, [assistantId])
        assert.equal(records.has(body.name), false)
        // The host normalizer currently omits actionType; workspace prompts default to insert_text.
        const { actionType, ...normalized } = body
        result = { ...normalized, id: randomUUID() }
        records.set(body.name, result)
      } else throw new Error(`Unexpected request: ${options.method} ${url.pathname}`)
      return { ok: true, status: 200, json: async () => result }
    } }
  state.existing = (patch = {}) => {
    const record = { ...dashboardWorkspacePrompts[0], id: randomUUID(), associatedXpertIds: [assistantId], ...patch }
    records.set(record.name, record)
    return record
  }
  return state
}

const importer = () => import('../scripts/import-prompts.mjs')

test('CLI executes from a symlinked package path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dashboard-import-test-'))
  try {
    const entry = join(directory, 'import-prompts.mjs')
    symlinkSync(resolve(__dirname, '../scripts/import-prompts.mjs'), entry)
    const help = execFileSync(process.execPath, [entry, '--help'], { encoding: 'utf8' })
    assert.match(help, /Default: read-only preview/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('default preview performs no writes and never logs the token', async () => {
  const { importPrompts } = await importer(), f = fixture()
  const result = await importPrompts(f.options)
  assert.equal(result.planned.length, 12)
  assert.deepEqual(result.created, [])
  assert.ok(f.requests.every(request => request.method === 'GET'))
  assert.doesNotMatch(f.logs.join('\n'), /private-token/)
})

test('explicit apply creates scoped shortcuts, confirms runtime and is idempotent', async () => {
  const { importPrompts } = await importer(), f = fixture()
  const result = await importPrompts({ ...f.options, apply: true })
  assert.equal(result.created.length, 12)
  assert.match(f.logs.at(-1), /confirmed/)
  const repeated = await importPrompts({ ...f.options, apply: true })
  assert.equal(repeated.skipped.length, 12)
  assert.equal(repeated.created.length, 0)
  assert.equal(f.requests.filter(request => request.method === 'POST').length, 12)
})

test('archived, edited and differently associated prompts stop all writes', async () => {
  const { importPrompts } = await importer()
  for (const patch of [{ archivedAt: '2026-10-01' }, { template: 'User edited prompt' }, { associatedXpertIds: [randomUUID()] }]) {
    const f = fixture(), existing = f.existing(patch)
    await assert.rejects(importPrompts({ ...f.options, apply: true }), /no writes made/)
    assert.ok(f.requests.every(request => request.method === 'GET'))
    assert.equal(f.records.get(existing.name), existing)
  }
})

test('runtime-disabled, overridden or shadowed shortcuts are not reported as available', async () => {
  const { importPrompts } = await importer()
  for (const override of [
    commands => commands.filter(command => command.source.type !== 'workspace_prompt_workflow'),
    commands => commands.map(command => command.kind ? { ...command, action: { type: 'submit_prompt', template: command.action.template } } : command),
    commands => commands.map(command => command.kind ? { ...command, action: { type: 'insert_text', template: 'Custom profile override' } } : command)
  ]) {
    const f = fixture()
    f.existing()
    f.runtimeOverride = override
    await assert.rejects(importPrompts({ ...f.options, apply: true }), /no writes made/)
    assert.ok(f.requests.every(request => request.method === 'GET'))
  }
  const f = fixture()
  f.runtimeOverride = commands => [...commands, { name: dashboardWorkspacePrompts[0].name, source: { type: 'xpert' } }]
  await assert.rejects(importPrompts({ ...f.options, apply: true }), /no writes made/)
})

test('invalid Assistant scope, publication or middleware fails before writes', async () => {
  const { importPrompts } = await importer()
  for (const mutate of [
    f => { f.assistant.organizationId = randomUUID() },
    f => { f.assistant.latest = false },
    f => { delete f.assistant.graph },
    f => { f.assistant.graph.nodes[0].entity.required = false },
    f => { f.runtimeOverride = () => [] }
  ]) {
    const f = fixture()
    mutate(f)
    await assert.rejects(importPrompts({ ...f.options, apply: true }))
    assert.ok(f.requests.every(request => request.method === 'GET'))
  }
})

test('partial failure preserves created resources and retry only creates missing ones', async () => {
  const { importPrompts } = await importer(), f = fixture()
  f.failPost = 3
  await assert.rejects(importPrompts({ ...f.options, apply: true }), /503/)
  assert.equal(f.records.size, 2)
  f.failPost = 0
  const result = await importPrompts({ ...f.options, apply: true })
  assert.equal(result.skipped.length, 2)
  assert.equal(result.created.length, 10)
  assert.equal(f.records.size, 12)
})

test('an unavailable runtime after creation is reported honestly', async () => {
  const { importPrompts } = await importer(), f = fixture()
  f.runtimeOverride = commands => commands.filter(command => command.source.type === 'middleware')
  await assert.rejects(importPrompts({ ...f.options, apply: true }), /created but runtime shortcuts are not confirmed/)
  assert.equal(f.records.size, 12)
})

test('remote plaintext and credential-bearing base URLs are rejected before requests', async () => {
  const { importPrompts } = await importer()
  for (const apiUrl of ['http://example.test/api', 'https://user:password@example.test/api', 'https://example.test/api?token=secret']) {
    const f = fixture()
    await assert.rejects(importPrompts({ ...f.options, apiUrl }))
    assert.equal(f.requests.length, 0)
  }
})
