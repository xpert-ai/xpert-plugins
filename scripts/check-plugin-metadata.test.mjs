import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkPluginMetadata } from './check-plugin-metadata.mjs'

const packagePath = 'xpertai/apps/example'
const manifest = { name: '@example/plugin', version: '0.2.1', xpert: { plugin: { level: 'system', artifactNamespace: 'example' } } }
const meta = 'version: packageJson.version, level: packageJson.xpert.plugin.level, artifactNamespace: packageJson.xpert.plugin.artifactNamespace'
const loader = `import { readFileSync } from 'node:fs'
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as PackageMetadata`
const pluginSource = (fields = meta, prefix = loader) => `${prefix}\nconst plugin = { meta: { ${fields} }, register() {} } satisfies XpertPlugin\nexport default plugin\n`

function fixture(t, source = pluginSource()) {
  const root = mkdtempSync(path.join(tmpdir(), 'plugin-metadata-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value))
  }
  git('init', '--quiet')
  write(`${packagePath}/package.json`, manifest)
  write(`${packagePath}/src/index.ts`, source)
  git('add', '.')
  git('-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture')
  return { root, git, write, check: (options = {}) => checkPluginMetadata({ root, log: () => {}, ...options }) }
}

test('accepts manifest reads and follows package-only releases for all three fields', (t) => {
  const f = fixture(t)
  f.write(`${packagePath}/package.json`, { ...manifest, version: '9.9.9', xpert: { plugin: { level: 'tenant', artifactNamespace: 'new_namespace' } } })
  f.git('add', `${packagePath}/package.json`)
  assert.equal(f.check({ staged: true }), 1)
})

for (const [field, expression, literal] of [
  ['version', 'packageJson.version', '"0.2.1"'],
  ['level', 'packageJson.xpert.plugin.level', '"system"'],
  ['artifactNamespace', 'packageJson.xpert.plugin.artifactNamespace', '"example"']
]) {
  test(`rejects hardcoded ${field} even when it currently equals the manifest`, (t) => {
    const f = fixture(t, pluginSource(meta.replace(expression, literal)))
    assert.throws(() => f.check({ all: true }), new RegExp(`meta\\.${field} must read`))
  })
}

test('traces JSON imports and renamed constants through another source module', (t) => {
  const f = fixture(t, pluginSource('version, level, artifactNamespace', `import { version, level, artifactNamespace } from './metadata.js'`))
  f.write(`${packagePath}/src/metadata.ts`, `
    import pkg from '../package.json' with { type: 'json' }
    export const version = pkg.version
    const { level, artifactNamespace } = pkg.xpert.plugin
    export { level, artifactNamespace }
  `)
  f.git('add', '.')
  assert.equal(f.check({ staged: true }), 1)
  f.write(`${packagePath}/src/metadata.ts`, `export const version = '0.2.1'; export const level = 'system'; export const artifactNamespace = 'example'`)
  f.git('add', `${packagePath}/src/metadata.ts`)
  assert.throws(() => f.check({ staged: true }), /meta\.version must read/)
})

test('accepts createRequire and metadata spread from the package', (t) => {
  const f = fixture(t, pluginSource('version: packageJson.version, ...packageJson.xpert.plugin', `
    import { createRequire } from 'node:module'
    const require = createRequire(import.meta.url)
    const packageJson = require('../package.json')
  `))
  assert.equal(f.check({ all: true }), 1)
})

test('rejects fallback literals and unrelated package metadata with matching values', (t) => {
  const f = fixture(t, pluginSource(meta.replace('packageJson.version', 'packageJson.version || "0.2.1"')))
  assert.throws(() => f.check({ all: true }), /meta\.version must read/)
  f.write(`${packagePath}/other.json`, manifest)
  f.write(`${packagePath}/src/index.ts`, pluginSource(meta, loader.replace('../package.json', '../other.json')))
  assert.throws(() => f.check({ all: true }), /meta\.version must read/)
})

test('unstaged fixes cannot hide a broken staged commit', (t) => {
  const f = fixture(t)
  f.write(`${packagePath}/src/index.ts`, pluginSource(meta.replace('packageJson.version', '"0.1.0"')))
  f.git('add', '.')
  f.write(`${packagePath}/src/index.ts`, pluginSource())
  assert.throws(() => f.check({ staged: true }), /meta\.version must read/)
  assert.equal(f.check({ packagePath }), 1)
})

test('unstaged broken edits do not contaminate a valid staged commit', (t) => {
  const f = fixture(t, pluginSource(meta.replace('packageJson.version', '"0.1.0"')))
  f.write(`${packagePath}/src/index.ts`, pluginSource())
  f.git('add', '.')
  f.write(`${packagePath}/src/index.ts`, pluginSource(meta.replace('packageJson.version', '"0.1.0"')))
  assert.equal(f.check({ staged: true }), 1)
})

test('package-only version bump catches a previously committed stale runtime version', (t) => {
  const f = fixture(t, pluginSource(meta.replace('packageJson.version', '"0.2.1"')))
  f.write(`${packagePath}/package.json`, { ...manifest, version: '0.2.2' })
  f.git('add', `${packagePath}/package.json`)
  assert.throws(() => f.check({ staged: true }), /meta\.version must read/)
})

test('missing namespace and invalid level fail even with manifest-derived runtime fields', (t) => {
  const f = fixture(t)
  f.write(`${packagePath}/package.json`, { ...manifest, xpert: { plugin: { level: 'global' } } })
  f.git('add', '.')
  assert.throws(() => f.check({ staged: true }), /missing or invalid xpert\.plugin\.level[\s\S]*missing or invalid xpert\.plugin\.artifactNamespace/)
})

test('untracked metadata modules cannot make the staged source pass', (t) => {
  const f = fixture(t)
  f.write(`${packagePath}/src/index.ts`, pluginSource('version, level, artifactNamespace', `import { version, level, artifactNamespace } from './metadata.js'`))
  f.git('add', `${packagePath}/src/index.ts`)
  f.write(`${packagePath}/src/metadata.ts`, `${loader}; export const version = packageJson.version; export const level = packageJson.xpert.plugin.level; export const artifactNamespace = packageJson.xpert.plugin.artifactNamespace`)
  assert.throws(() => f.check({ staged: true }), /meta\.version must read/)
})

test('removing plugin metadata does not bypass validation', (t) => {
  const f = fixture(t)
  f.write(`${packagePath}/package.json`, { name: manifest.name, version: manifest.version })
  f.git('add', '.')
  assert.throws(() => f.check({ staged: true }), /missing or invalid xpert\.plugin\.level/)
})

test('default fs imports also retain package provenance', (t) => {
  const f = fixture(t, pluginSource(meta, `import fs from 'node:fs'; const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))`))
  assert.equal(f.check({ all: true }), 1)
})

test('skips unchanged and non-plugin packages in staged mode', (t) => {
  const f = fixture(t, pluginSource(meta.replace('packageJson.version', '"0.1.0"')))
  assert.equal(f.check({ staged: true }), 0)
  f.write('tools/helper/package.json', { name: 'helper', version: '1.0.0' })
  f.git('add', '.')
  assert.equal(f.check({ staged: true }), 0)
})

test('supports existing dirname/join reads without executing other plugin code', (t) => {
  const f = fixture(t, pluginSource(meta, `
    import { readFileSync } from 'node:fs'
    import { dirname, join } from 'node:path'
    import { fileURLToPath } from 'node:url'
    const root = dirname(fileURLToPath(import.meta.url))
    const packageJson = JSON.parse(readFileSync(join(root, '../package.json'), 'utf8'))
    throw new Error('plugin code must not execute')
  `))
  assert.equal(f.check({ all: true }), 1)
})

test('CLI rejects unknown arguments and reports violations with a nonzero exit', (t) => {
  const f = fixture(t, pluginSource(meta.replace('packageJson.version', '"0.1.0"')))
  const script = fileURLToPath(new URL('./check-plugin-metadata.mjs', import.meta.url))
  for (const args of [['--unknown'], ['--all']]) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: f.root, encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, args[0] === '--unknown' ? /Usage:/ : /meta\.version must read/)
  }
})
