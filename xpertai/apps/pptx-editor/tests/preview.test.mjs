import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { PptxPreview } from '../dist/lib/preview.js'
import { pptxResourceCard } from '../dist/lib/resource-card.js'
import { parseResourceCard } from '@xpert-ai/contracts'

const sha = buffer => createHash('sha256').update(buffer).digest('hex')
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7X0AAAAASUVORK5CYII=', 'base64')
const input = { actor: { tenantId: 'tenant', organizationId: 'organization', userId: 'user' }, projectId: 'project',
  source: { providerKey: 'spaces', resourceId: 'presentation' } }
function fixture(sourceInput = input) {
  const storage = new Map(), calls = { reads: 0, runs: 0 }, state = { bytes: Buffer.from('pptx revision 1'), denied: false, available: true, changeDuringRun: false }
  const runRequests = []
  const files = { previewSource: async value => {
    assert.deepEqual(value, sourceInput); calls.reads++
    if (state.denied) throw new ForbiddenException('revoked')
    return state.bytes
  } }
  const projectFiles = { read: async ({ path }) => {
    if (!storage.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return { buffer: storage.get(path) }
  }, write: async ({ path, buffer, expectedHash }) => {
    assert.equal(expectedHash, null)
    if (storage.has(path)) throw Object.assign(new Error('exists'), { status: 409 })
    storage.set(path, buffer)
  } }
  const engine = { run: async value => {
    assert.equal(value.action, 'render'); assert.equal(value.offset, 0); assert.equal(value.limit, 1)
    return { html: '<section><div>Actual slide</div></section>' }
  } }
  const jobs = { getActionHealth: async () => ({ available: state.available }), run: async request => {
    calls.runs++
    runRequests.push(request)
    assert.equal(request.action, 'pptx.cover'); assert.equal(request.timeoutMs, 20000)
    const source = storage.get(request.files[0].reference.filePath)
    assert.equal(request.files[0].sha256, sha(source))
    assert.equal(request.files[0].size, source.length)
    assert.equal(request.outputs[0].destination.projectId, sourceInput.projectId)
    if (state.changeDuringRun) state.bytes = Buffer.from('changed presentation')
    return { outputs: [{ path: 'cover.png', mimeType: 'image/png', sha256: sha(image), reference: { filePath: 'rendered.png' } }] }
  } }
  const capabilities = { 'platform.project.files': projectFiles, 'platform.sandbox.jobs': jobs,
    'platform.workspace.files': { readBuffer: async () => ({ buffer: image }) } }
  const runtime = { get: key => capabilities[key.id], require: key => { assert.ok(capabilities[key.id], key.id); return capabilities[key.id] } }
  let status, queueRequest
  const queue = { getExecutionPoolHealth: async () => ({ available: state.available }),
    enqueue: async request => {
      queueRequest = request
      assert.deepEqual(Object.keys(request.payload).sort(), ['projectId', 'requestId'])
      assert.equal(request.executionPool, 'sandbox-browser')
      try { await preview.process(request.payload, request); status = 'completed' } catch { status = 'failed' }
      return { jobId: request.jobId }
    }, getJob: async () => ({ state: status }) }
  const preview = new PptxPreview(runtime, files, engine, queue)
  return { preview, state, storage, calls, runRequests, queued: () => queueRequest }
}

test('concurrent actors do not reuse another actors Sandbox Job identity for the same bytes', async () => {
  const otherInput = { ...input, actor: { ...input.actor, userId: 'another-user' } }
  const first = fixture(), second = fixture(otherInput)
  await Promise.all([first.preview.create(input), second.preview.create(otherInput)])
  assert.equal(first.calls.runs, 1)
  assert.equal(second.calls.runs, 1)
  assert.notEqual(first.runRequests[0].idempotencyKey, second.runRequests[0].idempotencyKey)
  assert.equal(first.runRequests[0].scope.userId, input.actor.userId)
  assert.equal(second.runRequests[0].scope.userId, otherInput.actor.userId)
})

test('a real source revision owns its cover; cache hits reauthorize and avoid another render', async () => {
  const f = fixture(), expected = sha(f.state.bytes)
  assert.equal(await f.preview.create(input), expected)
  assert.equal(await f.preview.create(input), expected)
  assert.equal(f.calls.runs, 1)
  assert.equal(f.calls.reads, 5)
  const resolved = await f.preview.resolve(input, expected)
  assert.equal(resolved.mimeType, 'image/png')
  assert.deepEqual(f.storage.get(resolved.reference.filePath), image)
  f.state.denied = true
  await assert.rejects(f.preview.create(input), /revoked/)
  await assert.rejects(f.preview.resolve(input, expected), /revoked/)
})

test('the background renderer restores ownership and rejects tampered or cross-actor requests', async () => {
  const f = fixture()
  await f.preview.create(input)
  const queued = f.queued()
  await assert.rejects(f.preview.process(queued.payload, { ...queued, userId: 'different-user' }), /scope_invalid/)
  await assert.rejects(f.preview.process(queued.payload, { ...queued, tenantId: null }), /scope_invalid/)
  f.storage.set(`presentation-previews/requests/${queued.payload.requestId}.json`, Buffer.from('{}'))
  await assert.rejects(f.preview.process(queued.payload, queued), /scope_invalid/)
  assert.equal(f.calls.runs, 1)
})

test('changed source and unavailable runtime never publish a stale or fabricated image', async () => {
  const f = fixture(), oldHash = sha(f.state.bytes)
  f.state.available = false
  assert.equal(await f.preview.create(input), undefined)
  assert.equal(f.calls.runs, 0)
  f.state.available = true; f.state.changeDuringRun = true
  assert.equal(await f.preview.create(input), undefined)
  assert.equal([...f.storage.keys()].filter(path => path.endsWith('.png')).length, 0)
  await assert.rejects(f.preview.resolve(input, oldHash), /preview_stale/)
})

test('cover and download share the authorized snapshot while editing keeps the original identity', () => {
  const original = { viewKey: 'pptx_editor.views__pptx_editor.editor', selectionId: 'original', parameters: { filePath: 'original.pptx' } }
  const snapshot = { ...original, selectionId: 'snapshot', parameters: { filePath: 'snapshot.pptx' }, resource: { resourceRef: { providerKey: 'spaces', resourceId: 'snapshot' } } }
  const card = pptxResourceCard('project', 'original.pptx', '企业汇报', original, { coverHash: sha(image), slideCount: 3,
    download: { filePath: 'snapshot.pptx', resolved: snapshot } })
  assert.deepEqual(parseResourceCard(card), card)
  assert.equal(card.open.selectionId, 'original')
  const cover = JSON.parse(card.content[0].images[0].file.fileKey)
  const file = JSON.parse(card.content[1].files[0].file.fileKey)
  assert.equal(cover.kind, 'cover'); assert.equal(cover.sha256, sha(image))
  assert.deepEqual(cover.source, file)
  assert.ok(!JSON.stringify(card).includes('base64'))
})
