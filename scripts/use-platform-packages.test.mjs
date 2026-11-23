import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { applyPlatformPackages, planPlatformPackages } from './use-platform-packages.mjs'

const script = fileURLToPath(new URL('./use-platform-packages.mjs', import.meta.url))
const names = ['contracts', 'plugin-sdk']

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'platform packages ')))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const write = async (file, value) => {
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const hostPath = join(root, 'host')
  const pluginPaths = [join(root, 'plugin one'), join(root, 'plugin two')]
  const pkg = (name) => join(hostPath, 'packages', name, 'dist')
  for (const name of names) {
    await write(join(pkg(name), 'package.json'), {
      name: `@xpert-ai/${name}`,
      version: '1.2.3',
      main: './index.js',
      types: './index.d.ts'
    })
    // Linking must never execute runtime entries, even if importing the host would fail.
    await write(join(pkg(name), 'index.js'), 'throw new Error("must not execute host code")')
    await write(join(pkg(name), 'index.d.ts'), 'export declare const value: string')
  }
  for (const plugin of pluginPaths) {
    await write(join(plugin, 'package.json'), {
      name: plugin.split('/').at(-1),
      dependencies: { '@xpert-ai/contracts': '^1.0.0' },
      peerDependencies: { '@xpert-ai/plugin-sdk': '^1.0.0' }
    })
    await write(join(plugin, 'pnpm-lock.yaml'), 'registry lockfile')
  }
  const link = (index, name) => join(pluginPaths[index], 'node_modules/@xpert-ai', name)
  const receipt = (index) => join(pluginPaths[index], 'node_modules/.xpert-host-sdk.json')
  const options = { hostPath, pluginPaths }
  const oldLinks = async () => {
    for (let i = 0; i < pluginPaths.length; i++)
      for (const name of names) {
        await fs.mkdir(dirname(link(i, name)), { recursive: true })
        await fs.symlink(`../registry-${name}`, link(i, name), 'dir')
      }
  }
  return { root, write, pkg, link, receipt, options, oldLinks }
}

async function absent(path) {
  await assert.rejects(fs.lstat(path), { code: 'ENOENT' })
}

async function unchangedLinks(f) {
  for (let i = 0; i < f.options.pluginPaths.length; i++)
    for (const name of names) {
      assert.equal(await fs.readlink(f.link(i, name)), `../registry-${name}`)
    }
}

test('links multiple plugins, records provenance, keeps declarations intact and can run twice', async (t) => {
  const f = await fixture(t)
  const manifests = await Promise.all(f.options.pluginPaths.map((p) => fs.readFile(join(p, 'package.json'), 'utf8')))
  const result = await applyPlatformPackages(await planPlatformPackages(f.options))
  assert.equal(result.dryRun, false)
  assert.equal(result.links.length, 4)
  assert.equal(result.packages.length, 2)
  for (const pkg of result.packages) for (const file of pkg.files) assert.match(file.sha256, /^[a-f0-9]{64}$/)
  for (let i = 0; i < f.options.pluginPaths.length; i++) {
    for (const name of names) assert.equal(await fs.realpath(f.link(i, name)), await fs.realpath(f.pkg(name)))
    assert.deepEqual(JSON.parse(await fs.readFile(f.receipt(i), 'utf8')), result)
    assert.equal(await fs.readFile(join(f.options.pluginPaths[i], 'package.json'), 'utf8'), manifests[i])
    assert.equal(await fs.readFile(join(f.options.pluginPaths[i], 'pnpm-lock.yaml'), 'utf8'), 'registry lockfile')
  }
  const inode = (await fs.lstat(f.link(0, 'contracts'))).ino
  await applyPlatformPackages(await planPlatformPackages(f.options))
  assert.equal((await fs.lstat(f.link(0, 'contracts'))).ino, inode)
})

test('dry-run emits a plan without creating node_modules or receipts', async (t) => {
  const f = await fixture(t)
  const result = spawnSync(process.execPath, [script, '--dry-run', f.options.hostPath, ...f.options.pluginPaths], {
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).dryRun, true)
  for (const p of f.options.pluginPaths) await absent(join(p, 'node_modules'))
})

test('CLI rejects unknown, incomplete and repeated options before filesystem access', () => {
  for (const args of [
    [],
    ['host'],
    ['--bad', 'host', 'plugin'],
    ['host', 'plugin', '--chatkit-types'],
    ['host', 'plugin', '--chatkit-types', '--dry-run'],
    ['--chatkit-types', 'one', '--chatkit-types', 'two', 'host', 'plugin']
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8'
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Usage:/)
  }
  assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0)
})

test('all package and plugin validation completes before any link is replaced', async (t) => {
  for (const problem of [
    'missing-runtime',
    'missing-types',
    'wrong-package',
    'undeclared-dependency',
    'real-directory',
    'receipt-symlink'
  ]) {
    await t.test(problem, async (t) => {
      const f = await fixture(t)
      await f.oldLinks()
      if (problem === 'missing-runtime') await fs.unlink(join(f.pkg('plugin-sdk'), 'index.js'))
      if (problem === 'missing-types') await fs.unlink(join(f.pkg('plugin-sdk'), 'index.d.ts'))
      if (problem === 'wrong-package')
        await f.write(join(f.pkg('plugin-sdk'), 'package.json'), {
          name: 'wrong',
          version: '1'
        })
      if (problem === 'undeclared-dependency')
        await f.write(join(f.options.pluginPaths[1], 'package.json'), {
          name: 'other'
        })
      if (problem === 'real-directory') {
        await fs.unlink(f.link(1, 'plugin-sdk'))
        await f.write(join(f.link(1, 'plugin-sdk'), 'keep.txt'), 'do not replace')
      }
      if (problem === 'receipt-symlink') await fs.symlink(join(f.root, 'outside'), f.receipt(1))
      await assert.rejects(async () => applyPlatformPackages(await planPlatformPackages(f.options)))
      assert.equal(await fs.readlink(f.link(0, 'contracts')), '../registry-contracts')
      assert.equal(await fs.readlink(f.link(0, 'plugin-sdk')), '../registry-plugin-sdk')
      await absent(f.receipt(0))
      if (problem === 'real-directory')
        assert.equal(await fs.readFile(join(f.link(1, 'plugin-sdk'), 'keep.txt'), 'utf8'), 'do not replace')
    })
  }
})

test('accepts exports-only runtime/type entries and rejects entries outside the build', async (t) => {
  const f = await fixture(t)
  await f.write(join(f.pkg('contracts'), 'package.json'), {
    name: '@xpert-ai/contracts',
    version: '1',
    exports: { '.': { import: './index.js', types: './index.d.ts' } }
  })
  await planPlatformPackages(f.options)
  await f.write(join(f.root, 'outside.js'), 'outside')
  await fs.unlink(join(f.pkg('contracts'), 'index.js'))
  await fs.symlink(join(f.root, 'outside.js'), join(f.pkg('contracts'), 'index.js'))
  await assert.rejects(planPlatformPackages(f.options), /escapes package/)
  for (const p of f.options.pluginPaths) await absent(join(p, 'node_modules'))
})

test('optional ChatKit types bind the two host builds and are included in the receipt', async (t) => {
  const f = await fixture(t)
  const chatkitPath = join(f.root, 'chatkit build')
  await f.write(join(chatkitPath, 'package.json'), {
    name: '@xpert-ai/chatkit-types',
    version: '0.20.3',
    main: 'dist/index.js',
    types: 'dist/index.d.ts'
  })
  await f.write(join(chatkitPath, 'dist/index.js'), 'export const value = 1')
  await f.write(join(chatkitPath, 'dist/index.d.ts'), 'export declare const value: number')
  const result = await applyPlatformPackages(await planPlatformPackages({ ...f.options, chatkitPath }))
  assert.equal(result.packages.length, 3)
  assert.equal(result.links.length, 6)
  for (const name of names)
    assert.equal(
      await fs.realpath(join(f.pkg(name), 'node_modules/@xpert-ai/chatkit-types')),
      await fs.realpath(chatkitPath)
    )
  await absent(f.link(0, 'chatkit-types'))
})

test('failed link replacement rolls back earlier links including broken relative symlinks', async (t) => {
  const f = await fixture(t)
  await f.oldLinks()
  const plan = await planPlatformPackages(f.options)
  const rename = fs.rename
  let failed = false
  t.mock.method(fs, 'rename', async (from, to) => {
    if (!failed && to === plan.links[1].target) {
      failed = true
      throw new Error('simulated rename failure')
    }
    return rename(from, to)
  })
  await assert.rejects(applyPlatformPackages(plan), /simulated rename failure/)
  await unchangedLinks(f)
  await absent(f.receipt(0))
  assert.ok((await fs.readdir(dirname(f.link(0, 'contracts')))).every((name) => !name.endsWith('.tmp')))
})

test('receipt failure restores old receipt bytes and removes newly created links and receipts', async (t) => {
  const f = await fixture(t)
  await f.write(f.receipt(1), '{"previous":"receipt"}\n')
  const plan = await planPlatformPackages(f.options)
  const writeFile = fs.writeFile
  let failed = false
  t.mock.method(fs, 'writeFile', async (path, ...args) => {
    if (!failed && path === f.receipt(1)) {
      failed = true
      throw new Error('simulated receipt failure')
    }
    return writeFile(path, ...args)
  })
  await assert.rejects(applyPlatformPackages(plan), /simulated receipt failure/)
  for (let i = 0; i < f.options.pluginPaths.length; i++) for (const name of names) await absent(f.link(i, name))
  await absent(f.receipt(0))
  assert.equal(await fs.readFile(f.receipt(1), 'utf8'), '{"previous":"receipt"}\n')
})

test('rejects a changed link or receipt after planning without replacing other links', async (t) => {
  const f = await fixture(t)
  await f.oldLinks()
  const plan = await planPlatformPackages(f.options)
  await fs.unlink(f.link(1, 'plugin-sdk'))
  await fs.symlink('../new-install', f.link(1, 'plugin-sdk'))
  await assert.rejects(applyPlatformPackages(plan), /changed since validation/)
  assert.equal(await fs.readlink(f.link(0, 'contracts')), '../registry-contracts')
  const next = await planPlatformPackages(f.options)
  await f.write(f.receipt(1), 'new receipt')
  await assert.rejects(applyPlatformPackages(next), /Receipt changed/)
  assert.equal(await fs.readlink(f.link(0, 'contracts')), '../registry-contracts')
})

test('deduplicates plugin aliases and rejects distinct plugins sharing physical link targets', async (t) => {
  const f = await fixture(t)
  const alias = join(f.root, 'plugin alias')
  await fs.symlink(f.options.pluginPaths[0], alias)
  const plan = await planPlatformPackages({
    ...f.options,
    pluginPaths: [...f.options.pluginPaths, alias]
  })
  assert.equal(plan.plugins.length, 2)
  await fs.mkdir(join(f.options.pluginPaths[0], 'node_modules'), { recursive: true })
  await fs.symlink(join(f.options.pluginPaths[0], 'node_modules'), join(f.options.pluginPaths[1], 'node_modules'))
  await assert.rejects(planPlatformPackages(f.options), /Duplicate link targets/)
  await fs.mkdir(dirname(f.link(0, 'contracts')), { recursive: true })
  await assert.rejects(planPlatformPackages(f.options), /Duplicate link targets/)
})
