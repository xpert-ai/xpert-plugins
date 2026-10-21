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
