require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createDefinitionTools, DEFINITION_GUIDANCE } = require('../dist/lib/definition-tools')
const selection = { providerId: 'file.table', connectionKey: 'workspace' }
test('Agent chain inspects, generates and registers using host scope and clears stale source selections', async () => {
  const calls = [], files = {}, source = { kind: 'definition', definitionId: 'definition', versionId: 'version' }
  const runtime = {
    catalog: async scope => { calls.push(scope); return [selection] },
    inspect: async (scope, selected, input) => { assert.deepEqual(selected, selection); assert.deepEqual(input, {}); return { definitionSchema: {}, metadata: {}, instructions: 'Read files' } },
    register: async (scope, input) => { calls.push(scope); assert.deepEqual(input.definition, { path: '/workspace/sales.csv' }); return { source, providerId: selection.providerId } }
  }
  const context = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer', workspaceId: 'workspace', xpertId: 'assistant', runtime: { capabilities: { require: c => c.id === 'platform.workspace.files' ? files : runtime } } }
  let registered = 0
  const tools = createDefinitionTools(context, () => registered++)
  const invoke = (name, input) => tools.find(tool => tool.name === name).invoke(input)
  assert.deepEqual(JSON.parse(await invoke('analytics_definition_connections', {})), [selection])
  await invoke('analytics_definition_inspect', { ...selection, inputJson: '{}' })
  const result = JSON.parse(await invoke('analytics_definition_register', { ...selection, requestId: 'sales', name: 'Sales', definitionJson: '{"path":"/workspace/sales.csv"}' }))
  assert.deepEqual(result.source, source); assert.equal(registered, 1)
  assert.equal(calls[1].actor.userId, 'viewer'); assert.equal(calls[1].files, files)
  await assert.rejects(invoke('analytics_definition_register', { ...selection, requestId: 'sales', name: 'Sales', definitionJson: '{}', workspaceId: 'forged' }))
  assert.match(DEFINITION_GUIDANCE, /Never ask users/)
})

test('bundled example registration uses the packaged CSV, project-scoped identity and pinned receipt', async () => {
  const fs = require('node:fs'), path = require('node:path')
  const fixture = fs.readFileSync(path.join(__dirname, '../skills/live-dashboard/examples/regional-sales/demo.csv'))
  const registrations = [], selected = [], stored = new Map(), writes = []
  let project = 'project-a'
  const files = {
    resolveRuntimeReference: async filePath => ({ catalog: 'projects', projectId: project, filePath }),
    readBuffer: async ref => {
      const value = stored.get(project + ref.filePath)
      if (!value) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return { buffer: value }
    },
    writeRuntimeBuffer: async ({ path, buffer }) => { writes.push(path); stored.set(project + path, buffer) }
  }
  const runtime = {
    catalog: async () => [selection],
    register: async (scope, input) => {
      registrations.push(input)
      return { name: input.name, source: { kind: 'definition', definitionId: 'fixture', versionId: 'v1' }, providerId: 'file.table' }
    }
  }
  const getTool = (projectId) => createDefinitionTools({
    workspaceId: 'workspace', xpertId: 'assistant', organizationId: 'org', projectId,
    runtime: { capabilities: { require: c => c.id === 'platform.workspace.files' ? files : runtime } }
  }, () => {}, (id, receipt) => selected.push([id, receipt?.source])).find(t => t.name === 'analytics_definition_register')
  const args = { exampleId: 'regional-sales' }
  const { convertToOpenAITool } = require('@langchain/core/utils/function_calling')
  const schema = convertToOpenAITool(getTool(project)).function.parameters
  assert.equal(schema.type, 'object')
  const [sample, custom] = schema.anyOf
  assert.deepEqual(Object.keys(sample.properties), ['exampleId'])
  assert.deepEqual(sample.required, ['exampleId'])
  assert.equal(sample.additionalProperties, false)
  assert(custom.required.includes('requestId'))
  await assert.rejects(getTool(project).invoke({ ...args, requestId: 'req-regional-sales-001' }))
  await assert.rejects(getTool().invoke(args), /PROJECT_REQUIRED/)
  await assert.rejects(getTool('other').invoke(args), /PROJECT_MISMATCH/)
  await assert.rejects(getTool(project).invoke({ ...args, definitionJson: '{}' }))
  await assert.rejects(getTool(project).invoke({ exampleId: '../other' }))
  const receipt = JSON.parse(await getTool(project).invoke(args))
  await getTool(project).invoke(args)
  assert.equal(receipt.name, '区域销售 · 演示数据 v1')
  assert.deepEqual(selected.at(-1), ['regional-sales', receipt.source])
  assert.equal(registrations[0].requestId, registrations[1].requestId)
  assert.equal(writes.length, 1)
  assert.deepEqual(stored.get(project + writes[0]), fixture)
  stored.set(project + writes[0], Buffer.from('different'))
  await assert.rejects(getTool(project).invoke(args), /FILE_CHANGED/)
  assert.equal(writes.length, 1)
  project = 'project-b'
  await getTool(project).invoke(args)
  assert.notEqual(registrations.at(-1).requestId, registrations[0].requestId)
})
