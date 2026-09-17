import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  SandboxJobRuntimeError,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { OpenDataLoaderSandboxConverter } from '../dist/lib/convert.js'
import { ACTION_VERSION } from '../dist/lib/types.js'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const options = {
  fileScope: { tenantId: 'tenant-a', catalog: 'knowledges', scopeId: 'kb-a' },
  documentId: 'doc-a',
  stage: 'prod'
}

// Execute the real Action runner; substitute only the expensive conversion engine.
// The Job double follows Core's exit-status and successful-result reuse contract.
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'opendataloader-retry-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(
    path.join(root, 'runner.mjs'),
    await readFile(new URL('../sandbox-actions/convert/runner.mjs', import.meta.url))
  )
  await writeFile(
    path.join(root, 'convert.mjs'),
    `
export async function convert() {
  const value = JSON.parse(process.env.TEST_CONVERSION_RESULT)
  if (!value.ok) throw Object.assign(new Error(value.code), value)
  return value
}`
  )
  const state = {
    result: { ok: true, markdown: 'Converted text', assets: [] },
    health: { available: true, sandboxRuntimeVersion: '1.2.1', manifest: { dependenciesSha256: 'a'.repeat(64) } },
    attempts: 0,
    requests: [],
    jobs: new Map(),
    outputs: new Map()
  }
  const jobs = {
    getActionHealth: async () => state.health,
    cancel: async () => {},
    run: async (request) => {
      state.requests.push(request)
      const cached = state.jobs.get(request.idempotencyKey)
      if (cached?.status === 'succeeded') return cached.result
      state.attempts++
      const requestPath = path.join(root, 'request.json')
      await writeFile(
        requestPath,
        JSON.stringify({
          contractVersion: '1',
          action: request.action,
          actionVersion: request.actionVersion,
          payload: request.payload
        })
      )
      const execution = spawnSync(
        process.execPath,
        [path.join(root, 'runner.mjs'), '--request', requestPath, '--output', path.join(root, 'output')],
        {
          env: { ...process.env, TEST_CONVERSION_RESULT: JSON.stringify(state.result) },
          encoding: 'utf8',
          timeout: 10000
        }
      )
      assert.equal(execution.error, undefined)
      if (execution.status !== 0) {
        state.jobs.set(request.idempotencyKey, { status: 'failed' })
        throw new SandboxJobRuntimeError('SANDBOX_START_FAILED', execution.stderr, true, request.jobId)
      }
      const data = await readFile(path.join(root, 'output/result.json'))
      state.outputs.set(request.jobId, data)
      const result = {
        id: request.jobId,
        runtimeProfile: 'managed',
        status: 'succeeded',
        outputs: [{ path: 'result.json', size: data.length, sha256: sha(data), reference: { filePath: request.jobId } }]
      }
      state.jobs.set(request.idempotencyKey, { status: 'succeeded', result })
      return result
    }
  }
  const files = {
    resolveRuntimeReference: async (input) => ({ ...input, filePath: 'original.pdf' }),
    readBuffer: async (reference) => ({
      buffer:
        reference.filePath === 'original.pdf' ? Buffer.from('original PDF') : state.outputs.get(reference.filePath)
    })
  }
  const converter = new OpenDataLoaderSandboxConverter({
    get: (token) =>
      token === SandboxJobsRuntimeCapability ? jobs : token === WorkspaceFilesRuntimeCapability ? files : undefined
  })
  return { state, jobs, converter }
}

for (const code of ['RESOURCE_LIMIT', 'RUNTIME_INVALID']) {
  test(`a ${code} failure is retryable after recovery and only success is reused`, async (t) => {
    const { state, converter } = await fixture(t)
    state.result = { ok: false, code }
    await assert.rejects(converter.convert('x', 'pdf', options), (error) => error.message === 'OPENDATALOADER_' + code)
    assert.equal([...state.jobs.values()][0].status, 'failed')
    state.result = { ok: true, markdown: 'Recovered conversion', assets: [] }
    assert.equal((await converter.convert('x', 'pdf', options)).markdown, 'Recovered conversion')
    assert.equal((await converter.convert('x', 'pdf', options)).markdown, 'Recovered conversion')
    assert.equal(state.attempts, 2)
    assert.equal(new Set(state.requests.map((request) => request.jobId)).size, 1)
  })
}

test('a failed Job retains its bounded parser error code and affected pages', async (t) => {
  const { state, converter } = await fixture(t)
  state.result = { ok: false, code: 'NEEDS_OCR', pages: [2, 4] }
  await assert.rejects(converter.convert('x', 'pdf', options), (error) => {
    assert.equal(error.message, 'OPENDATALOADER_NEEDS_OCR')
    assert.deepEqual(error.pages, [2, 4])
    return true
  })
  assert.equal([...state.jobs.values()][0].status, 'failed')
})

test('changed local Runtime dependencies create a new Job without losing successful-result reuse', async (t) => {
  const { state, converter } = await fixture(t)
  assert.equal((await converter.convert('x', 'pdf', options)).markdown, 'Converted text')
  state.health.manifest.dependenciesSha256 = 'b'.repeat(64)
  state.result = { ok: true, markdown: 'New runtime result', assets: [] }
  assert.equal((await converter.convert('x', 'pdf', options)).markdown, 'New runtime result')
  assert.equal((await converter.convert('x', 'pdf', options)).markdown, 'New runtime result')
  assert.equal(state.attempts, 2)
  assert.notEqual(state.requests[0].jobId, state.requests[1].jobId)
  assert.equal(state.requests[1].jobId, state.requests[2].jobId)
  assert.notEqual(state.requests[0].outputs[0].destination.folder, state.requests[1].outputs[0].destination.folder)
})

test('unrelated or malformed Runtime errors are preserved', async (t) => {
  const { converter, jobs } = await fixture(t)
  for (const message of [
    'Sandbox export timed out after 300000ms.',
    'OPENDATALOADER_CONVERSION_ERROR: not-json',
    'OPENDATALOADER_CONVERSION_ERROR: {"ok":false,"code":"UNTRUSTED_CODE"}',
    'OPENDATALOADER_CONVERSION_ERROR: {"ok":false,"code":"NEEDS_OCR","pages":[-1]}'
  ]) {
    const original = new SandboxJobRuntimeError('EXPORT_TIMEOUT', message, true, 'job-a')
    jobs.run = async () => {
      throw original
    }
    await assert.rejects(converter.convert('x', 'pdf', options), (error) => error === original)
  }
})

test('Action patch revision avoids previously cached conversion failures', () => {
  assert.equal(ACTION_VERSION, '1.2.1')
})
