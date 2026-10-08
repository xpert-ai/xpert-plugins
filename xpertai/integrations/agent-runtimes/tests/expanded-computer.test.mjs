import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CodeBuddyComputerRuntimeStrategy } from '../dist/lib/codebuddy-computer.strategy.js'
import { ClaudeComputerRuntimeStrategy } from '../dist/lib/claude-computer.strategy.js'
import { KimiComputerRuntimeStrategy } from '../dist/lib/kimi-computer.strategy.js'
import { ProcessRuntime } from '../dist/lib/process-runtime.js'
import { ConfigSchema } from '../dist/lib/config.js'
import { jsonlActivities } from '../dist/lib/activity.js'
import { kimiCompletion } from '../dist/lib/kimi-protocol.js'

const workspaceId = '11111111-1111-4111-a111-111111111111'
const terminal = { type: 'result', subtype: 'success', is_error: false, result: 'verified' }
const kimiFinal = [
  { role: 'assistant', content: 'verified' },
  { role: 'meta', type: 'session.resume_hint', session_id: 'session' }
]
for (const [tool, Strategy, events] of [
  ['codebuddy', CodeBuddyComputerRuntimeStrategy, [terminal]],
  ['claude', ClaudeComputerRuntimeStrategy, [terminal]],
  ['kimi', KimiComputerRuntimeStrategy, kimiFinal]
]) {
  function fixture() {
    const provider = `${tool}-computer`
    const strategy = new Strategy(
      new ProcessRuntime(
        ConfigSchema.parse({
          profiles: [
            { id: tool, provider, version: '1', executionEnvironment: 'computer', workspaceIds: [workspaceId] }
          ]
        })
      )
    )
    const receipt = { tool: { id: tool }, workingDirectory: '/workspace/project' }
    const calls = []
    let output = { state: 'exited', exitCode: 0, events }
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
        return { state: 'exited' }
      },
      collectArtifacts: async () => {
        calls.push('export')
        return [{ id: 'artifact', versionId: 'version' }]
      }
    }
    const context = {
      scope: { workspaceId },
      invocationId: 'invocation',
      capabilities: { require: () => runner },
      checkpoint: async () => {
        calls.push('checkpoint')
      }
    }
    const request = {
      target: { provider, reference: tool, configuration: { profileVersion: '1' } },
      input: { prompt: 'task', delivery: { mode: 'files', paths: ['report.txt'] } }
    }
    return { strategy, calls, runner, context, request, output: (value) => (output = value) }
  }
  test(`${tool}: durable dispatch, replay only observes, export precedes cleanup`, async () => {
    const f = fixture(),
      started = await f.strategy.start(f.request, f.context)
    assert.deepEqual(f.calls, ['start', 'checkpoint', 'checkpoint', 'POST'])
    const result = await f.strategy.start({ ...f.request, previous: started.handle }, f.context)
    assert.equal(result.status, 'succeeded')
    assert.equal(result.result.export.status, 'completed')
    assert.equal(result.result.text, 'verified')
    assert.deepEqual(f.calls.slice(-3), ['export', 'checkpoint', 'stop'])
    assert.equal(f.calls.filter((c) => c === 'POST').length, 1)
  })
  test(`${tool}: missing terminal, nonzero exit and transport failure never accept text as success`, async () => {
    for (const output of [
      { state: 'exited', exitCode: 0, events: [] },
      { state: 'exited', exitCode: 1, events },
      { state: 'exited', events },
      { state: 'failed', events }
    ]) {
      const f = fixture(),
        started = await f.strategy.start(f.request, f.context)
      f.output(output)
      assert.equal((await f.strategy.inspect(started.handle, f.context)).status, 'failed')
    }
  })
  test(`${tool}: wrong tool/workspace cannot inspect or cancel, unknown stop remains unknown`, async () => {
    const f = fixture(),
      started = await f.strategy.start(f.request, f.context)
    const wrong = { ...started.handle, runner: { ...started.handle.runner, tool: { id: 'other' } } }
    await assert.rejects(f.strategy.inspect(wrong, f.context))
    await assert.rejects(f.strategy.cancel(wrong, f.context))
    await assert.rejects(f.strategy.inspect(started.handle, { ...f.context, scope: { workspaceId: 'other' } }))
    f.runner.stop = async () => ({ state: 'unknown' })
    assert.equal((await f.strategy.cancel(started.handle, f.context)).status, 'unknown')
    assert.equal(f.strategy.capabilities.interactions, false)
  })
  test(`${tool}: failed checkpoint retains the supervised process for reconciliation`, async () => {
    const f = fixture(),
      started = await f.strategy.start(f.request, f.context)
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
}

for (const tool of ['codebuddy', 'claude'])
  test(`${tool}: public messages, commands and files retain tool IDs without thinking or settings`, () => {
    const items = jsonlActivities(
      tool,
      [
        { type: 'system', message: { content: [{ type: 'text', text: 'private settings' }] } },
        {
          type: 'assistant',
          uuid: 'a',
          message: {
            content: [
              { type: 'thinking', text: 'private reasoning' },
              { type: 'text', text: '执行测试' },
              {
                type: 'tool_use',
                id: 'bash',
                name: 'Bash',
                input: { command: 'node check.cjs', secret: 'private token' }
              },
              { type: 'tool_use', id: 'write', name: 'Write', input: { file_path: 'report.json', content: '{}' } }
            ]
          }
        },
        {
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 'bash', is_error: true, content: 'failed' }] }
        }
      ],
      '100'
    )
    assert.equal(items.length, 4)
    assert.equal(items[1].id, items[3].id)
    assert.equal(items[1].content.detail.type, 'command')
    assert.equal(items[2].content.detail.type, 'file_change')
    assert.equal(items[3].content.status, 'failed')
    assert.doesNotMatch(JSON.stringify(items), /private/)
  })

test('Kimi requires a final reply, matched tools and one final resume marker', () => {
  const call = {
    role: 'assistant',
    tool_calls: [{ type: 'function', id: 'c', function: { name: 'Bash', arguments: '{}' } }]
  }
  const result = { role: 'tool', tool_call_id: 'c', content: '42' }
  for (const events of [
    [],
    [kimiFinal[0]],
    [call, ...kimiFinal],
    [result, ...kimiFinal],
    [...kimiFinal, kimiFinal[1]],
    [...kimiFinal, call],
    [{ role: 'bad' }]
  ])
    assert.equal(kimiCompletion(events).ok, false)
  assert.equal(kimiCompletion([call, result, ...kimiFinal]).ok, true)
})

test('Kimi keeps explicit call IDs and does not invent tool success or command exit codes', () => {
  const items = jsonlActivities(
    'kimi',
    [
      { role: 'meta', type: 'session.resume_hint', session_id: 'private' },
      {
        role: 'assistant',
        content: '检查文件',
        tool_calls: [
          {
            type: 'function',
            id: 'c',
            function: {
              name: 'Bash',
              arguments: JSON.stringify({ command: 'node check.cjs', token: 'private' })
            }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'c', content: 'not a structured exit code: 0' }
    ],
    '50'
  )
  assert.equal(items.length, 3)
  assert.equal(items[1].id, items[2].id)
  assert.equal(items[2].content.status, 'unknown')
  assert.equal(items[1].content.detail.exitCode, undefined)
  assert.doesNotMatch(JSON.stringify(items), /private/)
})
