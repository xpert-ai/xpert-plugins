import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { JsonlProcess } from '../dist/lib/jsonl-process.js'
import { ProcessRuntime } from '../dist/lib/process-runtime.js'
import { OpenCodeRuntimeStrategy } from '../dist/lib/opencode.strategy.js'
import { ClaudeCodeRuntimeStrategy } from '../dist/lib/claude.strategy.js'
import { ConfigSchema } from '../dist/lib/config.js'

const workspaceId = '11111111-1111-4111-a111-111111111111'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (check()) return
    await pause(10)
  }
  throw new Error('Runtime regression fixture timed out')
}

test('stdin failure rejects pending requests and reaps a child that ignores SIGTERM before notifying close', async (t) => {
  let pid
  let closed = 0
  const transport = new JsonlProcess({
    command: process.execPath,
    args: ['-e', `process.on('SIGTERM',()=>{});require('fs').closeSync(0);process.stdout.write(JSON.stringify({type:'ready',pid:process.pid})+'\\n');setInterval(()=>{},1000)`],
    environmentKeys: []
  }, tmpdir(), (message) => { pid = message.pid }, () => { closed++ })
  t.after(() => {
    transport.stop()
    if (pid) { try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error } }
  })
  await until(() => pid)
  await assert.rejects(transport.request({ type: 'prompt' }), /disconnected/)
  assert.equal(closed, 0, 'a broken stdin does not mean the process has exited')
  assert.throws(() => transport.send({ type: 'prompt' }), /closed/)
  // Repeated shutdown must not postpone the SIGKILL escalation.
  transport.stop()
  await until(() => closed)
  assert.equal(closed, 1)
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})

test('a spawn failure rejects requests and reports close once', async () => {
  let closed = 0
  const transport = new JsonlProcess({ command: join(tmpdir(), randomUUID(), 'missing'), args: [], environmentKeys: [] },
    tmpdir(), () => {}, () => { closed++ })
  await assert.rejects(transport.request({ type: 'prompt' }), /disconnected/)
  await until(() => closed)
  assert.equal(closed, 1)
  transport.stop()
})

test('OpenCode waits through completed tool steps, retries and newer incomplete messages before returning a final result', async (t) => {
  let state = 'busy'
  let messages = []
  let statusReads = 0
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const path = new URL(req.url, 'http://localhost').pathname
    let value
    if (path === '/session/status') { statusReads++; value = state ? { session: { type: state } } : {} }
    else if (path === '/session') value = { id: 'session' }
    else if (req.method === 'POST') {
      messages = [{ info: { role: 'assistant', parentID: JSON.parse(body).messageID, finish: 'tool-calls', time: { completed: 1 } }, parts: [{ type: 'tool' }] }]
      value = messages[0]
    } else value = messages
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(value))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const profiles = new ProcessRuntime(ConfigSchema.parse({ profiles: [{ id: 'oc', provider: 'opencode', version: '1',
    workspaceIds: [workspaceId], workspaceRoot: tmpdir(), serverUrl: `http://127.0.0.1:${server.address().port}` }] }))
  const snapshots = []
  const context = { invocationId: randomUUID(), scope: { workspaceId }, checkpoint: async (s) => snapshots.push(structuredClone(s)) }
  const strategy = new OpenCodeRuntimeStrategy(profiles)
  const started = await strategy.start({ target: { reference: 'oc', configuration: { profileVersion: '1' } }, input: { prompt: 'fixture' } }, context)
  await until(() => snapshots.length === 2)
  assert.equal(snapshots[1].status, 'running', 'the POST response must use the same completion rules as recovery')
  assert.ok(statusReads > 0)
  const inspect = () => strategy.inspect(started.handle, context)
  assert.equal((await inspect()).status, 'running')
  state = 'retry'
  assert.equal((await inspect()).status, 'running')
  state = undefined
  assert.equal((await inspect()).status, 'unknown', 'an idle intermediate tool step is not success')
  messages[0].info.finish = 'stop'
  assert.equal((await inspect()).status, 'unknown', 'tool calls can also be reported with finish=stop')
  messages[0].parts = [{ type: 'text', text: 'final answer' }]
  const finalMessage = structuredClone(messages[0])
  state = 'busy'
  assert.equal((await inspect()).status, 'running')
  state = 'idle'
  messages.push({ info: { role: 'assistant', parentID: started.handle.runId, time: {} }, parts: [] })
  assert.equal((await inspect()).status, 'unknown', 'never fall back to an older completed message')
  messages = [finalMessage]
  assert.equal((await inspect()).result.text, 'final answer')
  messages[0].info.error = { name: 'APIError' }
  assert.equal((await inspect()).status, 'failed')
})

test('Claude synchronous startup failure aborts partial execution and clears pending approvals, timers and run state', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'claude-startup-fixture-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const profiles = new ProcessRuntime(ConfigSchema.parse({ profiles: [{ id: 'c', provider: 'claude-code', version: '1',
    workspaceIds: [workspaceId], workspaceRoot: root, timeoutMs: 1000 }] }))
  let abort
  let permission
  const strategy = new ClaudeCodeRuntimeStrategy(profiles, { load: async () => ({ query: ({ options }) => {
    abort = options.abortController
    permission = options.canUseTool('Read', { path: 'fixture.txt' })
    throw new Error('SDK startup failure')
  } }) })
  t.after(() => strategy.onModuleDestroy())
  const snapshots = []
  const context = { invocationId: randomUUID(), scope: { workspaceId }, checkpoint: async (s) => snapshots.push(structuredClone(s)) }
  await assert.rejects(strategy.start({ target: { reference: 'c', configuration: { profileVersion: '1' } }, input: { prompt: 'fixture' } }, context), /SDK startup failure/)
  assert.equal(abort.signal.aborted, true)
  assert.equal((await permission).behavior, 'deny')
  const observation = await strategy.inspect({ runId: context.invocationId }, context)
  assert.equal(observation.status, 'unknown')
  assert.match(observation.error, /unavailable/)
  assert.equal(snapshots.at(-1).status, 'unknown')
  assert.equal(snapshots.at(-1).interaction, undefined)
  const count = snapshots.length
  await pause(1100)
  assert.equal(snapshots.length, count, 'a failed launch must not retain its timeout callback')
})
