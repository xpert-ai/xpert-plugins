import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkReleaseDependencies, localReferenceErrors } from './check-release-dependencies.mjs'

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'release-dependency-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content))
  }
  write('.gitignore', 'node_modules/\n')
  write('xpertai/package.json', { private: true, packageManager: 'pnpm@11.15.1' })
  write('xpertai/pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - ../packages/*\n')
  write('xpertai/pnpm-lock.yaml', 'lockfileVersion: "9.0"\n')
  write('xpertai/apps/demo/package.json', { dependencies: { sdk: '1.0.0' } })
  write('packages/shared/package.json', { name: 'shared', version: '1.0.0' })
  git('init', '-q')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture')
  return { root, git, write }
}

const run = (root, options = {}) => checkReleaseDependencies({ root, workspace: 'xpertai', log: () => {}, ...options })
const successfulPnpm = (args) => args[0] === '--version' ? '11.15.1' : ''

test('allows registry ranges, aliases and tracked repository dependencies', () => {
  const files = new Set(['packages/shared/package.json', 'vendor/archive.tgz'])
  assert.deepEqual(localReferenceErrors('xpertai/apps/demo/package.json', {
    dependencies: {
      tilde: '~1.5.7', range: '^3.20.0', alias: 'npm:another@^1',
      shared: 'link:../../../packages/shared', archive: 'file:../../../vendor/archive.tgz', workspace: 'workspace:*'
    }
  }, files), [])
})

test('rejects external and untracked local dependencies in every dependency group', () => {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const specifier of ['link:../../../../xpert/dist', 'file:/home/developer/sdk', 'file:///tmp/sdk',
      'file:C:\\sdk', '~/sdk', '../missing', 'link:../missing']) {
      assert.equal(localReferenceErrors('community/apps/demo/package.json', { [field]: { sdk: specifier } }, new Set()).length, 1, `${field}: ${specifier}`)
    }
  }
})

test('staged validation cannot be fooled by an unstaged manifest or lockfile fix', (t) => {
  const { root, git, write } = fixture(t)
  write('xpertai/apps/demo/package.json', { dependencies: { sdk: '2.0.0' } })
  git('add', 'xpertai/apps/demo/package.json')
  write('xpertai/apps/demo/package.json', { dependencies: { sdk: '3.0.0' } })
  write('xpertai/pnpm-lock.yaml', 'unstaged lockfile fix')
  write('xpertai/node_modules/sdk/package.json', { version: '3.0.0' })
  let snapshot
  assert.throws(() => run(root, { staged: true, pnpm(args, cwd) {
    snapshot = path.dirname(cwd)
    if (args[0] === '--version') return '11.15.1'
    assert.deepEqual(args, ['install', '--lockfile-only', '--frozen-lockfile', '--ignore-scripts', '--offline'])
    assert.equal(JSON.parse(readFileSync(path.join(cwd, 'apps/demo/package.json'))).dependencies.sdk, '2.0.0')
    assert.equal(readFileSync(path.join(cwd, 'pnpm-lock.yaml'), 'utf8'), 'lockfileVersion: "9.0"\n')
    assert.equal(existsSync(path.join(cwd, 'node_modules')), false)
    throw new Error('ERR_PNPM_OUTDATED_LOCKFILE')
  } }), /ERR_PNPM_OUTDATED_LOCKFILE/)
  assert.equal(existsSync(snapshot), false)
  assert.equal(readFileSync(path.join(root, 'xpertai/pnpm-lock.yaml'), 'utf8'), 'unstaged lockfile fix')
})

test('accepts the staged inputs even when worktree dependencies differ', (t) => {
  const { root, git, write } = fixture(t)
  write('xpertai/apps/demo/package.json', { dependencies: { sdk: '2.0.0' } })
  write('xpertai/pnpm-lock.yaml', 'staged lockfile')
  git('add', '.')
  write('xpertai/apps/demo/package.json', { dependencies: { sdk: 'link:../../../../local-sdk' } })
  assert.deepEqual(run(root, { staged: true, pnpm: successfulPnpm }), ['xpertai'])
  assert.throws(() => run(root, { pnpm: successfulPnpm }), /local-sdk/)
})

test('rejects staged local SDK links even when the worktree removes them', (t) => {
  const { root, git, write } = fixture(t)
  write('xpertai/apps/demo/package.json', { devDependencies: { sdk: 'link:../../../../xpert/dist' } })
  git('add', '.')
  write('xpertai/apps/demo/package.json', { devDependencies: { sdk: '3.20.0' } })
  assert.throws(() => run(root, { staged: true, pnpm: () => assert.fail('must reject before pnpm') }), /xpert\/dist/)
})

test('includes new packages, shared manifests, patches and workspace settings', (t) => {
  const { root, git, write } = fixture(t)
  write('xpertai/apps/new/package.json', { name: 'new' })
  write('xpertai/patches/sdk.patch', 'patch input')
  git('add', '.')
  let snapshot
  run(root, { staged: true, pnpm(args, cwd) {
    snapshot = path.dirname(cwd)
    if (args[0] === '--version') return '11.15.1'
    for (const file of ['apps/new/package.json', '../packages/shared/package.json', 'patches/sdk.patch', 'pnpm-workspace.yaml']) {
      assert.ok(existsSync(path.join(cwd, file)), file)
    }
    return ''
  } })
  assert.equal(existsSync(snapshot), false)
})

test('checks lockfile-only changes and skips commits with no dependency inputs', (t) => {
  const { root, git, write } = fixture(t)
  write('xpertai/apps/demo/index.ts', '// source change')
  git('add', '.')
  assert.deepEqual(run(root, { staged: true, pnpm: () => assert.fail('source-only commit') }), [])
  write('xpertai/pnpm-lock.yaml', 'changed lockfile')
  git('add', '.')
  assert.deepEqual(run(root, { staged: true, pnpm: successfulPnpm }), ['xpertai'])
})

test('rejects a pnpm version that differs from the workspace pin', (t) => {
  const { root } = fixture(t)
  assert.throws(() => run(root, { pnpm: () => '8.15.8' }), /requires pnpm 11.15.1, got 8.15.8/)
})

test('rejects unexpected lockfile rewrites and still removes the snapshot', (t) => {
  const { root } = fixture(t)
  let snapshot
  assert.throws(() => run(root, { pnpm(args, cwd) {
    snapshot = path.dirname(cwd)
    if (args[0] === '--version') return '11.15.1'
    writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), 'rewritten')
    return ''
  } }), /unexpectedly changed/)
  assert.equal(existsSync(snapshot), false)
})

test('rejects an unknown CLI option', () => {
  const result = spawnSync(process.execPath, [new URL('./check-release-dependencies.mjs', import.meta.url).pathname, '--unknown'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Usage:/)
})
