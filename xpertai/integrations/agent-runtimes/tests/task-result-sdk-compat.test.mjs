import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('a runtime SDK without the optional file validator can load the adapter and use inline results', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xpert-result-sdk-compat-'))
  try {
    const sdk = join(root, 'node_modules/@xpert-ai/plugin-sdk')
    await mkdir(sdk, { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(join(sdk, 'package.json'), JSON.stringify({ type: 'module', exports: './index.js' }))
    // Retain the real inline validators but expose the older SDK surface without the new named export.
    await writeFile(join(sdk, 'index.js'),
      `export { agentOutputDeliverySchema, agentTaskResultSchema } from ${JSON.stringify(import.meta.resolve('@xpert-ai/plugin-sdk'))}\n`)
    await copyFile(new URL('../dist/lib/task-result.js', import.meta.url), join(root, 'task-result.js'))
    const reference = '```xpert-task-result-file\n' + JSON.stringify({ version: 1, path: 'result.json', sha256: 'a'.repeat(64) }) + '\n```'
    await writeFile(join(root, 'check.mjs'), `
      import assert from 'node:assert/strict'
      import { resolveTaskResult, resultInstructions } from './task-result.js'
      const result = await resolveTaskResult(JSON.stringify({ version: 1, summary: 'Inline works', items: [] }), { mode: 'none' })
      assert.equal(result.text, 'Inline works')
      assert.doesNotMatch(resultInstructions({ mode: 'none' }, true), /result-file submission/)
      let reads = 0
      await assert.rejects(resolveTaskResult(${JSON.stringify(reference)}, { mode: 'none' }, async () => {
        reads++
        return { version: 1, summary: 'must not read', items: [] }
      }), /could not be validated/)
      assert.equal(reads, 0)
    `)
    const child = spawnSync(process.execPath, ['check.mjs'], { cwd: root, encoding: 'utf8', timeout: 15000 })
    assert.equal(child.status, 0, child.error?.message ?? child.stderr)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
