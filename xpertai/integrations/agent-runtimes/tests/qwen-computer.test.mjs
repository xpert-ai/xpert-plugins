import { target, supervisedReceipt, exitEvidence } from './completion-fixture.mjs'
import { managedTarget } from './managed-fixture.mjs'
import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QwenComputerRuntimeStrategy } from '../dist/lib/qwen-computer.strategy.js'
import { RuntimeProfiles } from '../dist/lib/managed-profiles.js'

const workspaceId = '11111111-1111-4111-a111-111111111111'
function fixture() {
  const profiles = new RuntimeProfiles()
  const strategy = new QwenComputerRuntimeStrategy(profiles)
  const receipt = supervisedReceipt({
    invocationId: 'invocation',
    workingDirectory: '/workspace/isolated',
    tool: { id: 'qwen', version: '0.24.7' }
  })
  const calls = [],
    snapshots = []
  let output = {
    state: 'exited',
    exitCode: 0,
    events: [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'intermediate' }] } },
      { type: 'result', subtype: 'success', is_error: false, result: '{"version":1,"summary":"done","items":[]}' }
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
    target: managedTarget('qwen-computer'),
    input: { prompt: 'task', delivery: { mode: 'files', paths: ['report.txt'] } }
  }
  return { strategy, context, request, runner, calls, snapshots, setOutput: (value) => (output = value) }
}

test('JSONL result file is read only after a verified final receipt, then checkpointed before stop', async () => {
  const f = fixture()
  const reference = { version: 1, path: 'output/result.json', sha256: 'a'.repeat(64) }
  const text = '```xpert-task-result-file\n' + JSON.stringify(reference) + '\n```'
  f.runner.readTaskResultFile = async (_, value) => {
    assert.deepEqual(value, reference)
    f.calls.push('result-file')
    return { version: 1, summary: '{"verdict":"indeterminate"}', items: [] }
  }
  const started = await f.strategy.start(f.request, f.context)
  const events = [{ type: 'result', subtype: 'success', is_error: false, result: text }]
  f.setOutput({ state: 'running', events })
  assert.equal((await f.strategy.inspect(started.handle, f.context)).status, 'running')
  assert.equal(f.calls.includes('result-file'), false)
  f.setOutput({ state: 'exited', exitCode: 0, events })
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.text, '{"verdict":"indeterminate"}')
  assert.deepEqual(f.calls.slice(-4), ['result-file', { mode: 'files', paths: ['report.txt'] }, 'checkpoint', 'stop'])
  assert.equal(f.snapshots.at(-1).result.text, result.result.text)
})

test('JSONL invalid file submission fails explicitly without file export or a second launch', async () => {
  const f = fixture()
  f.runner.readTaskResultFile = async () => { throw Error('private contents') }
  const started = await f.strategy.start(f.request, f.context)
  const text = '```xpert-task-result-file\n' + JSON.stringify({ version: 1, path: 'missing.json', sha256: 'a'.repeat(64) }) + '\n```'
  f.setOutput({ state: 'exited', exitCode: 0, events: [{ type: 'result', subtype: 'success', is_error: false, result: text }] })
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'failed')
  assert.match(result.error, /task_result_file_invalid/)
  assert.equal(result.result, undefined)
  assert.deepEqual(f.calls.slice(-2), ['checkpoint', 'stop'])
  assert.equal(f.calls.filter(value => value === 'start').length, 1)
})

test('Computer Qwen checkpoints before dispatch and exports before cleanup; replay only inspects', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  assert.deepEqual(f.calls, ['start', 'checkpoint', 'checkpoint', 'POST'])
  const result = await f.strategy.start({ ...f.request, previous: started.handle }, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.text, 'done')
  assert.equal(result.result.export.status, 'completed')
  assert.deepEqual(f.calls.slice(-3), [{ mode: 'files', paths: ['report.txt'] }, 'checkpoint', 'stop'])
  assert.equal(f.calls.filter((x) => x === 'POST').length, 1)
})

test('Computer Qwen requires exit code and final protocol receipt, never trusts a success sentence', async () => {
  const success = { type: 'result', subtype: 'success', is_error: false, result: 'passed' }
  for (const output of [
    { state: 'exited', exitCode: 0, events: [{ type: 'assistant', result: 'passed' }] },
    { state: 'exited', exitCode: 1, events: [success] },
    { state: 'exited', exitCode: 0, events: [{ ...success, is_error: true }] },
    { state: 'exited', exitCode: 0, events: [{ ...success, subtype: 'error_max_turns' }] },
    { state: 'exited', exitCode: 0, events: [success, success] },
    { state: 'exited', exitCode: 0, events: [{ ...success, parent_tool_use_id: 'child' }] },
    { state: 'exited', exitCode: 0, events: [{ type: 'error' }, success] },
    { state: 'failed', events: [success] }
  ]) {
    const f = fixture()
    const started = await f.strategy.start(f.request, f.context)
    f.setOutput(output)
    assert.equal((await f.strategy.inspect(started.handle, f.context)).status, 'failed')
  }
})

test('Qwen preserves recovered permission denials as diagnostics without overriding a successful final receipt', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  f.setOutput({
    state: 'exited',
    exitCode: 0,
    events: [
      { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'permission denied' }] } },
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'recovered and verified',
        permission_denials: [{ tool_name: 'run_shell_command', tool_input: { command: 'mkdir -p qa' } }]
      }
    ]
  })
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.handle.metadata.completion.permissionDenials, 1)
  assert.equal(result.handle.metadata.completion.command, 'mkdir -p qa')
  assert.equal(result.handle.metadata.completion.exitCode, 0)
  assert.equal(f.snapshots.at(-1).handle.metadata.completion.code, 'completed')
})

test('Qwen reports permission failure details and preserves them before guest cleanup', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  f.setOutput({
    state: 'exited',
    exitCode: 1,
    events: [
      {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        result: '',
        permission_denials: [
          { tool_name: 'run_shell_command', tool_input: { command: 'mkdir -p qa; TOKEN=private-value' } }
        ]
      }
    ]
  })
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'failed')
  assert.match(result.error, /permission_denied.*run_shell_command.*mkdir/)
  assert.match(result.error, /exit code 1/)
  assert.doesNotMatch(JSON.stringify(result), /private-value/)
  assert.equal(result.handle.metadata.completion.finalEventSubtype, 'error_during_execution')
  assert.equal(f.snapshots.at(-1).handle.metadata.completion.code, 'permission_denied')
  assert.deepEqual(f.calls.slice(-2), ['checkpoint', 'stop'])
})

test('Qwen completion diagnostics distinguish protocol, receipt, transport and process errors', async () => {
  for (const [output, code] of [
    [{ state: 'exited', exitCode: 0, events: [{}] }, 'protocol_invalid'],
    [{ state: 'exited', exitCode: 0, events: [] }, 'missing_final_result'],
    [{ state: 'exited', exitCode: 7, events: [] }, 'process_exit_nonzero'],
    [{ state: 'exited', events: [] }, 'missing_exit_code'],
    [{ state: 'failed', error: 'CLI output unavailable or exceeded the limit', events: [] }, 'process_failed'],
    [
      {
        state: 'exited',
        exitCode: 0,
        events: [{ type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['Turn budget exhausted'] }]
      },
      'cli_error'
    ]
  ]) {
    const f = fixture()
    const started = await f.strategy.start(f.request, f.context)
    f.setOutput(output)
    const result = await f.strategy.inspect(started.handle, f.context)
    assert.equal(result.status, 'failed')
    assert.equal(result.handle.metadata.completion.code, code)
    assert.match(result.error, new RegExp(code))
    if (code === 'cli_error') assert.match(result.error, /Turn budget exhausted/)
  }
})

test('Qwen does not hide a final model failure behind an earlier permission denial', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  f.setOutput({
    state: 'exited',
    exitCode: 1,
    events: [
      {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['Model request quota exhausted'],
        permission_denials: [{ tool_name: 'run_shell_command', tool_input: { command: 'mkdir -p qa' } }]
      }
    ]
  })
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.match(result.error, /cli_error.*Model request quota exhausted/)
  assert.equal(result.handle.metadata.completion.permissionDenials, 1)
})

test('Computer Qwen keeps uncertain launches unknown and checks workspace/profile before access', async () => {
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

test('Qwen returns a recoverable failure when the runner and all descendants have exited without a task result', async () => {
  for (const exitCode of [0, 137, undefined]) {
    const f = fixture()
    const started = await f.strategy.start(f.request, f.context)
    f.runner.inspect = async () => ({
      state: 'exited',
      exitCode,
      completion: exitEvidence(started.handle.runner)
    })
    const result = await f.strategy.inspect(started.handle, f.context)
    assert.equal(result.status, 'failed')
    assert.equal(result.controlEvidence.outcome, 'failed')
    assert.equal(result.result, undefined)
    assert.equal(result.handle.metadata.completion.code, 'runner_unavailable')
    assert.equal(f.calls.filter((x) => x === 'POST').length, 1)
    assert.equal(f.calls.includes('GET'), false)
    assert.equal(f.calls.includes('stop'), false)
  }
})

test('Qwen never settles an unavailable runner without matching descendant completion evidence', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  const valid = exitEvidence(started.handle.runner)
  for (const process of [
    { state: 'unknown', completion: valid },
    { state: 'exited' },
    { state: 'exited', completion: { ...valid, processId: 'different-process' } },
    { state: 'exited', completion: { ...valid, coverage: 'parent' } },
    { state: 'exited', completion: { ...valid, environment: { ...valid.environment, instanceId: 'replaced' } } }
  ]) {
    f.runner.inspect = async () => process
    const result = await f.strategy.inspect(started.handle, f.context)
    assert.equal(result.status, 'unknown')
    assert.equal(result.controlEvidence, undefined)
  }
  assert.equal(f.calls.filter((x) => x === 'POST').length, 1)
})

test('a truncated Qwen result is persisted as failure and only settles after descendant cleanup', async () => {
  for (const confirmed of [true, false]) {
    const f = fixture()
    const started = await f.strategy.start(f.request, f.context)
    f.setOutput({ state: 'exited', exitCode: 0, previewTruncated: true, events: [] })
    f.runner.stop = async () => ({
      state: 'exited',
      ...(confirmed ? { completion: exitEvidence(started.handle.runner) } : {})
    })
    const result = await f.strategy.inspect(started.handle, f.context)
    assert.equal(f.snapshots.at(-1).status, 'failed')
    assert.equal(f.snapshots.at(-1).handle.metadata.completion.code, 'activity_incomplete')
    assert.equal(result.status, confirmed ? 'failed' : 'unknown')
    assert.equal(result.result, undefined)
    assert.equal(result.controlEvidence?.outcome, confirmed ? 'failed' : undefined)
    assert.equal(f.calls.filter((x) => x === 'POST').length, 1)
  }
})

test('Computer Qwen leaves runner available when durable result checkpoint fails', async () => {
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

test('Computer Qwen cancellation needs confirmed process exit; export failure preserves successful work', async () => {
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
  assert.equal(f.strategy.capabilities.executionTools[0].id, 'qwen')
})

test('Qwen recovery and cancellation refuse a receipt for a different tool', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  const handle = { ...started.handle, runner: { ...started.handle.runner, tool: { id: 'codex', version: '0.159.2' } } }
  await assert.rejects(f.strategy.inspect(handle, f.context))
  await assert.rejects(f.strategy.cancel(handle, f.context))
  assert.equal(f.calls.includes('stop'), false)
})

test('completed protocol with missing descendant evidence remains unknown', async () => {
  const f = fixture(),
    started = await f.strategy.start(f.request, f.context)
  f.runner.stop = async () => ({ state: 'exited' })
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'unknown')
  assert.equal(result.result.text, 'done')
  assert.equal((await f.strategy.cancel(started.handle, f.context)).status, 'unknown')
  assert.equal(f.calls.filter((x) => x === 'POST').length, 1)
})

test('recovery after result persistence reconciles the original runner without resending', async () => {
  const f = fixture(),
    started = await f.strategy.start(f.request, f.context)
  f.context.settlement = { status: 'succeeded', result: { text: 'durable result' } }
  f.runner.inspect = async () => ({ state: 'exited' })
  f.runner.request = async () => {
    throw Error('must not resend or read destroyed service')
  }
  const recovered = await f.strategy.start({ ...f.request, previous: started.handle }, f.context)
  assert.equal(recovered.status, 'succeeded')
  assert.equal(recovered.result.text, 'durable result')
  assert.equal(f.calls.filter((x) => x === 'POST').length, 1)
})
