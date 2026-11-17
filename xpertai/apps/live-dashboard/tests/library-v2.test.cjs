const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { zipSync, unzipSync } = require('fflate')
const { graph, asset, header } = require('./library-v2-fixture.cjs')
const { resourceV2Schema, limits } = require('../dist/lib/library/resource-contract.js')
const { parseLibraryJson, resourceHash, canonicalJson } = require('../dist/lib/library/resource-json.js')
const { encodePackage, decodePackage, remapPackage, reference } = require('../dist/lib/library/archive.js')
const { validateAsset } = require('../dist/lib/library/asset-validation.js')
const { LibraryFileArtifactType } = require('../dist/lib/library/file-artifact.provider.js')

test('V2 roundtrip carries a non-hotel task, exact dependencies and file bytes separately', () => {
  const f = graph(), bytes = encodePackage(f.package), result = decodePackage(bytes)
  assert.equal(result.resources.length, 4)
  assert.equal(result.resources.at(-1).kind, 'example-task')
  assert.deepEqual(result.blobs.get(f.file.sha256), f.bytes)
  assert.deepEqual(encodePackage(result), bytes, 'ZIP encoding is deterministic')
  assert.equal(JSON.stringify(result.resources).includes('2026-01,120'), false)
  assert.equal(Object.keys(unzipSync(bytes)).filter(name => name.startsWith('blobs/')).length, 1)
})
test('V2 copy rewrites every dependency and digest, and remains stable on retry', () => {
  const f = graph(), ids = Object.fromEntries(f.package.resources.map(d => [d.logicalId, randomUUID()]))
  const copy = remapPackage(f.package, ids), task = copy.resources.find(d => d.kind === 'example-task')
  assert.equal(task.logicalId, ids[f.task.logicalId])
  for (const dep of task.dependencies) {
    const child = copy.resources.find(d => d.logicalId === dep.logicalId)
    assert.equal(dep.sha256, resourceHash(child))
    assert.notEqual(dep.sha256, f.task.dependencies.find(d => d.alias === dep.alias).sha256)
  }
  assert.deepEqual(encodePackage(copy), encodePackage(remapPackage(f.package, ids)))
  assert.deepEqual(copy.blobs, f.package.blobs)
})
test('V2 archives reject missing/unreferenced data, changed hashes and duplicate roots', () => {
  const f = graph()
  assert.throws(() => encodePackage({ ...f.package, blobs: new Map() }), /ASSET_MISSING/)
  assert.throws(() => encodePackage({ ...f.package, resources: [f.task] }), /DEPENDENCY_MISSING/)
  assert.throws(() => encodePackage({ ...f.package, roots: [...f.package.roots, ...f.package.roots] }), /DUPLICATE/)
  const extra = { ...header('visual-theme'), content: { renderer: 'live-dashboard.standard', theme: 'system' } }
  assert.throws(() => encodePackage({ ...f.package, resources: [...f.package.resources, extra] }), /UNREFERENCED/)
  f.template.title = 'Tampered definition'
  assert.throws(() => encodePackage(f.package), /DEPENDENCY_INTEGRITY/)
})
test('V2 manifests and content hashes reject tampering and unknown package fields', () => {
  const f = graph(), files = unzipSync(encodePackage(f.package))
  files[`blobs/sha256/${f.file.sha256}`] = Buffer.from('changed')
  assert.throws(() => decodePackage(Buffer.from(zipSync(files))), /INTEGRITY/)
  const original = unzipSync(encodePackage(f.package)), manifest = JSON.parse(Buffer.from(original['manifest.json']).toString())
  manifest.tenantId = 'not portable'
  original['manifest.json'] = Buffer.from(JSON.stringify(manifest))
  assert.throws(() => decodePackage(Buffer.from(zipSync(original))))
})
test('V2 rejects path traversal, symlinks, truncated ZIPs and oversized declared expansions', () => {
  assert.throws(() => decodePackage(Buffer.from(zipSync({ '../manifest.json': Buffer.from('{}') }))), /ENTRY_INVALID/)
  const bytes = encodePackage(graph().package), end = bytes.length - 22, start = bytes.readUInt32LE(end + 16)
  const symlink = Buffer.from(bytes); symlink.writeUInt32LE((0xa000 << 16) >>> 0, start + 38)
  assert.throws(() => decodePackage(symlink), /ENTRY_INVALID/)
  const bomb = Buffer.from(bytes); bomb.writeUInt32LE(limits.expandedBytes + 1, start + 24)
  assert.throws(() => decodePackage(bomb), /ENTRY_INVALID/)
  assert.throws(() => decodePackage(bytes.subarray(0, bytes.length - 1)), /ENTRY_INVALID/)
})
test('untrusted JSON rejects duplicate/escaped/prototype keys, bad UTF-8 and excess nesting', () => {
  for (const value of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"__proto__":{}}', '{"a":{"constructor":1}}']) {
    assert.throws(() => parseLibraryJson(Buffer.from(value)), /JSON_KEY/)
  }
  assert.throws(() => parseLibraryJson(Buffer.from('['.repeat(65) + '0' + ']'.repeat(65))), /JSON_DEPTH/)
  assert.throws(() => parseLibraryJson(Buffer.from([0xff, 0xfe])))
  assert.throws(() => parseLibraryJson(Buffer.from('{"x":1e400}')), /JSON_NUMBER/)
  assert.deepEqual(parseLibraryJson(Buffer.from('{"a":[{"a":1}],"b":2}')), { a: [{ a: 1 }], b: 2 })
})
test('resource contracts exclude host storage identities, inline dataset rows and unknown renderers', () => {
  const f = graph()
  for (const doc of [{ ...f.template, storage: 'minio' }, { ...f.dataset, content: { ...f.dataset.content, rows: [] } },
    { ...f.template, content: { ...f.template.content, presentation: { type: 'custom', code: 'x' } } }]) {
    assert.equal(resourceV2Schema.safeParse(doc).success, false)
  }
  const invalid = structuredClone(f.template); invalid.content.presentation.charts[0].y = 'missing'
  assert.equal(resourceV2Schema.safeParse(invalid).success, false)
  invalid.content.presentation.charts[0].y = 'month'
  assert.equal(resourceV2Schema.safeParse(invalid).success, false)
  const badTask = structuredClone(f.task); badTask.content.execution.templateAlias = 'data'
  assert.equal(resourceV2Schema.safeParse(badTask).success, false)
  const parameter = { key: 'period', label: 'Period', type: 'date', defaultValue: '2026-02-30' }
  assert.equal(resourceV2Schema.safeParse({ ...f.template, content: { ...f.template.content, parameters: [parameter] } }).success, false)
  parameter.defaultValue = '2026-99-99'
  assert.equal(resourceV2Schema.safeParse({ ...f.template, content: { ...f.template.content, parameters: [parameter] } }).success, false)
})
test('SVG covers permit passive artwork and block scripts, external content and disguised MIME', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path d="M0 0h100v60H0" fill="#10263A"/></svg>'
  const check = text => { const bytes = Buffer.from(text); validateAsset(asset(bytes, { mimeType: 'image/svg+xml', fileName: 'cover.svg', purpose: 'cover' }), bytes) }
  check(svg)
  for (const extra of ['<script>alert(1)</script>', '<foreignObject/>', '<image href="https://example.com/a.png"/>', '<path onclick="x()"/>', '<path fill="url(https://example.com)"/>', '<use href="//example.com"/>']) {
    assert.throws(() => check(`<svg>${extra}</svg>`), /SVG_UNSAFE/)
  }
  const bytes = Buffer.from(svg)
  assert.throws(() => validateAsset(asset(bytes, { mimeType: 'image/png', fileName: 'cover.png' }), bytes), /ASSET_TYPE/)
  assert.throws(() => validateAsset(asset(bytes), Buffer.from('changed')), /ASSET_INTEGRITY/)
})
test('library file Artifact policy remains owner-only and validates stored content', async () => {
  const provider = new LibraryFileArtifactType()
  assert.deepEqual(provider.definition.sharing.accessModes, ['owner_only'])
  const source = { pluginName: '@xpert-ai/plugin-live-dashboard', resourceType: 'live-dashboard-library-file', userId: 'owner', tenantId: 'tenant' }
  await provider.authorize(source, { userId: 'owner', tenantId: 'tenant' })
  await assert.rejects(provider.authorize(source, { userId: 'visitor', tenantId: 'tenant' }), /DENIED/)
  await assert.rejects(provider.authorize(source, { userId: 'owner', tenantId: 'other' }), /DENIED/)
})
