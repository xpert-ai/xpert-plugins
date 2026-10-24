import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LanguagesEnum, ModelFeature, WorkflowNodeTypeEnum, type TXpertTeamDraft } from '@xpert-ai/contracts'
import type { AssistantCapabilityApplyContext } from '@xpert-ai/plugin-sdk'
import { SpacesCapabilityProvider } from '../src/capability.js'

function context(): AssistantCapabilityApplyContext {
  return { template: { id: 'xpert-blank-assistant' }, language: LanguagesEnum.English,
    loadTemplate: async () => { throw new Error('Spaces must not load a template or provision resources') },
    draft: { team: { agent: { key: 'primary' } }, nodes: [{ key: 'primary', type: 'agent',
      position: { x: 0, y: 0 }, entity: { key: 'primary', prompt: 'Keep existing instructions.',
        options: { parallelToolCalls: true, middlewares: { order: ['Existing'] } } } }], connections: [] } }
}

const provider = new SpacesCapabilityProvider()

test('registers a localized optional quick capability requiring tool calling', async () => {
  assert.equal(Reflect.getMetadata('ASSISTANT_CAPABILITY_PROVIDER', SpacesCapabilityProvider), 'spaces')
  assert.equal(provider.availableForBlankAssistant, true)
  assert.equal(provider.supportsQuickCreation, true)
  assert.deepEqual(provider.requiredModelFeatures, [ModelFeature.TOOL_CALL])
  assert.equal(provider.label.zh_Hans, '协作空间')
  assert.equal(provider.isEnabled(context().draft), false)
  assert.deepEqual(await provider.check(), { available: true })
})

test('adds the middleware only to the primary Agent without provisioning or changing Project settings', async () => {
  const input = context(), before = structuredClone(input.draft)
  await provider.apply(input)
  assert.equal(provider.isEnabled(input.draft), true)
  assert.deepEqual(input.draft.team, before.team)
  const node = input.draft.nodes[1]
  assert.equal(node.type, 'workflow')
  if (node.type !== 'workflow') throw new Error('Expected middleware')
  assert.equal(node.entity.type, WorkflowNodeTypeEnum.MIDDLEWARE)
  assert.deepEqual(input.draft.connections, [{ key: 'primary/Capability_Spaces', type: 'workflow',
    from: 'primary', to: 'Capability_Spaces', required: true }])
  const agent = input.draft.nodes[0]
  if (agent.type !== 'agent') throw new Error('Expected Agent')
  assert.deepEqual(agent.entity.options?.middlewares?.order, ['Existing', 'Capability_Spaces'])
  assert.equal(agent.entity.options?.parallelToolCalls, false)
  assert.ok(agent.entity.prompt?.startsWith('Keep existing instructions.\n\n'))
  assert.match(agent.entity.prompt!, /Never approve your own proposals/)
  const composed = structuredClone(input.draft)
  await provider.apply(input)
  assert.deepEqual(input.draft, composed)
})

test('preserves an existing primary middleware, including tools, options and connection ports', async () => {
  const input = context()
  await provider.apply(input)
  input.draft.connections[0].to += '/input'
  const node = input.draft.nodes[1]
  if (node.type !== 'workflow' || node.entity.type !== WorkflowNodeTypeEnum.MIDDLEWARE) throw new Error('Expected middleware')
  node.entity.tools = { spaces_list: true, spaces_create_page: false }
  const before = structuredClone(input.draft)
  await provider.apply(input)
  assert.deepEqual(input.draft, before)
})

test('does not adopt another Agent or disconnected node and avoids key collisions', async () => {
  const input = context()
  await provider.apply(input)
  input.draft.connections[0].from = 'secondary'
  assert.equal(provider.isEnabled(input.draft), false)
  const existing = structuredClone(input.draft.nodes[1])
  await provider.apply(input)
  assert.deepEqual(input.draft.nodes[1], existing)
  assert.equal(input.draft.nodes[2].key, 'Capability_Spaces_2')
  assert.equal(input.draft.connections[1].from, 'primary')
})

test('rejects a missing primary Agent without mutating the graph', async () => {
  const input = context()
  input.draft.team.agent = { key: 'missing' }
  const before: TXpertTeamDraft = structuredClone(input.draft)
  await assert.rejects(provider.apply(input), /spaces.invalid_assistant_draft/)
  assert.deepEqual(input.draft, before)
})
