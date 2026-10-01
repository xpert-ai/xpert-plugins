import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { SandboxJobsRuntimeCapability, WorkspaceFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { OpenDataLoaderSandboxConverter } from '../dist/lib/convert.js'
import { OpenDataLoaderTransformerStrategy } from '../dist/lib/transformer.strategy.js'
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const scope = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  userId: 'user-a',
  catalog: 'knowledges',
  scopeId: 'kb-a'
}
function fixture(value = { ok: true, markdown: 'Parser result', assets: [] }) {
  const source = Buffer.from('original'),
    data = Buffer.from(JSON.stringify(value)),
    calls = []
  const files = {
    resolveRuntimeReference: async (input) => ({ ...input, filePath: 'original.pdf' }),
    readBuffer: async (reference) => ({ buffer: reference.filePath === 'original.pdf' ? source : data })
  }
  const jobs = {
    getActionHealth: async () => ({ available: true, sandboxRuntimeVersion: '1.2.1', artifactDigest: 'digest' }),
    cancel: async () => {},
    run: async (request) => {
      calls.push(request)
      return {
        id: request.jobId,
        runtimeProfile: 'managed',
        outputs: [{ path: 'result.json', size: data.length, sha256: sha(data), reference: { filePath: 'result.json' } }]
      }
    }
  }
  const converter = new OpenDataLoaderSandboxConverter({
    get: (token) =>
      token === SandboxJobsRuntimeCapability ? jobs : token === WorkspaceFilesRuntimeCapability ? files : undefined
  })
  return { converter, files, jobs, calls, source }
}
const options = { fileScope: scope, documentId: 'doc-a', stage: 'prod' }
test('requires knowledge scope and managed Runtime before submitting a Job', async () => {
  const f = fixture()
  await assert.rejects(f.converter.convert('x', 'pdf', { stage: 'prod' }), /scope/)
  f.jobs.getActionHealth = async () => ({ available: false, reason: 'RUNTIME_UNBOUND' })
  await assert.rejects(f.converter.convert('x', 'pdf', options), /RUNTIME_UNBOUND/)
  assert.equal(f.calls.length, 0)
})
test('retries share identity; tenant, organization, stage and source changes do not', async () => {
  const f = fixture()
  for (const opt of [
    options,
    options,
    { ...options, fileScope: { ...scope, tenantId: 'b' } },
    { ...options, fileScope: { ...scope, organizationId: 'b' } },
    { ...options, stage: 'test' }
  ])
    await f.converter.convert('x', 'pdf', opt)
  assert.equal(f.calls[0].jobId, f.calls[1].jobId)
  assert.equal(new Set(f.calls.map((c) => c.jobId)).size, 4)
  assert.equal(f.calls[0].files[0].sha256, sha(f.source))
  assert.equal(f.calls[0].outputs[0].destination.scopeId, scope.scopeId)
})
test('rejects corrupt output and invalid embedded asset digests before persistence', async () => {
  const f = fixture()
  f.jobs.run = async () => ({ outputs: [{ path: 'result.json', size: 1, sha256: 'invalid', reference: {} }] })
  await assert.rejects(f.converter.convert('x', 'pdf', options), /integrity/)
  const g = fixture({
    ok: true,
    markdown: 'text',
    assets: [{ name: 'a.png', mimeType: 'image/png', data: 'YWJj', size: 3, sha256: '0'.repeat(64) }]
  })
  await assert.rejects(g.converter.convert('x', 'pdf', options), /INVALID_DOCUMENT/)
})
test('preserves actionable conversion failures and never returns empty text', async () => {
  await assert.rejects(
    fixture({ ok: false, code: 'OCR_FAILED', pages: [2] }).converter.convert('x', 'pdf', options),
    (error) => error.message === 'OPENDATALOADER_OCR_FAILED' && error.pages[0] === 2
  )
  await assert.rejects(
    fixture({ ok: true, markdown: '  ', assets: [] }).converter.convert('x', 'pdf', options),
    /EMPTY_TEXT/
  )
})
test('cancel targets the same deterministic Job and retries cancellation before persistence', async () => {
  const f = fixture(),
    controller = new AbortController()
  let attempts = 0,
    cancelId
  f.jobs.cancel = async ({ jobId }) => {
    cancelId = jobId
    if (++attempts === 1) throw new Error('not persisted yet')
  }
  f.jobs.run = async (request) => {
    f.calls.push(request)
    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 220))
    return { id: request.jobId, outputs: [] }
  }
  await assert.rejects(f.converter.convert('x', 'pdf', { ...options, signal: controller.signal }), /abort/i)
  assert.equal(cancelId, f.calls[0].jobId)
  assert.equal(attempts, 2)
})
test('separate conversions never overwrite assets; result metadata remains text', async () => {
  const image = Buffer.from('image'),
    writes = []
  const f = fixture({
    ok: true,
    markdown: '![](xpert-asset://image-1.png)',
    assets: [
      {
        name: 'image-1.png',
        mimeType: 'image/png',
        data: image.toString('base64'),
        size: image.length,
        sha256: sha(image)
      }
    ]
  })
  const strategy = new OpenDataLoaderTransformerStrategy(f.converter)
  const config = {
    ...options,
    permissions: {
      fileSystem: {
        writeFile: async (name, data) => {
          writes.push({ name, data })
          return '/files/' + name
        }
      }
    }
  }
  const result = await strategy.transformDocuments(
    [
      { id: 'doc1', type: 'pdf', filePath: 'x' },
      { id: 'doc2', type: 'pdf', filePath: 'x' }
    ],
    config
  )
  assert.equal(new Set(writes.map((w) => w.name)).size, 4)
  assert.equal(result[0].chunks[0].metadata.mediaType, 'text')
  assert.match(result[0].chunks[0].pageContent, /\/files\//)
  assert.equal(result[0].metadata.assets[0].sourceType, undefined)
})
test('published Action bundle hash covers every copied file', async () => {
  const action = JSON.parse(await readFile(new URL('../dist/sandbox-actions/convert/action.json', import.meta.url)))
  const hash = createHash('sha256')
  for (const name of ['convert.mjs', 'ocr.mjs', 'result.mjs', 'runner.mjs']) {
    const data = await readFile(new URL('../dist/sandbox-actions/convert/bundle/' + name, import.meta.url))
    hash.update(`${name}\0${data.length}\0${sha(data)}\n`)
  }
  assert.equal(action.bundleSha256, hash.digest('hex'))
  assert.equal(action.runtimeContractVersion, '1')
})

test('normalizes extension case and MIME-only PDF uploads', async () => {
  const f = fixture(),
    strategy = new OpenDataLoaderTransformerStrategy(f.converter)
  const config = { ...options, permissions: { fileSystem: { writeFile: async (name) => '/files/' + name } } }
  await strategy.transformDocuments(
    [
      { filePath: 'x', type: '.PDF' },
      { filePath: 'x', mimeType: 'application/pdf' }
    ],
    config
  )
  assert.equal(f.calls[0].payload.extension, 'pdf')
  assert.equal(f.calls[1].payload.extension, 'pdf')
})

test('OCR threshold is normalized, forwarded and part of conversion identity', async () => {
  const f = fixture()
  for (const threshold of [undefined, 0.5, 0.1, 0, 1, null])
    await f.converter.convert('x', 'pdf', { ...options, ocrConfidenceThreshold: threshold })
  assert.deepEqual(
    f.calls.map((call) => call.payload.ocrConfidenceThreshold),
    [0.5, 0.5, 0.1, 0, 1, 0.5]
  )
  assert.equal(f.calls[0].jobId, f.calls[1].jobId)
  assert.equal(new Set(f.calls.map((call) => call.jobId)).size, 4)
  assert.equal(new Set(f.calls.map((call) => call.idempotencyKey)).size, 4)
  assert.equal(new Set(f.calls.map((call) => call.outputs[0].destination.folder)).size, 4)
})

test('invalid thresholds fail validation before health checks or Jobs, including direct converter calls', async () => {
  const f = fixture()
  f.jobs.getActionHealth = async () => assert.fail('must validate before checking Runtime')
  const strategy = new OpenDataLoaderTransformerStrategy(f.converter)
  for (const value of [-0.01, 1.01, NaN, Infinity, '0.1', true]) {
    await assert.rejects(
      strategy.validateConfig({ ...options, ocrConfidenceThreshold: value }),
      /ocrConfidenceThreshold/
    )
    await assert.rejects(
      f.converter.convert('x', 'pdf', { ...options, ocrConfidenceThreshold: value }),
      /ocrConfidenceThreshold/
    )
  }
  assert.equal(f.calls.length, 0)
})

test('parser config exposes the threshold and forwards a document override, including zero', async () => {
  const f = fixture()
  const strategy = new OpenDataLoaderTransformerStrategy(f.converter)
  const field = strategy.meta.configSchema.properties.ocrConfidenceThreshold
  assert.equal(field.default, 0.5)
  assert.equal(field.minimum, 0)
  assert.equal(field.maximum, 1)
  for (const value of [0.1, 0]) {
    await strategy.transformDocuments([{ id: 'doc1', type: 'pdf', filePath: 'x' }], {
      ...options,
      ocrConfidenceThreshold: value,
      permissions: { fileSystem: { writeFile: async (name) => '/files/' + name } }
    })
  }
  assert.deepEqual(
    f.calls.map((call) => call.payload.ocrConfidenceThreshold),
    [0.1, 0]
  )
})
