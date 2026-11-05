import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
import { copyFile } from 'node:fs/promises'

const root = fileURLToPath(new URL('..', import.meta.url))
const check = process.argv.includes('--check')

const result = await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'src/lib/remote/main.ts')],
  bundle: true, write: false, format: 'esm', platform: 'browser', target: ['es2022'],
  minify: false, legalComments: 'none'
})

const css = await readFile(path.join(root, 'src/lib/remote/workspace.css'), 'utf8')
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Test-case Workbench ${version}</title>
<style>${css.replace(/<\/style/gi, '<\\/style')}</style></head>
<body><div id="testcase-loading" class="loading" role="status">Loading your workbench…</div>
<main id="testcase-root"></main>
<script type="module">${js}</script>
</body></html>
`

const inlineModules = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)]
if (inlineModules.length !== 1) throw new Error('Expected exactly one inline remote module')
const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: inlineModules[0][1], encoding: 'utf8' })
if (syntax.error) throw syntax.error
if (syntax.status !== 0) throw new Error(`Generated remote module has invalid syntax: ${syntax.stderr}`)

const destination = path.join(root, 'dist/remote/testcase.html')
const template = path.join(root, 'dist/testcase-assistant.yaml')
if (check) {
  if (await readFile(destination, 'utf8') !== html) throw new Error('Remote output is stale; run build')
  if (await readFile(template, 'utf8') !== await readFile(path.join(root, 'src/testcase-assistant.yaml'), 'utf8')) throw new Error('Template output is stale')
  console.log('Remote HTML and Assistant template match source')
} else {
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, html)
  await copyFile(path.join(root, 'src/testcase-assistant.yaml'), template)
  console.log(`Built self-contained remote entry (${Buffer.byteLength(html)} bytes) and Assistant template`)
}
