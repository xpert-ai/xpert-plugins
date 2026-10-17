import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
const bundle = readFileSync(new URL(manifest.main, root), 'utf8')
const resources = JSON.parse(readFileSync(new URL('.xpertai-plugin/plugin.json', root), 'utf8'))
assert.equal(resources.name, manifest.name)
assert.equal(resources.artifactNamespace, manifest.xpert.plugin.artifactNamespace)
assert.equal(resources.toolsets['saic-doris'].provider, 'saic_doris')
assert.ok(manifest.files.includes('.xpertai-plugin'), 'Native MCP installation requires the resource manifest in the package')
// The host stages workspaces without node_modules and installs production deps with npm.
// Keep pnpm-only protocols in development dependencies, and include the shared driver
// through its public package entry in the distributable, as the SAP BW plugin does.
for (const version of Object.values({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
  assert(!/^(workspace|link):/.test(version), 'Runtime dependencies must be installable outside the workspace')
}
assert(!/\bfrom\s*["']@xpert-ai\/plugin-mysql/.test(bundle), 'Bundle must include the public Doris factory')
assert.match(bundle, /function createDorisConnection\(/)
assert.match(bundle, /function requireDorisReadStatement\(/)
assert.match(bundle, /__metadata\("design:paramtypes"/)
console.log('Verified standalone SAIC bundle and Nest injection metadata')
