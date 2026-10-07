import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jsonlActivities, openCodeActivities, appendActivities } from '../dist/lib/activity.js'
import { collectJsonlActivity } from '../dist/lib/computer-activity.js'

test('Qwen public blocks join by tool call ID and exclude private/system content', () => {
  const items = jsonlActivities(
    'qwen',
    [
      { type: 'system', message: { content: [{ type: 'text', text: 'private config' }] } },
      {
        type: 'assistant',
        uuid: 'm1',
        message: {
          content: [
            { type: 'thinking', text: 'private reasoning' },
            { type: 'text', text: 'Run the check' },
            {
              type: 'tool_use',
              id: 'c1',
              name: 'run_shell_command',
              input: { command: 'node test.cjs', authorization: 'secret' }
            }
          ]
        }
      },
      {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'c1', is_error: false, content: '42' }] }
      }
    ],
    '0'
  )
  assert.equal(items.length, 3)
  assert.equal(items[1].id, items[2].id)
  assert.equal(items[1].content.detail.type, 'command')
  assert.equal(items[2].content.status, 'succeeded')
  assert.ok(!JSON.stringify(items).includes('private'))
  assert.ok(!JSON.stringify(items).includes('secret'))
})
test('Qwen failed tools and unsupported tool types retain truthful generic presentation', () => {
  const items = jsonlActivities(
    'qwen',
    [
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'x', name: 'custom', input: { command: 'not a shell tool' } }] }
      },
      {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true, content: 'denied' }] }
      }
    ],
    '100'
  )
  assert.equal(items[0].content.detail, undefined)
  assert.equal(items[1].content.status, 'failed')
})
test('Codex retains command identity, actual exit code and truncation without reasoning', () => {
  const items = jsonlActivities(
    'codex',
    [
      {
        type: 'item.started',
        item: { id: 'c', type: 'command_execution', command: 'node test.cjs', status: 'in_progress' }
      },
      { type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'private' } },
      {
        type: 'item.completed',
        item: {
          id: 'c',
          type: 'command_execution',
          command: 'node test.cjs',
          status: 'completed',
          exit_code: 0,
          aggregated_output: 'x'.repeat(70000)
        }
      }
    ],
    '0'
  )
  assert.equal(items.length, 2)
  assert.equal(items[0].id, items[1].id)
  assert.equal(items[1].content.detail.exitCode, 0)
  assert.equal(items[1].content.output.length, 70000)
  assert.equal(items[1].content.truncated, false)
})
test('OpenCode isolates this run and uses stable part IDs for snapshot replacement', () => {
  const message = (parentID, output) => ({
    info: { id: 'm', role: 'assistant', parentID },
    parts: [
      { id: 'thought', type: 'reasoning', text: 'private' },
      {
        id: 'c',
        type: 'tool',
        tool: 'bash',
        state: { status: 'completed', input: { command: 'node test.cjs' }, output, metadata: { exit: 0 } }
      }
    ]
  })
  const items = openCodeActivities([message('other', 'wrong'), message('run', '42')], 'run')
  assert.equal(items.length, 1)
  assert.equal(items[0].content.output, '42')
  assert.equal(items[0].id, 'opencode:c')
})
test('Activity storage failure does not replace execution results and records the gap when available', async () => {
  const calls = []
  await appendActivities(
    {
      activity: {
        append: async (batch) => {
          calls.push(batch)
          if (calls.length === 1) throw Error('unavailable')
        }
      }
    },
    [],
    true
  )
  assert.deepEqual(calls.at(-1).gaps, ['storage_unavailable'])
  await appendActivities({}, [], true)
})
test('Qwen upstream truncation is explicit and does not expose its private scratch path', () => {
  const items = jsonlActivities(
    'qwen',
    [
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'c',
              content: 'visible\nOutput too long and was saved to: /tmp/private-run/output.output'
            }
          ]
        }
      }
    ],
    '0'
  )
  assert.equal(items[0].content.truncated, true)
  assert.equal(items[0].content.output, 'visible\n[CLI output truncated]')
})
test('Codex nonzero command exit is a failed command even when the item completed', () => {
  const items = jsonlActivities(
    'codex',
    [
      {
        type: 'item.completed',
        item: { id: 'c', type: 'command_execution', command: 'node fail.cjs', status: 'completed', exit_code: 7 }
      }
    ],
    '0'
  )
  assert.equal(items[0].content.status, 'failed')
})
test('JSONL commits source generation, public items and cursor atomically; replay does not rewrite', async () => {
  const sourceId = '00000000-0000-4000-8000-000000000001',
    calls = []
  let checkpoint = { seq: 0 }
  const context = {
    activity: {
      readCheckpoint: async () => checkpoint,
      append: async (batch) => {
        calls.push(batch)
        checkpoint = {
          seq: checkpoint.seq + batch.items.length,
          sourceCursor: batch.sourceCursor ?? checkpoint.sourceCursor
        }
        return checkpoint
      }
    },
    capabilities: {
      require: () => ({
        request: async () => ({
          sourceId,
          events: [{ type: 'assistant', uuid: 'm', message: { content: [{ type: 'text', text: 'public' }] } }],
          positions: [0],
          next: 100,
          hasMore: false,
          gap: false
        })
      })
    }
  }
  await collectJsonlActivity(context, { runner: {} }, 'qwen', false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].items.length, 1)
  assert.deepEqual(JSON.parse(calls[0].sourceCursor), { sourceId, offset: 100 })
  await collectJsonlActivity(context, { runner: {} }, 'qwen', true)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].items.length, 0)
  assert.equal(calls[1].complete, true)
})
test('JSONL refuses a replaced buffer instead of silently restarting the cursor', async () => {
  const calls = []
  const context = {
    activity: {
      readCheckpoint: async () => ({
        seq: 1,
        sourceCursor: JSON.stringify({ sourceId: '00000000-0000-4000-8000-000000000001', offset: 100 })
      }),
      append: async (b) => {
        calls.push(b)
        return { seq: 1 }
      }
    },
    capabilities: {
      require: () => ({
        request: async () => ({
          sourceId: '00000000-0000-4000-8000-000000000002',
          events: [],
          positions: [],
          next: 100,
          hasMore: false,
          gap: false
        })
      })
    }
  }
  assert.equal(await collectJsonlActivity(context, { runner: {} }, 'qwen', true), undefined)
  assert.deepEqual(calls.at(-1).gaps, ['source_lost'])
  assert.equal(calls.at(-1).complete, true)
})
