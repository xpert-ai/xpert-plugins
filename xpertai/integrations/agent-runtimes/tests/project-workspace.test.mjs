import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withProjectWorkspaceContext } from '../dist/lib/project-workspace.js'
import { agentPrompt } from '../dist/lib/input.js'
import { RuntimeProfiles } from '../dist/lib/managed-profiles.js'
import { QwenComputerRuntimeStrategy } from '../dist/lib/qwen-computer.strategy.js'
import { OpenCodeRuntimeStrategy } from '../dist/lib/opencode.strategy.js'
import { managedTarget, directTarget, directCapabilities } from './managed-fixture.mjs'
import { target, supervisedReceipt } from './completion-fixture.mjs'

const workspaceId = '11111111-1111-4111-a111-111111111111'
function task(purpose = { type: 'implementation' }) {
  return {
    projectId: workspaceId, projectTaskId: workspaceId, taskExecutionId: workspaceId,
    specification: { digest: 'sha256:' + 'a'.repeat(64), specification: {
      version: 1, title: 'Check totals', requirements: ['Totals match'], steps: []
    } },
    purpose
  }
}
function receipt(environment = 'computer') {
  return supervisedReceipt({
    version: 2, grantId: 'grant',
    environment: { type: environment, environmentId: 'environment', instanceId: 'generation' },
    workingDirectory: '/workspace/host project', executionDirectory: '/workspace/private-run',
    tool: { id: 'qwen', version: '0.24.7' }
  })
}
const input = {
  prompt: 'Implement the task specification: totals must match. Keep original receipt data.',
  delivery: { mode: 'files', paths: ['report.txt'] },
  parameters: { workingDirectory: '/caller/claim' },
  context: { workingDirectory: '/another/claim' }
}

for (const environment of ['computer', 'sandbox']) {
  test(`workspace instructions use the host receipt, independent of ${environment} metadata`, () => {
    const original = structuredClone(input)
    const value = withProjectWorkspaceContext(input, { projectTask: task() }, receipt(environment))
    assert.match(value.prompt, /Assigned project working directory \(JSON string\): "\/workspace\/host project"/)
    assert.match(value.prompt, /project\.md when present/)
    assert.match(value.prompt, /installed skills under skills\//)
    assert.ok(value.prompt.endsWith(input.prompt))
    assert.doesNotMatch(value.prompt, /private-run|caller\/claim|another\/claim/)
    assert.equal(value.delivery, input.delivery)
    assert.equal(value.parameters, input.parameters)
    assert.equal(value.context, input.context)
    assert.deepEqual(input, original)
  })
}

test('no host receipt or explicit implementation purpose leaves input unchanged', () => {
  assert.equal(withProjectWorkspaceContext(input, { projectTask: task() }), input)
  assert.equal(withProjectWorkspaceContext(input, { scope: { projectId: workspaceId } }, receipt()), input)
  for (const mode of ['evidence_only', 'execution'])
    assert.equal(withProjectWorkspaceContext(input, { projectTask: task({ type: 'review', mode }) }, receipt()), input)
})

for (const provider of ['qwen-computer', 'opencode']) {
  for (const purpose of ['implementation', 'review', undefined]) {
    test(`${provider} sends workspace context only for implementation and preserves the result protocol (${purpose})`, async () => {
      const events = [], prompts = []
      const owned = receipt()
      const runner = {
        async start(id, checkpoint) {
          assert.equal(id, owned.invocationId)
          events.push('start')
          await checkpoint(owned)
          return owned
        },
        async request(value, request) {
          assert.equal(value, owned)
          if (request.path === '/session') return { id: 'session' }
          events.push('prompt')
          prompts.push(request.body.prompt ?? request.body.parts[0].text)
        }
      }
      const context = {
        executionTarget: target, invocationId: owned.invocationId, scope: { workspaceId },
        ...(purpose ? { projectTask: task({ type: purpose }) } : {}),
        capabilities: { require: () => runner },
        checkpoint: async () => { events.push('checkpoint') }
      }
      const Strategy = provider === 'opencode' ? OpenCodeRuntimeStrategy : QwenComputerRuntimeStrategy
      const request = { operationId: owned.invocationId, target: managedTarget(provider), input }
      await new Strategy(new RuntimeProfiles()).start(request, context)
      assert.deepEqual(events, ['start', 'checkpoint', 'checkpoint', 'prompt'])
      assert.equal(prompts.length, 1)
      assert.equal(prompts[0].includes('Assigned project working directory'), purpose === 'implementation')
      assert.ok(prompts[0].includes(input.prompt))
      assert.match(prompts[0], /xpert-task-result/)
      if (purpose !== 'implementation') assert.equal(prompts[0], agentPrompt(input))
      assert.equal(request.input, input)
    })
  }
}

test('remote OpenCode does not infer a local runner workspace from project scope', async (t) => {
  const prompts = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).searchParams.get('directory'), '/remote/workspace')
    if (url.pathname.endsWith('/prompt_async')) prompts.push(JSON.parse(options.body).parts[0].text)
    return new Response(JSON.stringify(url.pathname.endsWith('/session') ? { id: 'session' } : null))
  })
  const context = {
    executionTarget: target, invocationId: 'invocation', scope: { workspaceId }, projectTask: task(),
    capabilities: directCapabilities('opencode', workspaceId, '/remote/workspace', { serverUrl: 'http://runtime.invalid' }),
    checkpoint: async () => {}
  }
  await new OpenCodeRuntimeStrategy(new RuntimeProfiles()).start({
    operationId: 'invocation', target: directTarget('opencode'), input
  }, context)
  assert.deepEqual(prompts, [agentPrompt(input)])
})
