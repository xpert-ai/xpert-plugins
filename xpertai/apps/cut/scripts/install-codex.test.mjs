import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installCodex } from './install-codex.mjs'

test('first install and update keep credentials outside source and preserve connection', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cut-install-test-'))
  const directory = join(temp, 'installation')
  const commands = []
  const run = async (args) => { commands.push(args) }
  const verify = async (connection) => assert.equal(connection.apiKey, 'test-only-key')
  try {
    await installCodex({ directory, mcpUrl: 'https://example.test/mcp', apiKey: 'test-only-key', run, verify })
    const before = JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8'))
    const first = JSON.parse(await readFile(join(directory, 'plugins/xpert-cut-agent/plugin.json'), 'utf8'))
    await installCodex({ directory, update: true, run, verify })
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')), before)
    const second = JSON.parse(await readFile(join(directory, 'plugins/xpert-cut-agent/plugin.json'), 'utf8'))
    assert.notEqual(first.version, second.version)
    const mcp = JSON.parse(await readFile(join(directory, 'plugins/xpert-cut-agent/mcp.json'), 'utf8'))
    assert.equal(mcp.mcpServers.cut.headers.Authorization, 'Bearer test-only-key')
    assert.equal(commands.filter((args) => args[1] === 'add').length, 2)
    await assert.rejects(installCodex({ directory, mcpUrl: before.mcpUrl, apiKey: before.apiKey, run, verify }), /--update/)
  } finally { await rm(temp, { recursive: true, force: true }) }
})

test('authentication failure leaves installation and Codex untouched', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cut-install-test-'))
  const directory = join(temp, 'installation')
  try {
    await assert.rejects(installCodex({ directory, mcpUrl: 'https://example.test/mcp', apiKey: 'bad-key',
      verify: async () => { throw new Error('MCP HTTP 401') },
      run: async () => assert.fail('must not invoke Codex') }), /401/)
    await assert.rejects(readFile(join(directory, 'connection.json')), { code: 'ENOENT' })
  } finally { await rm(temp, { recursive: true, force: true }) }
})

test('failed update validation preserves the existing installation', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cut-install-test-'))
  const directory = join(temp, 'installation')
  try {
    await installCodex({ directory, mcpUrl: 'https://example.test/mcp', apiKey: 'test-key', run: async()=>{}, verify: async()=>{} })
    const original = await readFile(join(directory, 'plugins/xpert-cut-agent/plugin.json'), 'utf8')
    await assert.rejects(installCodex({ directory, update: true, run: async()=>assert.fail(), verify: async()=>{ throw new Error('401') } }), /401/)
    assert.equal(await readFile(join(directory, 'plugins/xpert-cut-agent/plugin.json'), 'utf8'), original)
  } finally { await rm(temp, { recursive:true, force:true }) }
})

test('CLI failure leaves managed source available for retry', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cut-install-test-'))
  const directory = join(temp, 'installation')
  try {
    await assert.rejects(installCodex({ directory, mcpUrl: 'https://example.test/mcp', apiKey: 'test-key',
      verify: async()=>{}, run: async()=>{throw new Error('CLI unavailable')} }), /CLI unavailable/)
    await installCodex({ directory, update: true, verify: async()=>{}, run: async()=>{} })
    assert.equal(JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')).apiKey, 'test-key')
  } finally { await rm(temp, { recursive:true, force:true }) }
})
