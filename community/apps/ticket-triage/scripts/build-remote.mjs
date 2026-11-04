import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const check = process.argv.includes('--check')
const result = await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'src/lib/remote/entry.ts')], bundle: true, write: false,
  format: 'esm', platform: 'browser', target: ['es2022'], minify: false, legalComments: 'inline'
})
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
let html = await readFile(path.join(root, 'src/lib/remote/board.html'), 'utf8')
html = html.replace('<span class="version-badge">0.0.0</span>', () => `<span class="version-badge">App ${version}</span>`)
// A callback preserves literal $&, $` and $' in generated JavaScript.
// Passing the bundle as a replacement string corrupts regular expressions and templates.
html = html.replace('<script type="module" src="./entry.js"></script>', () => `<script type="module">${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`)
const inlineModules = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)]
if (inlineModules.length !== 1) throw new Error('Expected exactly one inline remote module')
const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: inlineModules[0][1], encoding: 'utf8' })
if (syntax.error) throw syntax.error
if (syntax.status !== 0) throw new Error(`Generated remote module has invalid syntax: ${syntax.stderr}`)
const destination = path.join(root, 'dist/remote/ticket-triage.html')
const template = path.join(root, 'dist/ticket-triage-assistant.yaml')
if (check) {
  if (await readFile(destination, 'utf8') !== html) throw new Error('Remote output is stale; run build')
  if (await readFile(template, 'utf8') !== await readFile(path.join(root, 'src/ticket-triage-assistant.yaml'), 'utf8')) throw new Error('Template output is stale')
  console.log('Remote HTML and Assistant template match source')
} else {
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, html)
  await copyFile(path.join(root, 'src/ticket-triage-assistant.yaml'), template)
  console.log(`Built self-contained remote entry (${Buffer.byteLength(html)} bytes) and Assistant template`)
}
