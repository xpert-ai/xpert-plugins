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
import { RuntimeProfiles } from '../dist/lib/managed-profiles.js'

const workspaceId = '11111111-1111-4111-a111-111111111111'
async function fixture(t, provider, extra = {}) {
  const root = await mkdtemp(join(tmpdir(), 'agent-provider-fixture-'))
  const type = provider === 'claude-code' ? 'sdk' : provider === 'opencode' ? 'service' : 'process'
  const profile = {
    provider,
    type,
    revision: 'deployment-1',
    workspaceRoot: root,
    timeoutMs: 600000,
    command: process.execPath,
    environment: {},
    args: [fileURLToPath(new URL('protocol-fixture.mjs', import.meta.url)), provider],
    ...extra
  }
  const profiles = new RuntimeProfiles()
  const processes = new ProcessRuntime(profiles)
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
    capabilities: {
      require: (capability) => {
        assert.equal(capability.id, 'platform.agent_runtime.deployment')
        return {
          resolve: async () => {
            if (context.scope.workspaceId !== workspaceId) throw Error('Host scope denied')
            return profile
          }
        }
      }
    },
    checkpoint: async (snapshot) => snapshots.push(structuredClone(snapshot))
  }
  const request = {
    operationId: context.invocationId,
    target: {
      provider,
      bindingId: 'binding',
      revision: '1',
      reference: provider === 'opencode' ? 'managed-opencode-service' : `managed-${provider}`,
      configuration: {
        profileVersion: '1',
        executionEnvironment: { type },
        managedRuntime: { type: 'builtin', version: '1' },
        deploymentRevision: 'deployment-1'
      }
    },
    input: { prompt: 'fixture' }
  }
  t.after(async () => {
    processes.onModuleDestroy()
    await rm(root, { recursive: true, force: true })
  })
  return { processes, profiles, context, request, snapshots, deployment: profile }
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
  const saved = f.context.scope.workspaceId
  f.context.scope.workspaceId = 'other'
  await assert.rejects(strategy.start(f.request, f.context))
  f.context.scope.workspaceId = saved
  assert.equal(f.processes.runs.size, 0)
})

test('missing process does not replay an ambiguous operation', async (t) => {
  const f = await fixture(t, 'pi')
  const strategy = new PiRuntimeStrategy(f.processes)
  const receipt = await strategy.start(
    {
      ...f.request,
      previous: {
        sessionId: 'lost',
        runId: 'lost',
        metadata: {
          provider: 'pi',
          profileId: 'managed-pi',
          workspaceId,
          profileVersion: '1',
          managedRuntime: { type: 'builtin', version: '1' },
          deploymentRevision: 'deployment-1'
        }
      }
    },
    f.context
  )
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
        info: {
          role: 'assistant',
          parentID: JSON.parse(body).messageID,
          finish: 'stop',
          time: { created: 1, completed: 2 }
        },
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
  class InstalledOpenCodeStrategy extends OpenCodeRuntimeStrategy {
    async resolveManagedDeployment(reference, scope) {
      assert.equal(reference, 'managed-opencode-service')
      assert.equal(scope.workspaceId, workspaceId)
      return { type: 'service', serverUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 600000 }
    }
  }
  const strategy = new InstalledOpenCodeStrategy(f.profiles)
  // Host capability wraps settings from the installed strategy, never a host env/provider list.
  f.context.capabilities.require = () => ({
    resolve: async () => ({
      ...(await strategy.resolveManagedDeployment(f.request.target.reference, f.context.scope)),
      provider: 'opencode',
      revision: 'deployment-1',
      workspaceRoot: f.deployment.workspaceRoot
    })
  })
  const first = await strategy.start(f.request, f.context)
  await until(() => f.snapshots.find((s) => s.status === 'succeeded'))
  const recovered = await new OpenCodeRuntimeStrategy(f.profiles).start(
    { ...f.request, previous: first.handle },
    f.context
  )
  assert.equal(recovered.result.text, 'OpenCode fixture')
  assert.equal(recovered.progress.source, 'executor')
  assert.equal(recovered.progress.startedAt, new Date(1).toISOString())
  assert.equal(recovered.progress.phase, 'completed')
  assert.equal(prompts, 1)
})

test('installed strategies own direct launch defaults without plugin or host environment configuration', async (t) => {
  const f = await fixture(t, 'codex')
  const codex = new CodexRuntimeStrategy(f.processes)
  const pi = new PiRuntimeStrategy(f.processes)
  const claude = new ClaudeCodeRuntimeStrategy(f.processes, {
    load: async () => {
      throw Error('Discovery must not load SDK')
    }
  })
  for (const [strategy, reference, expected] of [
    [codex, 'managed-codex', { type: 'process', command: 'codex', args: ['app-server'] }],
    [pi, 'managed-pi', { type: 'process', command: 'pi', args: ['--mode', 'rpc'] }],
    [claude, 'managed-claude-code', { type: 'sdk' }]
  ]) {
    const spec = await strategy.resolveManagedDeployment(reference, f.context.scope)
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(spec[key], value)
    assert.deepEqual(spec.environment, { LANG: 'C.UTF-8' })
    assert.equal(await strategy.resolveManagedDeployment('not-registered', f.context.scope), undefined)
  }
  assert.equal(
    await new OpenCodeRuntimeStrategy(f.profiles).resolveManagedDeployment('managed-opencode-service', f.context.scope),
    undefined
  )
})
