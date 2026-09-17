import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
import { adaptSample } from './adapt-sample.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const check = process.argv.includes('--check')
const sample = adaptSample(await readFile(path.join(root, 'vendor/dockyard/sample/sample.js'), 'utf8'))
const result = await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'src/lib/remote/entry.ts')], bundle: true, write: false,
  format: 'esm', platform: 'browser', target: ['es2022'], minify: false, legalComments: 'inline',
  plugins: [{ name: 'dockyard-sample', setup(plugin) {
    plugin.onResolve({ filter: /^dockyard-sample$/ }, () => ({ path: 'sample', namespace: 'dockyard' }))
    plugin.onLoad({ filter: /.*/, namespace: 'dockyard' }, () => ({ contents: sample, loader: 'js', resolveDir: path.join(root, 'scripts') }))
  } }]
})
const styles = (await Promise.all(['vendor/dockyard/src/avalondock.css', 'vendor/dockyard/sample/sample.css', 'src/lib/remote/workspace.css'].map(file => readFile(path.join(root, file), 'utf8')))).join('\n')
let html = await readFile(path.join(root, 'vendor/dockyard/index.html'), 'utf8')
html = html.replace('  <link rel="stylesheet" href="src/avalondock.css">\n  <link rel="stylesheet" href="sample/sample.css">', () => `<style>${styles.replace(/<\/style/gi, '<\\/style')}</style>`)
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
html = html.replace('<span class="version-badge">0.1.0</span>', () => `<span class="version-badge">App ${version}</span>`)
html = html.replace('<body data-theme="dark">', '<body data-theme="dark"><div id="dockyard-loading" role="status">Loading your workspace…</div>')
html = html.replace('title="Save workspace locally">✓ Saved locally', 'title="Save workspace">Loading…')
// A callback preserves literal $&, $` and $' in generated JavaScript.
// Passing the bundle as a replacement string corrupts regular expressions and templates.
html = html.replace('<script type="module" src="sample/sample.js"></script>', () => `<script type="module">${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`)
const inlineModules = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)]
if (inlineModules.length !== 1) throw new Error('Expected exactly one inline remote module')
const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: inlineModules[0][1], encoding: 'utf8' })
if (syntax.error) throw syntax.error
if (syntax.status !== 0) throw new Error(`Generated remote module has invalid syntax: ${syntax.stderr}`)
const destination = path.join(root, 'dist/remote/dockyard.html')
const template = path.join(root, 'dist/dockyard-assistant.yaml')
if (check) {
  if (await readFile(destination, 'utf8') !== html) throw new Error('Remote output is stale; run build')
  if (await readFile(template, 'utf8') !== await readFile(path.join(root, 'src/dockyard-assistant.yaml'), 'utf8')) throw new Error('Template output is stale')
  console.log('Remote HTML and Assistant template match source')
} else {
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, html)
  await copyFile(path.join(root, 'src/dockyard-assistant.yaml'), template)
  console.log(`Built self-contained remote entry (${Buffer.byteLength(html)} bytes) and Assistant template`)
}
