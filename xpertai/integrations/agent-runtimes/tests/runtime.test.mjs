import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { ProcessRuntime } from '../dist/lib/process-runtime.js'
import { CodexRuntimeStrategy } from '../dist/lib/codex.strategy.js'
import { PiRuntimeStrategy } from '../dist/lib/pi.strategy.js'
import { ClaudeCodeRuntimeStrategy } from '../dist/lib/claude.strategy.js'
import { OpenCodeRuntimeStrategy } from '../dist/lib/opencode.strategy.js'
import { ConfigSchema } from '../dist/lib/config.js'

const workspaceId = '11111111-1111-4111-a111-111111111111'
async function fixture(t, provider, extra = {}) {
  const root = await mkdtemp(join(tmpdir(), 'agent-provider-fixture-'))
  const profile = {
    id: provider,
    version: '1',
    provider,
    workspaceIds: [workspaceId],
    workspaceRoot: root,
    command: process.execPath,
    args: [fileURLToPath(new URL('protocol-fixture.mjs', import.meta.url)), provider],
    ...extra
  }
  const processes = new ProcessRuntime(ConfigSchema.parse({ profiles: [profile] }))
  const snapshots = []
  const context = {
    invocationId: randomUUID(),
    scope: {
      tenantId: 'tenant',
      organizationId: 'org',
      userId: 'user',
      workspaceId,
      parentExecutionId: 'parent',
      callerAgentKey: 'leader'
    },
    checkpoint: async (snapshot) => snapshots.push(structuredClone(snapshot))
  }
  const request = {
    operationId: context.invocationId,
    target: {
      provider,
      bindingId: 'binding',
      revision: '1',
      reference: provider,
      configuration: { profileVersion: '1' }
    },
    input: { prompt: 'fixture' }
  }
  t.after(async () => {
    processes.onModuleDestroy()
    await rm(root, { recursive: true, force: true })
  })
  return { processes, context, request, snapshots }
}
async function until(f) {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const result = f()
    if (result) return result
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('Protocol fixture timed out')
}

test('Codex persists thread/turn receipts and handles a bidirectional approval', async (t) => {
  const f = await fixture(t, 'codex')
  const strategy = new CodexRuntimeStrategy(f.processes)
  await strategy.start(f.request, f.context)
  const waiting = await until(() => f.snapshots.find((s) => s.status === 'waiting'))
  assert.equal(waiting.interaction.id, '91')
  assert.equal(waiting.interaction.data.command, 'fixture')
  assert.ok(f.snapshots.find((s) => s.handle?.sessionId === 'thread-fixture'))
  await strategy.respond(waiting.handle, '91', 'accept', f.context)
  const done = await until(() => f.snapshots.find((s) => s.status === 'succeeded'))
  assert.equal(done.result.text, 'approved result 中文')
  assert.equal(done.handle.runId, 'turn-fixture')
})

test('Codex cancellation remains pending until turn/completed', async (t) => {
  const f = await fixture(t, 'codex')
  const strategy = new CodexRuntimeStrategy(f.processes)
  const receipt = await strategy.start(f.request, f.context)
  await until(() => f.snapshots.find((s) => s.status === 'waiting'))
  const pending = await strategy.cancel(receipt.handle, f.context)
  assert.equal(pending.status, 'cancelling')
  await until(() => f.snapshots.find((s) => s.status === 'cancelled'))
})

test('Pi waits for agent_settled through automatic retry', async (t) => {
  const f = await fixture(t, 'pi')
  const strategy = new PiRuntimeStrategy(f.processes)
  await strategy.start(f.request, f.context)
  const done = await until(() => f.snapshots.find((s) => s.status === 'succeeded'))
  assert.equal(done.result.text, 'retry completed 中文')
  assert.equal(
    f.snapshots.some((s) => s.status === 'failed'),
    false
  )
})

test('profile version and workspace grants are checked before spawn', async (t) => {
  const f = await fixture(t, 'pi')
  const strategy = new PiRuntimeStrategy(f.processes)
  await assert.rejects(
    strategy.start({ ...f.request, target: { ...f.request.target, configuration: { profileVersion: '2' } } }, f.context)
  )
  await assert.rejects(strategy.start(f.request, { ...f.context, scope: { ...f.context.scope, workspaceId: 'other' } }))
  assert.equal(f.processes.runs.size, 0)
})

test('missing process does not replay an ambiguous operation', async (t) => {
  const f = await fixture(t, 'pi')
  const strategy = new PiRuntimeStrategy(f.processes)
  const receipt = await strategy.start({ ...f.request, previous: { sessionId: 'lost', runId: 'lost' } }, f.context)
  assert.equal(receipt.status, 'unknown')
  assert.equal(f.processes.runs.size, 0)
})

test('Claude SDK permissions use host interactions and completion receipts', async (t) => {
  const f = await fixture(t, 'claude-code')
  let settings
  const sdk = {
    load: async () => ({
      query: ({ options }) => {
        settings = options
        return (async function* () {
          yield { type: 'system', session_id: 'claude-session' }
          const decision = await options.canUseTool('Read', { path: 'fixture.txt' })
          assert.equal(decision.behavior, 'allow')
          yield { type: 'result', subtype: 'success', result: 'Claude fixture', is_error: false }
        })()
      }
    })
  }
  const strategy = new ClaudeCodeRuntimeStrategy(f.processes, sdk)
  t.after(() => strategy.onModuleDestroy())
  await strategy.start(f.request, f.context)
  const waiting = await until(() => f.snapshots.find((s) => s.status === 'waiting'))
  assert.deepEqual(waiting.interaction.data, { path: 'fixture.txt' })
  assert.equal(settings.permissionMode, 'default')
  assert.deepEqual(settings.settingSources, [])
  await strategy.respond(waiting.handle, waiting.interaction.id, true, f.context)
  const done = await until(() => f.snapshots.find((s) => s.status === 'succeeded'))
  assert.equal(done.result.text, 'Claude fixture')
})

test('OpenCode persists before prompt and recovers by message identity without resend', async (t) => {
  let prompts = 0
  let sentReceipt = false
  let saved
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const path = new URL(req.url, 'http://localhost').pathname
    let value
    if (path === '/session/status') value = {}
    else if (path === '/session') value = { id: 'session-fixture' }
    else if (path.endsWith('/message') && req.method === 'POST') {
      assert.ok(sentReceipt)
      prompts++
      saved = {
        info: { role: 'assistant', parentID: JSON.parse(body).messageID, finish: 'stop', time: { completed: 1 } },
        parts: [{ type: 'text', text: 'OpenCode fixture' }]
      }
      value = saved
    } else if (path.endsWith('/message')) value = [saved]
    else if (path.endsWith('/abort')) value = true
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(value))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => new Promise((r) => server.close(r)))
  const f = await fixture(t, 'opencode', { serverUrl: `http://127.0.0.1:${server.address().port}` })
  const record = f.context.checkpoint
  f.context.checkpoint = async (s) => {
    sentReceipt = true
    await record(s)
  }
  const strategy = new OpenCodeRuntimeStrategy(f.processes)
  const first = await strategy.start(f.request, f.context)
  await until(() => f.snapshots.find((s) => s.status === 'succeeded'))
  const recovered = await new OpenCodeRuntimeStrategy(f.processes).start(
    { ...f.request, previous: first.handle },
    f.context
  )
  assert.equal(recovered.result.text, 'OpenCode fixture')
  assert.equal(prompts, 1)
})
