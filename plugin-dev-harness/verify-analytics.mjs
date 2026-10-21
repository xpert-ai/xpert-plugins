#!/usr/bin/env node
// Verify the public release dependencies without replacing any installed package links.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
assert.equal(process.argv.length, 2, 'Usage: node plugin-dev-harness/verify-analytics.mjs')
const workspace = path.join(root, 'xpertai')
const projects = [...['files', 'rest', 'mcp', 'data-xpert', 'workspace-script', 'postgres', 'mysql'].map(name => `tools/analytics-${name}`), 'apps/live-dashboard']
const folders = projects.map(project => path.join(workspace, project))
const manifests = folders.map(folder => JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')))
const temporary = mkdtempSync(path.join(tmpdir(), 'analytics-public-verification-'))
function run(command, commandArgs, cwd = root) {
  execFileSync(command, commandArgs, { cwd, stdio: 'inherit', env: { ...process.env, NX_DAEMON: 'false' } })
}
try {
  for (const [index, folder] of folders.entries()) {
    const localRequire = createRequire(path.join(folder, 'package.json'))
    for (const name of ['@xpert-ai/plugin-sdk', '@xpert-ai/contracts']) {
      const packagePath = realpathSync(localRequire.resolve(`${name}/package.json`))
      assert.ok(packagePath.startsWith(`${realpathSync(path.join(workspace, 'node_modules'))}${path.sep}`), `${name} must resolve from installed workspace dependencies, not a platform checkout`)
      const installed = JSON.parse(readFileSync(packagePath, 'utf8'))
      assert.equal(installed.version, manifests[index].devDependencies[name], `${name} must match the development pin`)
      assert.equal(manifests[index].peerDependencies[name], `^${installed.version}`)
    }
    const runtime = localRequire('@xpert-ai/plugin-sdk')
    assert.equal(runtime.AnalyticsRuntimeCapability.id, 'platform.analytics')
    assert.ok(runtime.analyticsSourceRefSchema && runtime.analyticsSourceKey)
  }
  run('corepack', ['pnpm', '--ignore-workspace', 'run', 'build'], path.join(root, 'plugin-dev-harness'))
  const names = manifests.map(manifest => manifest.name)
  // Each test target builds its distributable; serial execution protects shared UI output.
  run('corepack', ['pnpm', 'exec', 'nx', 'run-many', '-t', 'test', '-p', names.join(','), '--parallel=1', '--skip-nx-cache'], workspace)
  for (const [index, folder] of folders.entries()) {
    const manifest = manifests[index]
    run(process.execPath, ['plugin-dev-harness/dist/index.js', '--workspace', folder, '--plugin', manifest.name])
    run(process.execPath, ['scripts/check-plugin-metadata.mjs', '--package', path.relative(root, folder)])
    if (manifest.scripts['verify:dist']) run('corepack', ['pnpm', 'exec', 'nx', 'run', `${manifest.name}:verify:dist`], workspace)
    run('corepack', ['pnpm', 'pack', '--pack-destination', temporary], folder)
    const packed = path.join(temporary, `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`)
    const packedManifest = JSON.parse(execFileSync('tar', ['-xOf', packed, 'package/package.json'], { encoding: 'utf8' }))
    assert.equal(packedManifest.version, manifest.version)
    for (const name of ['@xpert-ai/plugin-sdk', '@xpert-ai/contracts']) {
      assert.equal(packedManifest.peerDependencies[name], manifest.peerDependencies[name])
    }
    const files = execFileSync('tar', ['-tf', packed], { encoding: 'utf8' })
    assert.ok(files.includes('package/dist/index.js') && files.includes('package/index.cjs'))
    assert.ok(!files.includes('node_modules/'))
  }
  console.log('Analytics: 8 builds, contract tests, dist-first lifecycles, generated assets and packages verified against published SDK dependencies.')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
