import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import plugin from '../dist/index.js'
import { AnyDocTransformerStrategy } from '../dist/lib/transformer.strategy.js'

const root = new URL('../', import.meta.url)
test('installable package includes its Sandbox Action declaration and every referenced bundle file', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root)))
  const manifest = JSON.parse(await readFile(new URL('.xpertai-plugin/plugin.json', root)))
  assert.equal(manifest.name, pkg.name)
  assert.equal(manifest.version, pkg.version)
  const action = JSON.parse(await readFile(new URL(manifest.sandboxActions, root)))
  assert.equal(action.name, 'anydoc.convert')
  assert.equal(action.version, '1.0.3')
  const [pack] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json', '--offline', '--update-notifier=false'], {
      cwd: fileURLToPath(root),
      encoding: 'utf8',
      timeout: 120000
    })
  )
  const paths = new Set(pack.files.map((file) => file.path))
  for (const required of [
    '.xpertai-plugin/plugin.json',
    'dist/index.js',
    manifest.sandboxActions.replace(/^\.\//, ''),
    'dist/sandbox-actions/convert/bundle/runner.mjs',
    'dist/sandbox-actions/convert/bundle/convert.mjs',
    'dist/sandbox-actions/convert/bundle/pdf.mjs',
    'dist/sandbox-actions/convert/bundle/result.mjs',
    'dist/_assets/icon.svg'
  ]) {
    assert.ok(paths.has(required), `Package is missing ${required}`)
  }
})

test('plugin card and parser metadata use the bundled official artwork without a network request', async () => {
  const bytes = await readFile(new URL('dist/_assets/icon.svg', root))
  const expected = { type: 'svg', value: bytes.toString('utf8') }
  assert.deepEqual(plugin.meta.icon, expected)
  assert.deepEqual(new AnyDocTransformerStrategy({}).meta.icon, expected)
  assert.deepEqual(bytes, await readFile(new URL('src/_assets/icon.svg', root)))
})
