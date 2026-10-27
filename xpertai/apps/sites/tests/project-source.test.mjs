import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { readProjectSiteSource, stageProjectSiteRestore, siteSourcePath } from '../.artifacts/sites-spec/lib/sites-project-source.js'

const scope = { tenantId: 'tenant', organizationId: 'org', userId: 'user', hostProjectId: 'project' }
const hash = buffer => createHash('sha256').update(buffer).digest('hex')
function fixture() {
  const files = new Map([['.xpert/sites/site/source/index.html', Buffer.from('<h1>current</h1>')]])
  const api = {
    async mkdir() {},
    async list({ path }) { return [...files].filter(([key]) => key.startsWith(`${path}/`)).map(([path, buffer]) => ({ path, kind: 'file', size: buffer.length })) },
    async read({ path }) { const buffer = files.get(path); assert(buffer); return { buffer, sha256: hash(buffer) } },
    async write({ path, buffer, expectedHash }) { assert.equal(expectedHash, null); assert(!files.has(path)); files.set(path, buffer); return { sha256: hash(buffer) } }
  }
  return { files, api, runtime: { require: () => api } }
}

test('restore stages complete source including binary assets without changing current generation', async () => {
  const f = fixture(), binary = Buffer.from([0xff, 0, 0x80])
  const root = await stageProjectSiteRestore(f.runtime, scope, 'site', [
    { path: 'index.html', content: '<h1>older</h1>' }, { path: 'assets/image.bin', content: binary.toString('base64'), encoding: 'base64' }
  ])
  assert.match(root, /^\.xpert\/sites\/site\/restores\//)
  assert.equal(f.files.get('.xpert/sites/site/source/index.html').toString(), '<h1>current</h1>')
  assert.deepEqual(f.files.get(`${root}/assets/image.bin`), binary)
  const restored = await readProjectSiteSource(f.runtime, scope, 'site', root)
  assert.equal(restored.files[0].content, '<h1>older</h1>')
  assert.throws(() => siteSourcePath('other', 'index.html', root), /SITES_SOURCE_PATH_INVALID/)
  assert.throws(() => siteSourcePath('site', '../escape'), /SITES_SOURCE_PATH_INVALID/)
})

test('failed staged restore preserves the current source; no caller pointer was changed', async () => {
  const f = fixture(); f.api.write = async () => { throw Error('storage unavailable') }
  await assert.rejects(stageProjectSiteRestore(f.runtime, scope, 'site', [{ path: 'index.html', content: 'older' }]), /storage unavailable/)
  assert.equal(f.files.get('.xpert/sites/site/source/index.html').toString(), '<h1>current</h1>')
})

test('source capture rejects a file changed by an external writer between reads', async () => {
  const f = fixture(), read = f.api.read; let count = 0
  f.api.read = async input => { if (++count === 2) f.files.set(input.path, Buffer.from('concurrent write')); return read(input) }
  await assert.rejects(readProjectSiteSource(f.runtime, scope, 'site'), /SITES_SOURCE_CHANGED/)
})
