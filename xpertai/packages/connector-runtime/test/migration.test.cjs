const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readdirSync, readFileSync } = require('node:fs')
const { resolve, join } = require('node:path')
const migrations = require('../migrations.json')
const workspace = resolve(__dirname, '../../..')
const drivers = new Set(['api_key', 'mail_protocol', 'oauth2', 'oauth_http', 'pkce', 'polling', 'legacy_polling', 'authorization_url'])
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', 'dist', '.nx', '.git'].includes(entry.name)) return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.ts') && !/\.(?:spec|test|d)\.ts$/.test(entry.name) ? [path] : []
  })
}
test('every native Connector registration is represented in the migration inventory', () => {
  const registeredPackages = new Set()
  // Explicit registry decorators identify Connectors, not directory/display-name heuristics.
  for (const area of ['xpertai', 'community']) {
    for (const file of sources(resolve(workspace, '..', area))) {
      if (!/@ConnectorStrategyKey\(/.test(readFileSync(file, 'utf8'))) continue
      let directory = require('node:path').dirname(file)
      while (!require('node:fs').existsSync(join(directory, 'package.json'))) directory = require('node:path').dirname(directory)
      registeredPackages.add(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).name)
    }
  }
  assert.deepEqual([...registeredPackages].sort(), migrations.connectors.map(entry => entry.package).sort())
})
test('all migrated packages ship a real runtime dependency and consume shared authentication code', () => {
  assert.equal(migrations.schemaVersion, 1)
  assert.equal(new Set(migrations.connectors.map(entry => entry.provider)).size, migrations.connectors.length)
  for (const entry of migrations.connectors) {
    const directory = join(workspace, 'connectors', entry.directory)
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    assert.equal(manifest.name, entry.package)
    assert.equal(manifest.dependencies['@xpert-ai/connector-runtime'], 'workspace:^')
    assert.ok(entry.drivers.every(driver => drivers.has(driver)))
    assert.ok(sources(join(directory, 'src')).some(file => readFileSync(file, 'utf8').includes("from '@xpert-ai/connector-runtime'")))
  }
})
