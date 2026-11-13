import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const result = await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'src/lib/remote/entry.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: false,
  legalComments: 'inline'
})
const styles = await readFile(path.join(root, 'src/lib/remote/workspace.css'), 'utf8')
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
const html = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>OntoAgent Governed Workbench</title><style>${styles.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="app">Loading OntoAgent…</div><script>${script}</script></body></html>`
await mkdir(path.join(root, 'dist/remote'), { recursive: true })
await writeFile(path.join(root, 'dist/remote/governed-workbench.html'), html)
console.log(`Built governed-workbench.html (${Buffer.byteLength(html)} bytes)`)
