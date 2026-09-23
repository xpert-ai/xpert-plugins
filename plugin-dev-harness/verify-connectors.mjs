#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = join(root, 'xpertai')
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--output-dir')) throw Error('Usage: node verify-connectors.mjs [--output-dir PATH]')
const output = args.length ? resolve(args[1]) : mkdtempSync(join(tmpdir(), 'xpert-connectors-'))
mkdirSync(output, { recursive: true, mode: 0o700 })
const inventory = JSON.parse(readFileSync(join(workspace, 'packages/connector-runtime/migrations.json'), 'utf8'))
assert.equal(inventory.schemaVersion, 1)
const runtime = JSON.parse(readFileSync(join(workspace, 'packages/connector-runtime/package.json'), 'utf8'))
const packages = [{ package: runtime.name, path: 'packages/connector-runtime' }, ...inventory.connectors.map(entry => ({ package: entry.package, path: `middlewares/${entry.directory}` }))]
const results = []
function run(label, command, argv, cwd) {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', env: { ...process.env, NX_DAEMON: 'false' }, maxBuffer: 32 * 1024 * 1024 })
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  writeFileSync(join(output, `${label}.log`), log, { mode: 0o600 })
  const success = result.status === 0
  results.push({ check: label, success })
  console.log(`${success ? 'PASS' : 'FAIL'} ${label}`)
  if (!success) {
    writeFileSync(join(output, 'receipt.json'), JSON.stringify({ results }, null, 2), { mode: 0o600 })
    throw Error(`${label} failed; inspect ${join(output, `${label}.log`)}`)
  }
  return result.stdout
}

for (const target of ['build', 'typecheck', 'test']) {
  run(target, 'corepack', ['pnpm', 'exec', 'nx', 'run-many', '-t', target, `--projects=${packages.map(entry => entry.package).join(',')}`, '--parallel=3'], workspace)
}
for (const entry of inventory.connectors) {
  run(`lifecycle-${entry.directory}`, process.execPath,
    ['plugin-dev-harness/dist/index.js', '--workspace', './xpertai', '--plugin', entry.package], root)
}
for (const [index, entry] of packages.entries()) {
  const tarball = join(output, `package-${index}.tgz`)
  run(`pack-${index}`, 'corepack', ['pnpm', 'pack', '--out', tarball, '--json'], join(workspace, entry.path))
  const manifest = JSON.parse(run(`manifest-${index}`, 'tar', ['-xOf', tarball, 'package/package.json'], root))
  assert.equal(manifest.name, entry.package)
  if (entry.package !== runtime.name) assert.equal(manifest.dependencies[runtime.name], `^${runtime.version}`)
  const files = run(`contents-${index}`, 'tar', ['-tf', tarball], root).split('\n')
  assert.ok(files.includes('package/dist/index.js'), `${entry.package}: missing JS entry`)
  assert.ok(files.includes('package/dist/index.d.ts'), `${entry.package}: missing type entry`)
  assert.ok(!JSON.stringify(manifest.dependencies).includes('workspace:'), `${entry.package}: unresolved workspace dependency`)
}
writeFileSync(join(output, 'receipt.json'), JSON.stringify({ checkedAt: new Date().toISOString(), connectors: inventory.connectors.length, packages: packages.length, results }, null, 2), { mode: 0o600 })
console.log(`Verified ${inventory.connectors.length} Connectors and ${packages.length} packages. Receipts: ${output}`)
