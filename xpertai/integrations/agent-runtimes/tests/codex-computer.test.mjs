import { managedTarget } from './managed-fixture.mjs'
import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CodexComputerRuntimeStrategy } from '../dist/lib/codex-computer.strategy.js'
import { RuntimeProfiles } from '../dist/lib/managed-profiles.js'

const workspaceId = '11111111-1111-4111-a111-111111111111'
function fixture() {
  const profiles = new RuntimeProfiles()
  const strategy = new CodexComputerRuntimeStrategy(profiles)
  const receipt = {
    version: 2,
    supervision: 1,
    invocationId: 'invocation',
    environment: { type: 'computer', environmentId: 'environment', instanceId: 'instance' },
    processId: 'process',
    grantId: 'grant',
    executionDirectory: '/workspace/isolated',
    workingDirectory: '/workspace/isolated',
    tool: { id: 'codex', version: '0.159.2' }
  }
  const calls = [],
    snapshots = []
  let output = {
    state: 'exited',
    exitCode: 0,
    events: [
      { type: 'item.completed', item: { type: 'agent_message', text: 'intermediate' } },
      { type: 'item.completed', item: { type: 'agent_message', text: '{"version":1,"summary":"done","items":[]}' } },
      { type: 'turn.completed' }
    ]
  }
  const runner = {
    start: async (_, checkpoint) => {
      calls.push('start')
      await checkpoint(receipt)
      return receipt
    },
    request: async (_, request) => {
      calls.push(request.method)
      return output
    },
    inspect: async () => ({ state: 'running' }),
    stop: async () => {
      calls.push('stop')
      return { state: 'exited', completion: {
        version: 1, coverage: 'descendants', invocationId: receipt.invocationId,
        environment: receipt.environment, processId: receipt.processId
      } }
    },
    collectArtifacts: async (_, selection) => {
      calls.push(selection)
      return [{ id: 'artifact', versionId: 'version', paths: ['report.txt'] }]
    }
  }
  const context = {
    invocationId: 'invocation',
    executionTarget: { version: 1, kind: 'provider', generation: '22222222-2222-4222-a222-222222222222' },
    scope: { workspaceId },
    capabilities: { require: () => runner },
    checkpoint: async (value) => {
      calls.push('checkpoint')
      snapshots.push(structuredClone(value))
    }
  }
  const request = {
    target: managedTarget('codex-computer'),
    input: { prompt: 'task', delivery: { mode: 'files', paths: ['report.txt'] } }
  }
  return { strategy, context, request, runner, calls, snapshots, setOutput: (value) => (output = value) }
}

test('Computer Codex checkpoints before dispatch and exports before cleanup; replay only inspects', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  assert.deepEqual(f.calls, ['start', 'checkpoint', 'checkpoint', 'POST'])
  const result = await f.strategy.start({ ...f.request, previous: started.handle }, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.text, 'done')
  assert.equal(result.result.export.status, 'completed')
  assert.deepEqual(f.calls.slice(-4), [{ mode: 'files', paths: ['report.txt'] }, 'checkpoint', 'stop', 'stop'])
  assert.equal(f.calls.filter((x) => x === 'POST').length, 1)
})

test('Computer Codex requires exit code and final protocol receipt, never trusts a success sentence', async () => {
  for (const output of [
    {
      state: 'exited',
      exitCode: 0,
      events: [{ type: 'item.completed', item: { type: 'agent_message', text: 'passed' } }]
    },
    { state: 'exited', exitCode: 1, events: [{ type: 'turn.completed' }] },
    { state: 'failed', events: [] }
  ]) {
    const f = fixture()
    const started = await f.strategy.start(f.request, f.context)
    f.setOutput(output)
    assert.equal((await f.strategy.inspect(started.handle, f.context)).status, 'failed')
  }
})

test('Computer Codex keeps uncertain launches unknown and checks workspace/profile before access', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  f.setOutput({ state: 'idle', events: [] })
  assert.equal((await f.strategy.inspect(started.handle, f.context)).status, 'unknown')
  await assert.rejects(f.strategy.inspect(started.handle, { ...f.context, scope: { workspaceId: 'other' } }))
  await assert.rejects(
    f.strategy.inspect({ ...started.handle, metadata: { ...started.handle.metadata, profileVersion: '2' } }, f.context)
  )
  assert.equal(f.calls.filter((x) => x === 'POST').length, 1)
})

test('Computer Codex persists the concrete CLI failure before cleanup and accepts recovered command failures', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  f.setOutput({
    state: 'exited',
    exitCode: 1,
    events: [{ type: 'turn.failed', error: { message: 'Model request failed: Bearer private-token' } }]
  })
  const failure = await f.strategy.inspect(started.handle, f.context)
  assert.match(failure.error, /cli_error.*Model request failed/)
  assert.doesNotMatch(failure.error, /private-token/)
  assert.equal(f.snapshots.at(-1).handle.metadata.completion.finalEventType, 'turn.failed')
  assert.deepEqual(f.calls.slice(-3), ['checkpoint', 'stop', 'stop'])

  const recovered = fixture()
  const running = await recovered.strategy.start(recovered.request, recovered.context)
  recovered.setOutput({
    state: 'exited',
    exitCode: 0,
    events: [
      { type: 'item.completed', item: { type: 'command_execution', status: 'failed', exit_code: 1 } },
      { type: 'item.completed', item: { type: 'agent_message', text: 'Fixed and verified.' } },
      { type: 'turn.completed' }
    ]
  })
  assert.equal((await recovered.strategy.inspect(running.handle, recovered.context)).status, 'succeeded')
})

test('Computer Codex leaves runner available when durable result checkpoint fails', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  await assert.rejects(
    f.strategy.inspect(started.handle, {
      ...f.context,
      checkpoint: async () => {
        throw Error('offline')
      }
    })
  )
  assert.equal(f.calls.includes('stop'), false)
})

test('Computer Codex cancellation needs confirmed process exit; export failure preserves successful work', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  f.runner.collectArtifacts = async () => {
    throw Error('denied')
  }
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.export.status, 'failed')
  f.runner.stop = async () => ({ state: 'unknown' })
  assert.equal((await f.strategy.cancel(started.handle, f.context)).status, 'unknown')
})

test('Computer capability declarations do not inherit App Server approvals or process-only recovery', () => {
  const f = fixture()
  assert.equal(f.strategy.capabilities.interactions, false)
  assert.equal(f.strategy.capabilities.recovery, 'session')
  assert.equal(f.strategy.capabilities.executionTools[0].id, 'codex')
  assert.equal(f.strategy.capabilities.completionEvidence, 2)
  assert.equal(f.strategy.capabilities.idempotentCancellation, true)
})

test('Computer Codex cancellation reports bound descendant completion and can retry stop', async () => {
  const f = fixture()
  const { handle } = await f.strategy.start(f.request, f.context)
  const stop = f.runner.stop
  f.runner.stop = async () => ({ state: 'stopping' })
  assert.equal((await f.strategy.cancel(handle, f.context)).status, 'cancelling')
  f.runner.stop = stop
  const result = await f.strategy.cancel(handle, f.context)
  assert.equal(result.status, 'cancelled')
  assert.equal(result.controlEvidence.outcome, 'cancelled')
  assert.equal(result.controlEvidence.subject.id, f.context.invocationId)
  assert.deepEqual(result.controlEvidence.target, f.context.executionTarget)
  assert.equal(result.controlEvidence.receiptKey, handle.runner.processId)
  assert.equal((await f.strategy.cancel(handle, f.context)).status, 'cancelled')
})

test('Computer Codex rejects missing or mismatched descendant stop evidence', async () => {
  const f = fixture()
  const { handle } = await f.strategy.start(f.request, f.context)
  const exited = await f.runner.stop()
  for (const completion of [undefined,
    { ...exited.completion, coverage: 'process' },
    { ...exited.completion, invocationId: 'other' },
    { ...exited.completion, processId: 'other' },
    { ...exited.completion, environment: { ...exited.completion.environment, instanceId: 'replacement' } }
  ]) {
    f.runner.stop = async () => ({ state: 'exited', completion })
    const result = await f.strategy.cancel(handle, f.context)
    assert.equal(result.status, 'cancelling')
    assert.equal(result.controlEvidence, undefined)
  }
})

test('Computer Codex recovers checkpointed results without replaying or reading a stopped service', async () => {
  const f = fixture()
  const { handle } = await f.strategy.start(f.request, f.context)
  f.runner.request = async () => { throw Error('service already exited') }
  const settlement = { status: 'succeeded', result: { text: 'verified result' } }
  const result = await f.strategy.inspect(handle, { ...f.context, settlement })
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.text, 'verified result')
  assert.equal(result.controlEvidence.outcome, 'succeeded')
  assert.deepEqual(result.controlEvidence.target, f.context.executionTarget)
  assert.equal(f.calls.filter(x => x === 'POST').length, 1)
})
