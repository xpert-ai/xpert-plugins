import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCodexExecutable } from './codex-cli.mjs'

for (const code of ['ENOENT', 2]) {
  test(`uses desktop CLI when PATH command fails with ${code}`, async () => {
    const tried = []
    const selected = await resolveCodexExecutable({ platform: 'darwin', probe: async (file, args) => {
      tried.push(file)
      assert.deepEqual(args, ['plugin', 'add', '--help'])
      if (file !== '/Applications/ChatGPT.app/Contents/Resources/codex') throw Object.assign(new Error(), { code })
    } })
    assert.equal(selected, '/Applications/ChatGPT.app/Contents/Resources/codex')
    assert.equal(tried[0], 'codex')
  })
}

test('explicit CLI path is honored without silently choosing another executable', async () => {
  const tried = []
  await assert.rejects(resolveCodexExecutable({ explicitPath: '/custom/codex', probe: async (file) => {
    tried.push(file); throw Object.assign(new Error(), { code: 'ENOENT' })
  } }), /not found/)
  assert.deepEqual(tried, ['/custom/codex'])
})

test('distinguishes missing CLI from unsupported or broken CLI', async () => {
  await assert.rejects(resolveCodexExecutable({ platform: 'linux', probe: async () => {
    throw Object.assign(new Error(), { code: 2 })
  } }), /found, but/)
})
