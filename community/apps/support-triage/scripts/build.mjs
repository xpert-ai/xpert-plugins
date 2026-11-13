import { build } from 'esbuild'
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const check = process.argv.includes('--check')
const js = await build({ absWorkingDir: root, entryPoints: ['src/remote/main.tsx'], bundle: true, write: false, format: 'iife',
  platform: 'browser', target: 'es2022', minify: true, jsx: 'automatic',
  alias: { react: resolve(root, 'node_modules/react'), 'react-dom': resolve(root, 'node_modules/react-dom') } })
const cli = resolve(root, 'node_modules/@tailwindcss/cli/dist/index.mjs')
const cssPath = resolve(root, 'dist/remote/app.css')
await mkdir(dirname(cssPath), { recursive: true })
const css = spawnSync(process.execPath, [cli, '-i', 'src/remote/style.css', '-o', cssPath, '--minify'], { cwd: root, encoding: 'utf8' })
if (css.status !== 0) throw new Error(css.stderr)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${await readFile(cssPath, 'utf8')}</style></head><body><div id="root"></div><script>${js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
const target = resolve(root, 'dist/remote/inbox.html')
if (check) {
  if (await readFile(target, 'utf8') !== html) throw new Error('Generated workbench is stale. Run build.')
  if (await readFile(resolve(root, 'dist/assistant.yaml'), 'utf8') !== await readFile(resolve(root, 'src/assistant.yaml'), 'utf8')) throw new Error('Assistant template is stale.')
} else {
  await writeFile(target, html)
  await copyFile(resolve(root, 'src/assistant.yaml'), resolve(root, 'dist/assistant.yaml'))
}
console.log(check ? 'Generated assets match maintained sources.' : 'Built self-contained workbench and Assistant template.')
