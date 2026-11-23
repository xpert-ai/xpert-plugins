import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('the adapter loads without retired envelope schemas and preserves ordinary output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xpert-result-sdk-compat-'))
  try {
    const sdk = join(root, 'node_modules/@xpert-ai/plugin-sdk')
    await mkdir(sdk, { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(join(sdk, 'package.json'), JSON.stringify({ type: 'module', exports: './index.js' }))
    // Expose only the current result contract; removed envelope exports must not be imported.
    await writeFile(join(sdk, 'index.js'),
      `export { agentOutputDeliverySchema, AGENT_TASK_REPORT_MAX_BYTES } from ${JSON.stringify(import.meta.resolve('@xpert-ai/plugin-sdk'))}\n`)
    await copyFile(new URL('../dist/lib/task-result.js', import.meta.url), join(root, 'task-result.js'))
    const reference = '```xpert-task-result-file\n' + JSON.stringify({ version: 1, path: 'result.json', sha256: 'a'.repeat(64) }) + '\n```'
    await writeFile(join(root, 'check.mjs'), `
      import assert from 'node:assert/strict'
      import { resolveTaskResult, resultInstructions } from './task-result.js'
      const result = await resolveTaskResult('Plain result', { mode: 'none' })
      assert.equal(result.text, 'Plain result')
      assert.doesNotMatch(resultInstructions({ mode: 'none' }, true), /xpert-task-result/)
      let reads = 0
      const literal = await resolveTaskResult(${JSON.stringify(reference)}, { mode: 'none' }, async () => { reads++; throw Error('must not read') })
      assert.equal(literal.text, ${JSON.stringify(reference)})
      assert.equal(reads, 0)
    `)
    const child = spawnSync(process.execPath, ['check.mjs'], { cwd: root, encoding: 'utf8', timeout: 15000 })
    assert.equal(child.status, 0, child.error?.message ?? child.stderr)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
