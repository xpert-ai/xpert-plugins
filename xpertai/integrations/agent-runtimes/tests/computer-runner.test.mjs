import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { AgentExecutionRunnerCapability, DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { ProcessRuntime } from '../dist/lib/process-runtime.js'
import { OpenCodeRuntimeStrategy } from '../dist/lib/opencode.strategy.js'
import { ConfigSchema } from '../dist/lib/config.js'

function setup() {
  const events = [],
    snapshots = []
  const invocationId = randomUUID(),
    workspaceId = randomUUID()
  const receipt = {
    version: 1,
    invocationId,
    processId: 'process',
    grantId: randomUUID(),
    environment: { type: 'computer', environmentId: randomUUID(), instanceId: 'generation' },
    workingDirectory: '/home/user/.xpert/runs/' + invocationId,
    tool: { id: 'opencode', version: '1.18.33' }
  }
  let state = 'busy',
    stopped = false,
    output = 'implemented',
    exportFailure = false,
    emptyExport = false
  const runner = {
    async start(id, checkpoint) {
      assert.equal(id, invocationId)
      events.push('reserve')
      await checkpoint(receipt)
      return receipt
    },
    async request(value, request) {
      assert.deepEqual(value, receipt)
      events.push(request.path)
      if (request.path === '/session') return { id: 'session' }
      if (request.path.endsWith('/prompt_async')) return null
      if (request.path === '/session/status') return { session: { type: state } }
      return [
        {
          info: {
            role: 'assistant',
            parentID: 'msg_' + invocationId.replaceAll('-', ''),
            finish: 'stop',
            time: { completed: 1 }
          },
          parts: [{ type: 'text', text: output }]
        }
      ]
    },
    async inspect() {
      return { state: 'running' }
    },
    async collectArtifacts(value, selection) {
      assert.deepEqual(value, receipt)
      assert.deepEqual(selection.paths, ['report.txt'])
      events.push('artifacts')
      if (exportFailure) throw Error('export failed')
      return emptyExport ? [] : [{ id: 'artifact', name: 'computer-output.zip', mimeType: 'application/zip' }]
    },
    async stop() {
      events.push('stop')
      return { state: stopped ? 'exited' : 'stopping' }
    }
  }
  const profile = {
    id: 'computer',
    provider: 'opencode',
    version: 'profile-v1',
    workspaceIds: [workspaceId],
    executionEnvironment: 'computer'
  }
  const strategy = new OpenCodeRuntimeStrategy(new ProcessRuntime(ConfigSchema.parse({ profiles: [profile] })))
  const context = {
    invocationId,
    scope: {
      tenantId: 'tenant',
      organizationId: 'org',
      userId: 'user',
      workspaceId,
      parentExecutionId: 'parent',
      callerAgentKey: 'leader'
    },
    capabilities: new DefaultRuntimeCapabilityRegistry().register(AgentExecutionRunnerCapability, runner),
    async checkpoint(snapshot) {
      snapshots.push(structuredClone(snapshot))
      events.push('checkpoint')
    }
  }
  const request = {
    operationId: invocationId,
    target: {
      bindingId: 'binding',
      provider: 'opencode',
      revision: 'v1',
      reference: 'computer',
      configuration: { profileVersion: 'profile-v1', executionEnvironment: { type: 'computer' } }
    },
    input: { prompt: 'Write code' }
  }
  return {
    strategy,
    context,
    request,
    events,
    snapshots,
    receipt,
    complete() {
      state = 'idle'
    },
    exit() {
      stopped = true
    },
    output(value) {
      output = value
    },
    failExport() {
      exportFailure = true
    },
    emptyExport() {
      emptyExport = true
    }
  }
}

test('managed OpenCode checkpoints the runner and session before a single async dispatch', async () => {
  const f = setup()
  const started = await f.strategy.start(f.request, f.context)
  assert.deepEqual(f.events, ['reserve', 'checkpoint', '/session', 'checkpoint', '/session/session/prompt_async'])
  assert.deepEqual(started.handle.runner, f.receipt)
  f.complete()
  const recovered = await f.strategy.start({ ...f.request, previous: started.handle }, f.context)
  assert.equal(recovered.status, 'succeeded')
  assert.equal(recovered.result.text, 'implemented')
  assert.equal(recovered.result.data.workingDirectory, f.receipt.workingDirectory)
  assert.equal(recovered.result.artifacts, undefined)
  assert.equal(recovered.result.export.status, 'not_requested')
  assert.deepEqual(f.events.slice(-2), ['checkpoint', 'stop'])
  assert.equal(f.events.includes('artifacts'), false)
  assert.equal(f.events.filter((event) => event === 'reserve').length, 1)
  assert.equal(f.events.filter((event) => event.endsWith('prompt_async')).length, 1)
})

test('managed cancellation requires runner exit, not an abort acknowledgement', async () => {
  const f = setup(),
    started = await f.strategy.start(f.request, f.context)
  assert.equal((await f.strategy.cancel(started.handle, f.context)).status, 'cancelling')
  f.exit()
  assert.equal((await f.strategy.cancel(started.handle, f.context)).status, 'cancelled')
})

test('an incomplete runner checkpoint remains unknown and never re-dispatches', async () => {
  const f = setup()
  await f.strategy.start(f.request, f.context)
  const pending = f.snapshots[0].handle
  const before = f.events.length
  assert.equal((await f.strategy.start({ ...f.request, previous: pending }, f.context)).status, 'unknown')
  assert.equal(f.events.length, before)
})

test('does not stop the guest when terminal result persistence fails', async () => {
  const f = setup(),
    started = await f.strategy.start(f.request, f.context)
  f.complete()
  f.context.checkpoint = async () => {
    throw new Error('database unavailable')
  }
  await assert.rejects(f.strategy.inspect(started.handle, f.context), /database unavailable/)
  assert.equal(f.events.includes('stop'), false)
})

for (const fail of [false, true])
  test(`explicit delivery collects selected files; export failure=${fail} preserves execution`, async () => {
    const f = setup()
    f.request.input.delivery = { mode: 'files', paths: ['report.txt'] }
    f.output(
      '```xpert-task-result\n' +
        JSON.stringify({
          version: 1,
          summary: 'Done',
          items: [{ type: 'file', id: 'report', title: 'Report', summary: 'Test results', path: 'report.txt' }]
        }) +
        '\n```'
    )
    if (fail) f.failExport()
    const started = await f.strategy.start(f.request, f.context)
    f.complete()
    const result = await f.strategy.inspect(started.handle, f.context)
    assert.equal(result.status, 'succeeded')
    assert.equal(result.result.text, 'Done')
    assert.equal(result.result.export.status, fail ? 'failed' : 'completed')
    assert.equal(f.events.filter((e) => e === 'artifacts').length, 1)
    assert.equal(f.events.at(-1), 'stop')
  })

test('caller-selected paths do not depend on incomplete model file declarations', async () => {
  const f = setup()
  f.request.input.delivery = { mode: 'archive', paths: ['report.txt'] }
  f.output(
    '```json\n' +
      JSON.stringify({
        version: 1,
        summary: 'Done',
        items: [
          {
            type: 'file',
            id: 'extra',
            title: 'Extra',
            summary: 'Do not export this unrequested path',
            path: 'extra.txt'
          }
        ]
      }) +
      '\n```'
  )
  const started = await f.strategy.start(f.request, f.context)
  f.complete()
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.result.export.status, 'completed')
  assert.equal(f.events.filter((e) => e === 'artifacts').length, 1)
})

test('an empty artifact collection is a failed export, not a failed task or downloadable result', async () => {
  const f = setup()
  f.request.input.delivery = { mode: 'files', paths: ['report.txt'] }
  f.emptyExport()
  const started = await f.strategy.start(f.request, f.context)
  f.complete()
  const result = await f.strategy.inspect(started.handle, f.context)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.text, 'implemented')
  assert.equal(result.result.export.status, 'failed')
  assert.equal(result.result.artifacts, undefined)
  assert.equal(f.events.at(-1), 'stop')
})

test('without caller paths, delivery uses only final file items', async () => {
  const f = setup()
  f.request.input.delivery = { mode: 'files' }
  f.output(
    '```json\n' +
      JSON.stringify({
        version: 1,
        summary: 'Done',
        items: [{ type: 'file', id: 'report', title: 'Report', summary: 'Requested report', path: 'report.txt' }]
      }) +
      '\n```'
  )
  const started = await f.strategy.start(f.request, f.context)
  f.complete()
  assert.equal((await f.strategy.inspect(started.handle, f.context)).result.export.status, 'completed')
})
