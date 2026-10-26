import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import plugin from '../dist/index.js'
import { RuntimeProfiles } from '../dist/lib/managed-profiles.js'
import { CodexComputerRuntimeStrategy } from '../dist/lib/codex-computer.strategy.js'
import { AgentInvocationMiddleware } from '../dist/lib/invocation.middleware.js'

const workspaceId = '11111111-1111-4111-a111-111111111111'
const context = {
  scope: { workspaceId },
  capabilities: {
    require: () => {
      throw Error('unexpected launch')
    }
  }
}
const request = {
  target: {
    provider: 'codex-computer',
    reference: 'managed-codex-computer',
    configuration: {
      profileVersion: '1',
      executionEnvironment: { type: 'computer' },
      managedRuntime: { type: 'builtin', version: '1' }
    }
  },
  input: { prompt: 'test' }
}

test('empty installation has an internal Computer preset and no generic configuration form', () => {
  assert.equal(plugin.config, undefined)
  const profiles = new RuntimeProfiles()
  const strategy = new CodexComputerRuntimeStrategy(profiles)
  assert.equal(strategy.managedProfiles[0].reference, 'managed-codex-computer')
  assert.equal(profiles.profile(request, context, 'codex-computer').executionEnvironment, 'computer')
  assert.throws(() =>
    profiles.profile({ ...request, target: { ...request.target, configuration: {} } }, context, 'codex-computer')
  )
  assert.throws(() => profiles.profile(request, { ...context, scope: {} }, 'codex-computer'))
  assert.throws(() =>
    profiles.profile(
      {
        ...request,
        target: {
          ...request.target,
          configuration: {
            ...request.target.configuration,
            managedRuntime: { type: 'builtin', version: '2' }
          }
        }
      },
      context,
      'codex-computer'
    )
  )
})

test('plugin registration ignores old configuration and old targets are rejected', () => {
  const registration = plugin.register({ config: { profiles: [{ id: 'old', command: 'untrusted' }] } })
  assert.equal(registration.providers, undefined)
  const profiles = new RuntimeProfiles()
  assert.throws(() =>
    profiles.profile(
      { ...request, target: { ...request.target, reference: 'old', configuration: { profileVersion: '7' } } },
      context,
      'codex-computer'
    )
  )
  assert.throws(() =>
    profiles.profile(
      {
        ...request,
        target: {
          ...request.target,
          configuration: {
            ...request.target.configuration,
            managedRuntime: { type: 'legacy', version: '1' }
          }
        }
      },
      context,
      'codex-computer'
    )
  )
})

test('a persisted built-in receipt is recoverable only in its original workspace', () => {
  const profiles = new RuntimeProfiles()
  const handle = {
    metadata: {
      workspaceId,
      profileId: request.target.reference,
      profileVersion: '1',
      managedRuntime: { type: 'builtin', version: '1' }
    }
  }
  assert.equal(profiles.receiptProfile(handle, context, 'codex-computer').id, request.target.reference)
  assert.equal(profiles.receiptProfile(handle, context, 'qwen-computer'), undefined)
  assert.equal(
    profiles.receiptProfile({ metadata: { ...handle.metadata, managedRuntime: undefined } }, context, 'codex-computer'),
    undefined
  )
})

test('zero-option middleware discovers runtimes, then resolves a binding only when its tool is called', async () => {
  const calls = []
  const selection = { provider: 'codex-computer', reference: 'managed-codex-computer' }
  const target = { bindingId: workspaceId }
  const task = { id: workspaceId, status: 'succeeded', request: {}, result: { text: 'done' } }
  const api = {
    listManaged: async () => {
      calls.push('list')
      return [{ ...selection, title: 'Codex', toolName: 'delegate_codex', description: 'Code task' }]
    },
    resolveManaged: async (value) => {
      assert.deepEqual(value, selection)
      calls.push('resolve')
      return target
    },
    start: async (value) => {
      assert.deepEqual(value.target, target)
      calls.push('start')
      return task
    },
    awaitResult: async () => task
  }
  const middleware = await new AgentInvocationMiddleware().createMiddleware(
    {},
    { runtime: { capabilities: { require: () => api } } }
  )
  assert.deepEqual(calls, [])
  assert.deepEqual(
    middleware.tools.map((tool) => tool.name),
    ['delegate_task', 'task_status', 'task_cancel']
  )
  await middleware.tools[0].invoke({ prompt: 'test' }, { configurable: { tool_call_id: 'one' } })
  assert.deepEqual(calls, ['list', 'resolve', 'start'])
  api.resolveManaged = async () => {
    throw Error('revoked')
  }
  await assert.rejects(
    middleware.tools[0].invoke({ prompt: 'test' }, { configurable: { tool_call_id: 'two' } }),
    /revoked/
  )
  assert.equal(calls.filter((call) => call === 'start').length, 1)
})
