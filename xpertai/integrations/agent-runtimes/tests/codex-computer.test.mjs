import { target, supervisedReceipt, exitEvidence } from './completion-fixture.mjs'
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
  const receipt = supervisedReceipt({
    version: 2,
    invocationId: 'invocation',
    environment: { type: 'computer', environmentId: 'environment', instanceId: 'instance' },
    processId: 'process',
    grantId: 'grant',
    executionDirectory: '/workspace/isolated',
    workingDirectory: '/workspace/isolated',
    tool: { id: 'codex', version: '0.159.2' }
  })
  const calls = [],
    snapshots = []
  let output = {
    state: 'exited',
    exitCode: 0,
    events: [
      { type: 'item.completed', item: { type: 'agent_message', text: 'intermediate' } },
      { type: 'item.completed', item: { type: 'agent_message', text: 'done' } },
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
      return { state: 'exited', completion: exitEvidence(receipt) }
    },
    collectArtifacts: async (_, selection) => {
      calls.push(selection)
      return [{ id: 'artifact', versionId: 'version', paths: ['report.txt'] }]
    }
  }
  const context = {
    executionTarget: target,
    invocationId: 'invocation',
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

test('Computer Codex can finish an operation without a report or file export', async () => {
  const f = fixture()
  delete f.request.input.delivery
  const started = await f.strategy.start(f.request, f.context)
  f.setOutput({ state: 'exited', exitCode: 0, events: [{ type: 'turn.completed' }] })
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.text, '')
  assert.equal(result.result.report, undefined)
  assert.deepEqual(result.result.export, { mode: 'none', status: 'not_requested' })
  assert.ok(f.calls.every(call => typeof call === 'string'))
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

test('Computer Codex accepts a recovered protocol error only after typed completion and exit zero', async () => {
  const f = fixture()
  const { handle } = await f.strategy.start(f.request, f.context)
  f.setOutput({
    state: 'exited',
    exitCode: 0,
    events: [
      { type: 'error', message: 'An earlier transport attempt failed.' },
      { type: 'error', message: 'A different transient diagnostic.' },
      { type: 'item.completed', item: { type: 'agent_message', text: 'Review requires changes.' } },
      { type: 'turn.completed' }
    ]
  })
  const result = await f.strategy.inspect(handle, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.text, 'Review requires changes.')
  assert.equal(result.result.export.status, 'completed')
  assert.equal(f.snapshots.at(-1).handle.metadata.completion.finalEventType, 'turn.completed')
  assert.equal(f.calls.filter(call => call === 'POST').length, 1)
})

test('Computer Codex does not hide terminal errors behind an earlier or unrelated completion', async () => {
  for (const events of [
    [{ type: 'error', message: 'Connection failed.' }],
    [{ type: 'error', message: 'Connection failed.' },
      { type: 'item.completed', item: { type: 'agent_message', text: 'Done!' } }],
    [{ type: 'turn.completed' }, { type: 'error', message: 'Finalization failed.' }],
    [{ type: 'turn.failed', error: { message: 'Turn failed.' } }, { type: 'turn.completed' }],
    [{ type: 'turn.completed' }, { type: 'turn.failed', error: { message: 'Turn failed.' } }]
  ]) {
    const f = fixture()
    const { handle } = await f.strategy.start(f.request, f.context)
    f.setOutput({ state: 'exited', exitCode: 0, events })
    const result = await f.strategy.inspect(handle, f.context)
    assert.equal(result.status, 'failed')
    assert.match(result.error, /cli_error/)
    assert.equal(result.result, undefined)
    assert.equal(f.calls.some(call => typeof call === 'object'), false)
  }
})

test('Computer Codex still rejects nonzero exits after a recovered error and typed completion', async () => {
  const f = fixture()
  const { handle } = await f.strategy.start(f.request, f.context)
  f.setOutput({
    state: 'exited', exitCode: 7,
    events: [{ type: 'error', message: 'Retrying.' }, { type: 'turn.completed' }]
  })
  const result = await f.strategy.inspect(handle, f.context)
  assert.equal(result.status, 'failed')
  assert.match(result.error, /process_exit_nonzero.*7/)
  assert.equal(result.result, undefined)
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
  assert.equal(result.controlEvidence.receiptKey, `runner:${handle.runner.processId}`)
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
    assert.equal(result.status, 'unknown')
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

test('Computer Codex cancellation preserves an already checkpointed outcome in completion evidence', async () => {
  const f = fixture()
  const { handle } = await f.strategy.start(f.request, f.context)
  const result = await f.strategy.cancel(handle, {
    ...f.context,
    settlement: { status: 'succeeded', result: { text: 'verified result' } }
  })
  assert.equal(result.status, 'cancelled')
  assert.equal(result.controlEvidence.outcome, 'succeeded')
  assert.deepEqual(result.controlEvidence.target, f.context.executionTarget)
})

test('Computer Codex exports a report-only selection without restarting the task', async () => {
  const f = fixture()
  f.request.input.delivery = { mode: 'files', reportPath: 'output/report.md' }
  f.runner.readTaskReportFile = async (receipt, path) => {
    assert.equal(path, 'output/report.md')
    return { text: '# Result\nTests passed.', sha256: 'computed-by-reader' }
  }
  const { handle } = await f.strategy.start(f.request, f.context)
  const result = await f.strategy.inspect(handle, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.report.status, 'completed')
  assert.equal(result.result.export.status, 'completed')
  assert.deepEqual(f.calls.find(call => typeof call === 'object'), { mode: 'files', paths: ['output/report.md'] })
  assert.equal(f.calls.filter(call => call === 'POST').length, 1)
})

function pagedFixture() {
  const f = fixture()
  f.setOutput({ state: 'exited', exitCode: 0, previewTruncated: true, events: [] })
  const request = f.runner.request
  const page = { sourceId: '00000000-0000-4000-8000-000000000001',
    events: [{ type: 'turn.completed' }], positions: [0], next: 100, hasMore: false, gap: false }
  f.runner.request = async (receipt, input) => input.path.startsWith('/events/') ? page : request(receipt, input)
  const batches = []
  f.context.activity = {
    readCheckpoint: async () => ({ seq: 0 }),
    append: async batch => { batches.push(batch); return { seq: 1, sourceCursor: batch.sourceCursor } }
  }
  return { ...f, page, batches }
}

test('a transient final-log read failure remains collectable without cleanup or another launch', async () => {
  const f = pagedFixture()
  const { handle } = await f.strategy.start(f.request, f.context)
  const request = f.runner.request
  f.runner.request = async (receipt, input) => {
    if (input.path.startsWith('/events/')) throw Error('private transport details')
    return request(receipt, input)
  }
  const pending = await f.strategy.inspect(handle, f.context)
  assert.equal(pending.status, 'unknown')
  assert.match(pending.error, /activity_unavailable/)
  assert.doesNotMatch(pending.error, /private transport/)
  assert.equal(f.calls.includes('stop'), false)
  assert.equal(f.snapshots.some(s => s.status === 'failed'), false)
  assert.equal(f.batches.some(b => b.complete), false)
  f.runner.request = request
  const recovered = await f.strategy.inspect(pending.handle, f.context)
  assert.equal(recovered.status, 'succeeded')
  assert.equal(recovered.error, undefined)
  assert.equal(f.calls.filter(call => call === 'POST').length, 1)
})

test('full protocol collection is independent of public activity storage', async () => {
  for (const storage of ['absent', 'offline']) {
    const f = pagedFixture()
    const { handle } = await f.strategy.start(f.request, f.context)
    if (storage === 'absent') delete f.context.activity
    else f.context.activity.append = async () => { throw Error('storage offline') }
    assert.equal((await f.strategy.inspect(handle, f.context)).status, 'succeeded')
  }
})

test('verified gaps and absent final events still fail after exit zero', async () => {
  for (const kind of ['truncated', 'missing-final', 'invalid-page']) {
    const f = pagedFixture()
    const { handle } = await f.strategy.start(f.request, f.context)
    if (kind === 'truncated') f.page.gap = true
    if (kind === 'missing-final') f.page.events = [{ type: 'item.completed', item: { type: 'agent_message', text: 'Done!' } }]
    if (kind === 'invalid-page') f.page.next = -1
    const result = await f.strategy.inspect(handle, f.context)
    assert.equal(result.status, 'failed')
    assert.match(result.error, kind === 'missing-final' ? /missing_final_result/ : /activity_incomplete/)
    assert.equal(result.result, undefined)
  }
})

test('a nonzero process exit is attributed to execution even if its protocol log is unavailable', async () => {
  const f = pagedFixture()
  const { handle } = await f.strategy.start(f.request, f.context)
  f.setOutput({ state: 'exited', exitCode: 7, previewTruncated: true, events: [] })
  const request = f.runner.request
  f.runner.request = async (receipt, input) => {
    if (input.path.startsWith('/events/')) throw Error('offline')
    return request(receipt, input)
  }
  const result = await f.strategy.inspect(handle, f.context)
  assert.equal(result.status, 'failed')
  assert.match(result.error, /process_exit_nonzero.*7/)
})
