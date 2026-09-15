import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { test } from 'node:test'
import { installCodex } from './install-codex.mjs'

const execute = promisify(execFile)
test('CLI entry works when invoked through a symbolic link', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cut-entry-test-'))
  try {
    const entry = join(temp, 'install.mjs')
    await symlink(fileURLToPath(new URL('./install-codex.mjs', import.meta.url)), entry)
    const { stdout } = await execute(process.execPath, [entry, '--help'])
    assert.match(stdout, /Usage:.*install-codex/)
  } finally { await rm(temp, { recursive: true, force: true }) }
})

test('real Codex CLI installs and updates in an isolated configuration', {
  skip: process.env.CUT_TEST_CODEX !== '1'
}, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cut-cli-test-'))
  const codexDirectory = join(temp, 'codex')
  const directory = join(temp, 'source')
  await mkdir(codexDirectory)
  const run = async (args) => { await execute('codex', args, {
    env: { ...process.env, CODEX_HOME: codexDirectory }, timeout: 60000
  }) }
  try {
    await installCodex({ directory, mcpUrl: 'https://example.test/mcp', apiKey: 'fixture-key', verify: async()=>{}, run })
    await installCodex({ directory, update: true, verify: async()=>{}, run })
    const manifest = JSON.parse(await readFile(join(directory, 'plugins/xpert-cut-agent/plugin.json'), 'utf8'))
    const cache = join(codexDirectory, 'plugins/cache/xpert-cut-codex-local/xpert-cut-agent', manifest.version)
    assert.equal(JSON.parse(await readFile(join(cache, 'mcp.json'), 'utf8')).mcpServers.cut.headers.Authorization, 'Bearer fixture-key')
    assert.equal((await readdir(join(cache, 'skills'))).length, 5)
  } finally { await rm(temp, { recursive: true, force: true }) }
})
