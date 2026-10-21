const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { libraryLocks, bundledLibraries, resolveLibraryAssets, libraryRequestsSchema } = require('../dist/lib/document-libraries.js')
const { encodeDashboardPackage, decodeDashboardPackage } = require('../dist/lib/document-package.js')
const example = require('../examples/postgres-sales.json')

test('packaged catalog resolves exact ECharts/Three.js versions and admits only named libraries', async () => {
  const locks = await libraryLocks(['echarts', 'three'])
  assert.deepEqual(locks.map(item => [item.id, item.version, item.global]), [['echarts', '5.6.0', 'echarts'], ['three', '0.185.1', 'THREE']])
  assert(!JSON.stringify(locks).includes('source'))
  const assets = await resolveLibraryAssets(locks)
  for (const asset of assets) assert.equal(asset.sha256, createHash('sha256').update(asset.source).digest('hex'))
  assert.equal(libraryRequestsSchema.safeParse(['https://cdn.example/library.js']).success, false)
  await assert.rejects(resolveLibraryAssets([{ ...locks[0], version: '99.0.0' }]), /LOCK_UNAVAILABLE/)
})

test('Artifact package retains original bytes after catalog upgrade/removal and rejects corruption', async () => {
  const assets = await bundledLibraries(), locks = await libraryLocks(['echarts', 'three'])
  const manifest = { ...example, charts: [], tables: [], presentation: { type: 'html', html: '<html><body>Saved</body></html>', dependencies: locks } }
  const bytes = encodeDashboardPackage(manifest, assets), opened = decodeDashboardPackage(bytes)
  assert.deepEqual(opened.manifest, manifest)
  assert.deepEqual(opened.dependencies, assets)
  const retained = await resolveLibraryAssets(locks, opened.dependencies, async () => { throw Error('Catalog removed by upgrade') })
  assert.deepEqual(retained, assets)
  const corrupted = JSON.parse(bytes); corrupted.dependencies[0].source += ' '
  assert.throws(() => decodeDashboardPackage(Buffer.from(JSON.stringify(corrupted))), /INTEGRITY/)
  const missing = JSON.parse(bytes); missing.dependencies.pop()
  assert.throws(() => decodeDashboardPackage(Buffer.from(JSON.stringify(missing))), /LOCK_MISMATCH/)
  assert.deepEqual(decodeDashboardPackage(Buffer.from(JSON.stringify(example))), { manifest: example, dependencies: [] })
})
