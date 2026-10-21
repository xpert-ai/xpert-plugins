#!/usr/bin/env node
// Verify the paired source release without committing machine-local dependency references.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
assert.equal(args.length, 2, 'Usage: node plugin-dev-harness/verify-analytics.mjs --platform-root <companion-checkout>')
assert.equal(args[0], '--platform-root')
const platform = realpathSync(args[1])
const projects = [...['files', 'rest', 'mcp', 'data-xpert', 'workspace-script', 'postgres', 'mysql'].map(name => `tools/analytics-${name}`), 'apps/live-dashboard']
const folders = projects.map(project => path.join(root, 'xpertai', project))
const sdk = path.join(platform, 'packages/plugin-sdk'), contracts = path.join(platform, 'packages/contracts/dist')
assert.ok(existsSync(path.join(sdk, 'dist/analytics.cjs.js')) && existsSync(path.join(contracts, 'package.json')), 'Build the companion SDK and Contracts first')
const sdkRequire = createRequire(path.join(sdk, 'package.json'))
const runtime = sdkRequire('./dist/index.cjs.js')
assert.equal(runtime.AnalyticsRuntimeCapability.id, 'platform.analytics', 'Companion checkout must expose the canonical Analytics runtime')
assert.ok(runtime.analyticsSourceRefSchema && runtime.analyticsSourceKey)
const temporary = mkdtempSync(path.join(tmpdir(), 'analytics-source-verification-'))
const links = []
const platformRequire = createRequire(path.join(platform, 'package.json'))
const peers = ['common', 'core', 'cqrs'].map(name => [`@nestjs/${name}`, path.dirname(platformRequire.resolve(`@nestjs/${name}/package.json`))])
function run(command, commandArgs, cwd = root) {
  execFileSync(command, commandArgs, { cwd, stdio: 'inherit', env: { ...process.env, NX_DAEMON: 'false', pnpm_config_verify_deps_before_run: 'false' } })
}
try {
  for (const folder of [root, path.join(root, 'xpertai'), path.join(root, 'plugin-dev-harness'), ...folders]) {
    for (const [packageName, target] of [['@xpert-ai/plugin-sdk', sdk], ['@xpert-ai/contracts', contracts], ...peers]) {
      const [namespace, name] = packageName.split('/')
      const scope = path.join(folder, 'node_modules', namespace)
      mkdirSync(scope, { recursive: true })
      assert.ok(realpathSync(scope).startsWith(`${root}${path.sep}`), 'Refusing to edit dependency directories outside this checkout')
      const link = path.join(scope, name), backup = path.join(scope, `${name}.analytics-verification-${process.pid}`)
      assert.ok(!existsSync(backup), 'A prior verification backup requires manual inspection')
      let existed = false
      try { lstatSync(link); existed = true } catch (error) { if (error.code !== 'ENOENT') throw error }
      if (existed) renameSync(link, backup)
      links.push({ link, backup, existed })
      symlinkSync(target, link, 'dir')
    }
  }
  run('corepack', ['pnpm', 'run', 'build'], path.join(root, 'plugin-dev-harness'))
  const names = folders.map(folder => JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')).name)
  run('corepack', ['pnpm', 'exec', 'nx', 'run-many', '-t', 'build', '-p', names.join(','), '--skip-nx-cache'], path.join(root, 'xpertai'))
  const tests = folders.flatMap(folder => readdirSync(path.join(folder, 'tests')).filter(name => name.endsWith('.test.cjs')).map(name => path.join(folder, 'tests', name)))
  run('node', ['--test', ...tests])
  for (const folder of folders) {
    const manifest = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'))
    run('node', ['plugin-dev-harness/dist/index.js', '--workspace', './xpertai', '--plugin', manifest.name])
    run('node', ['scripts/check-plugin-metadata.mjs', '--package', path.relative(root, folder)])
    if (manifest.scripts['verify:dist']) run('corepack', ['pnpm', 'run', 'verify:dist'], folder)
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
  console.log('Analytics: 8 builds, contract tests, dist-first lifecycles, generated assets and packages verified against companion source SDK.')
} finally {
  for (const { link, backup, existed } of links.reverse()) { rmSync(link, { force: true }); if (existed) renameSync(backup, link) }
  rmSync(temporary, { recursive: true, force: true })
}
