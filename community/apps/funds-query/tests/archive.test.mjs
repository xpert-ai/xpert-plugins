import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, symlink, rm, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const platform = process.env.XPERT_PLATFORM_ROOT || resolve(root, '../../../../xpert')
const platformRequire = createRequire(join(platform, 'package.json'))
const { buildSync } = platformRequire('esbuild')
const compiled = buildSync({
  entryPoints: [join(platform, 'packages/server/src/plugin/plugin-archive.ts')],
  bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external'
}).outputFiles[0].text
const loaded = { exports: {} }
new Function('require', 'module', 'exports', compiled)(platformRequire, loaded, loaded.exports)
const { extractPluginArchive, cleanupExtractedPluginArchive } = loaded.exports
const directory = await mkdtemp(join(tmpdir(), 'funds-upload-tests-'))
const python = process.env.FUNDS_QUERY_PYTHON || join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const scope = { tenantId: 'archive-tenant', organizationId: 'archive-org', userId: 'archive-user' }
let extracted, PythonClient, config, client, archivePath

test.before(async () => {
  const result = spawnSync(process.execPath, ['scripts/package-plugin.mjs', '--output-dir', directory], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  archivePath = join(directory, `funds-query-${packageJson.version}.zip`)
  extracted = await extractPluginArchive({ buffer: await readFile(archivePath), originalname: 'funds-query.zip' })
  // The host supplies peer packages. This link provides the same peers for the isolated test.
  await symlink(join(root, 'node_modules'), join(extracted.packageDir, 'node_modules'), 'dir')
  ;({ PythonClient } = await import(pathToFileURL(join(extracted.packageDir, 'dist/lib/python-client.js'))))
  config = { pythonExecutable: 'auto', dataDirectory: join(directory, 'data'), timeoutMs: 30000, debug: false }
  client = new PythonClient(config)
})
test.after(async () => {
  await cleanupExtractedPluginArchive(extracted?.tempDir)
  await rm(directory, { recursive: true, force: true })
})

test('upload ZIP is accepted by the production Xpert archive parser', async () => {
  assert.equal(extracted.packageJson.name, '@xpert-ai/plugin-funds-query')
  const manifest = JSON.parse(await readFile(join(extracted.packageDir, 'package.json'), 'utf8'))
  assert.equal(manifest.devDependencies, undefined)
  assert.equal(manifest.dependencies, undefined)
  assert.equal(manifest.scripts, undefined)
  assert.ok(manifest.peerDependencies['reflect-metadata'])
  const release = JSON.parse(await readFile(join(extracted.packageDir, 'release-manifest.json'), 'utf8'))
  assert.equal(release.kind, 'xpert-upload-plugin')
  assert.match(await readFile(join(extracted.packageDir, 'LICENSE'), 'utf8'), /GNU AFFERO GENERAL PUBLIC LICENSE/)
  assert.match(await readFile(join(extracted.packageDir, 'env.example'), 'utf8'), /FUNDS_QUERY_PYTHON=auto/)
  assert.ok(!Object.keys(release.files).some(name => /(^|\/)(src|node_modules|\.venv|\.runtime|local-config.json)(\/|$)/.test(name)))
})
test('packaged Python runs with site-packages disabled and verifies bundled dependencies', async () => {
  const result = spawnSync(python, ['-I', '-S', join(extracted.packageDir, 'python/launch.py'), '--check'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).ok, true)
  const vendor = JSON.parse(await readFile(join(extracted.packageDir, 'python/vendor/manifest.json'), 'utf8'))
  assert.deepEqual(vendor.packages.map(item => item.version), ['3.1.5', '0.7.1', '2.0.0'])
  assert.ok(Object.keys(vendor.files).some(name => /LICENSE|COPYING/.test(name)))
})
test('automatic detection imports a real workbook from the extracted upload package', async () => {
  assert.equal((await client.checkRuntime()).status, 'ready')
  const result = await client.call(scope, 'import', {
    fileName: '标准样例.xlsx', base64: (await readFile(join(root, 'examples/交易明细-标准样例.xlsx'))).toString('base64')
  })
  assert.equal(result.dataset.rowCount, 12)
  assert.equal(result.dataset.amount, '102566.91')
  assert.equal((await client.call(scope, 'context')).datasets.total, 1)
})
test('a missing interpreter is recoverable after a valid executable becomes available', async () => {
  const alias = join(directory, process.platform === 'win32' ? 'repaired-python.exe' : 'repaired-python')
  const recovering = new PythonClient({ ...config, pythonExecutable: alias })
  const failure = await recovering.checkRuntime()
  assert.equal(failure.status, 'unavailable')
  assert.match(failure.message, /Python 3.11/)
  await symlink(python, alias, 'file')
  assert.equal((await recovering.checkRuntime()).status, 'ready')
})
test('an incomplete bundled runtime is diagnosed and can recover after restoration', async () => {
  const vendor = join(extracted.packageDir, 'python/vendor')
  const backup = join(extracted.packageDir, 'python/vendor-disabled')
  const recovering = new PythonClient({ ...config, pythonExecutable: python })
  await rename(vendor, backup)
  try {
    const failure = await recovering.checkRuntime()
    assert.equal(failure.status, 'unavailable')
    assert.match(failure.message, /完整安装包/)
  } finally { await rename(backup, vendor) }
  assert.equal((await recovering.checkRuntime()).status, 'ready')
})
test('runtime probes do not create application data', async () => {
  const dataDirectory = join(directory, 'probe-only')
  const probe = new PythonClient({ ...config, dataDirectory })
  assert.equal((await probe.checkRuntime()).status, 'ready')
  await assert.rejects(readFile(join(dataDirectory, 'funds-query.sqlite3')), error => error.code === 'ENOENT')
})
test('a data path pointing at a regular file is diagnosed before import', async () => {
  const dataDirectory = join(directory, 'not-a-directory')
  await writeFile(dataDirectory, 'fixture')
  const probe = new PythonClient({ ...config, dataDirectory })
  const result = await probe.checkRuntime()
  assert.equal(result.status, 'unavailable')
  assert.match(result.message, /持久化数据目录/)
})
