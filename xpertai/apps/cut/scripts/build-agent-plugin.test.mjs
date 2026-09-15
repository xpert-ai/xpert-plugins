import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildAgentPlugin } from './build-agent-plugin.mjs'

test('builds a standalone client package from the same skill sources', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cut-agent-test-'))
  try {
    const output = join(temp, 'xpert-cut-agent')
    await buildAgentPlugin({ output, mcpUrl: 'https://cut.example.test/api/mcp/p/team' })
    assert.deepEqual((await readdir(output)).sort(), ['README.md', 'assets', 'mcp.json', 'plugin.json', 'skills'])
    const manifest = JSON.parse(await readFile(join(output, 'plugin.json'), 'utf8'))
    assert.equal(manifest.name, 'xpert-cut-agent')
    const mcp = JSON.parse(await readFile(join(output, 'mcp.json'), 'utf8'))
    assert.deepEqual(mcp.mcpServers.cut, { type: 'streamable-http', url: 'https://cut.example.test/api/mcp/p/team' })
    const source = new URL('../skills/', import.meta.url)
    for (const skill of await readdir(source)) {
      assert.equal(await readFile(join(output, 'skills', skill, 'SKILL.md'), 'utf8'),
        await readFile(new URL(`${skill}/SKILL.md`, source), 'utf8'))
    }
    for (const entry of ['mcp.md', 'xpert.md']) {
      assert.equal(await readFile(join(output, 'skills/cut-agent-skill/references', entry), 'utf8'),
        await readFile(new URL(`cut-agent-skill/references/${entry}`, source), 'utf8'))
    }
    await assert.rejects(buildAgentPlugin({ output, mcpUrl: 'https://other.example.test/mcp' }), /exist/i)
    assert.equal(JSON.parse(await readFile(join(output, 'mcp.json'), 'utf8')).mcpServers.cut.url,
      'https://cut.example.test/api/mcp/p/team')
  } finally { await rm(temp, { recursive: true, force: true }) }
})

for (const mcpUrl of ['', 'http://example.test/mcp', 'https://user:secret@example.test/mcp',
  'https://example.test/mcp?token=secret', 'https://example.test/mcp#token']) {
  test(`rejects invalid or credential-bearing endpoint ${mcpUrl.split(':')[0]}`, async () => {
    await assert.rejects(buildAgentPlugin({ output: '/unused/xpert-cut-agent', mcpUrl }), /HTTPS|credentials|query|fragment|URL/)
  })
}

for (const host of ['localhost', '127.0.0.1', '[::1]']) {
  test(`allows explicit local HTTP for ${host}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), 'cut-agent-local-test-'))
    try {
      const output = join(temp, 'xpert-cut-agent')
      const mcpUrl = `http://${host}:3301/api/mcp/p/local`
      await assert.rejects(buildAgentPlugin({ output, mcpUrl }), /HTTPS/)
      await buildAgentPlugin({ output, mcpUrl, allowLocalHttp: true })
      const mcp = JSON.parse(await readFile(join(output, 'mcp.json'), 'utf8'))
      assert.equal(mcp.mcpServers.cut.url, mcpUrl)
    } finally { await rm(temp, { recursive: true, force: true }) }
  })
}

for (const mcpUrl of ['http://example.test/mcp', 'http://localhost.example.test/mcp',
  'http://127.0.0.1:3301/mcp?token=secret', 'http://user:secret@localhost/mcp']) {
  test('local HTTP option still rejects remote hosts and credentials', async () => {
    await assert.rejects(buildAgentPlugin({ output: '/unused/xpert-cut-agent', mcpUrl, allowLocalHttp: true }),
      /HTTPS|credentials|query|fragment/)
  })
}
