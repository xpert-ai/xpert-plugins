import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QwenComputerRuntimeStrategy } from '../dist/lib/qwen-computer.strategy.js'
import { ProcessRuntime } from '../dist/lib/process-runtime.js'
import { ConfigSchema } from '../dist/lib/config.js'

const workspaceId = '11111111-1111-4111-a111-111111111111'
function fixture() {
  const profiles = new ProcessRuntime(ConfigSchema.parse({ profiles: [{ id: 'computer-qwen', version: '1', provider: 'qwen-computer', executionEnvironment: 'computer', workspaceIds: [workspaceId] }] }))
  const strategy = new QwenComputerRuntimeStrategy(profiles)
  const receipt = { invocationId: 'invocation', workingDirectory: '/workspace/isolated', tool: { id: 'qwen', version: '0.24.7' } }
  const calls = [], snapshots = []
  let output = { state: 'exited', exitCode: 0, events: [
    { type: 'assistant', message: { content: [{ type: 'text', text: 'intermediate' }] } },
    { type: 'result', subtype: 'success', is_error: false, result: '{"version":1,"summary":"done","items":[]}' }
  ] }
  const runner = {
    start: async (_, checkpoint) => { calls.push('start'); await checkpoint(receipt); return receipt },
    request: async (_, request) => { calls.push(request.method); return output },
    inspect: async () => ({ state: 'running' }),
    stop: async () => { calls.push('stop'); return { state: 'exited' } },
    collectArtifacts: async (_, selection) => { calls.push(selection); return [{ id: 'artifact', versionId: 'version', paths: ['report.txt'] }] }
  }
  const context = { invocationId: 'invocation', scope: { workspaceId }, capabilities: { require: () => runner }, checkpoint: async value => { calls.push('checkpoint'); snapshots.push(structuredClone(value)) } }
  const request = { target: { provider: 'qwen-computer', reference: 'computer-qwen', configuration: { profileVersion: '1' } }, input: { prompt: 'task', delivery: { mode: 'files', paths: ['report.txt'] } } }
  return { strategy, context, request, runner, calls, snapshots, setOutput: value => output = value }
}

test('Computer Qwen checkpoints before dispatch and exports before cleanup; replay only inspects', async () => {
  const f = fixture()
  const started = await f.strategy.start(f.request, f.context)
  assert.deepEqual(f.calls, ['start', 'checkpoint', 'checkpoint', 'POST'])
  const result = await f.strategy.start({ ...f.request, previous: started.handle }, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.text, 'done')
  assert.equal(result.result.export.status, 'completed')
  assert.deepEqual(f.calls.slice(-3), [{ mode: 'files', paths: ['report.txt'] }, 'checkpoint', 'stop'])
  assert.equal(f.calls.filter(x => x === 'POST').length, 1)
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
    const f = fixture(); const started = await f.strategy.start(f.request, f.context); f.setOutput(output)
    assert.equal((await f.strategy.inspect(started.handle, f.context)).status, 'failed')
  }
})

test('Qwen preserves recovered permission denials as diagnostics without overriding a successful final receipt', async () => {
  const f = fixture(); const started = await f.strategy.start(f.request, f.context)
  f.setOutput({ state: 'exited', exitCode: 0, events: [
    { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'permission denied' }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'recovered and verified',
      permission_denials: [{ tool_name: 'run_shell_command', tool_input: { command: 'mkdir -p qa' } }] }
  ] })
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.handle.metadata.completion.permissionDenials, 1)
  assert.equal(result.handle.metadata.completion.command, 'mkdir -p qa')
  assert.equal(result.handle.metadata.completion.exitCode, 0)
  assert.equal(f.snapshots.at(-1).handle.metadata.completion.code, 'completed')
})

test('Qwen reports permission failure details and preserves them before guest cleanup', async () => {
  const f = fixture(); const started = await f.strategy.start(f.request, f.context)
  f.setOutput({ state: 'exited', exitCode: 1, events: [
    { type: 'result', subtype: 'error_during_execution', is_error: true, result: '',
      permission_denials: [{ tool_name: 'run_shell_command', tool_input: { command: 'mkdir -p qa; TOKEN=private-value' } }] }
  ] })
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
    [{ state: 'exited', exitCode: 0, events: [{ type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['Turn budget exhausted'] }] }, 'cli_error']
  ]) {
    const f = fixture(); const started = await f.strategy.start(f.request, f.context); f.setOutput(output)
    const result = await f.strategy.inspect(started.handle, f.context)
    assert.equal(result.status, 'failed'); assert.equal(result.handle.metadata.completion.code, code)
    assert.match(result.error, new RegExp(code))
    if(code === 'cli_error') assert.match(result.error, /Turn budget exhausted/)
  }
})

test('Qwen does not hide a final model failure behind an earlier permission denial', async () => {
  const f = fixture(); const started = await f.strategy.start(f.request, f.context)
  f.setOutput({ state: 'exited', exitCode: 1, events: [
    { type: 'result', subtype: 'error_during_execution', is_error: true,
      errors: ['Model request quota exhausted'],
      permission_denials: [{ tool_name: 'run_shell_command', tool_input: { command: 'mkdir -p qa' } }] }
  ] })
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.match(result.error, /cli_error.*Model request quota exhausted/)
  assert.equal(result.handle.metadata.completion.permissionDenials, 1)
})

test('Computer Qwen keeps uncertain launches unknown and checks workspace/profile before access', async () => {
  const f = fixture(); const started = await f.strategy.start(f.request, f.context)
  f.setOutput({ state: 'idle', events: [] })
  assert.equal((await f.strategy.inspect(started.handle, f.context)).status, 'unknown')
  await assert.rejects(f.strategy.inspect(started.handle, { ...f.context, scope: { workspaceId: 'other' } }))
  await assert.rejects(f.strategy.inspect({ ...started.handle, metadata: { ...started.handle.metadata, profileVersion: '2' } }, f.context))
  assert.equal(f.calls.filter(x => x === 'POST').length, 1)
})

test('Computer Qwen leaves runner available when durable result checkpoint fails', async () => {
  const f = fixture(); const started = await f.strategy.start(f.request, f.context)
  await assert.rejects(f.strategy.inspect(started.handle, { ...f.context, checkpoint: async () => { throw Error('offline') } }))
  assert.equal(f.calls.includes('stop'), false)
})

test('Computer Qwen cancellation needs confirmed process exit; export failure preserves successful work', async () => {
  const f = fixture(); const started = await f.strategy.start(f.request, f.context)
  f.runner.collectArtifacts = async () => { throw Error('denied') }
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'succeeded'); assert.equal(result.result.export.status, 'failed')
  f.runner.stop = async () => ({ state: 'unknown' })
  assert.equal((await f.strategy.cancel(started.handle, f.context)).status, 'unknown')
})

test('Computer profiles reject caller-managed commands, model selection and credentials', () => {
  for (const extra of [{ command: 'qwen' }, { model: 'other' }, { environmentKeys: ['TOKEN'] }, { args: ['exec'] }]) {
    assert.throws(() => ConfigSchema.parse({ profiles: [{ id: 'computer-qwen', version: '1', provider: 'qwen-computer', executionEnvironment: 'computer', workspaceIds: [workspaceId], ...extra }] }))
  }
})

test('Computer capability declarations do not inherit App Server approvals or process-only recovery', () => {
 const f = fixture(); assert.equal(f.strategy.capabilities.interactions, false); assert.equal(f.strategy.capabilities.recovery, 'session');
 assert.equal(f.strategy.capabilities.executionTools[0].id, 'qwen');
})

 test('Qwen recovery and cancellation refuse a receipt for a different tool', async () => {
  const f = fixture(); const started = await f.strategy.start(f.request, f.context)
  const handle = { ...started.handle, runner: { ...started.handle.runner, tool: { id: 'codex', version: '0.159.2' } } }
  await assert.rejects(f.strategy.inspect(handle, f.context))
  await assert.rejects(f.strategy.cancel(handle, f.context))
  assert.equal(f.calls.includes('stop'), false)
 })
