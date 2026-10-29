const { build } = await import(process.env.TRIAGE_ESBUILD_WASM === '1' ? 'esbuild-wasm' : 'esbuild')
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const check = process.argv.includes('--check')
const directory = join(root, 'remote/dist')
const result = await build({
  absWorkingDir: root, entryPoints: ['./remote/src/main.tsx'], bundle: true,
  format: 'iife', platform: 'browser', target: 'es2022', write: false,
  minify: true, jsx: 'automatic', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } },
})
const js = result.outputFiles[0].text
const source = join(root, 'remote/src/styles.css')
const consumerCss = await postcss([tailwindcss({ base: root, optimize: true })]).process(await readFile(source, 'utf8'), { from: source })
const css = await readFile(require.resolve('@xpert-ai/plugin-shadcn-ui/style.css'), 'utf8') + '\n' + consumerCss.css
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Support review</title><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`
if (/\b(?:localStorage|sessionStorage)\b/.test(js)) throw new Error('Sandboxed remote must not access Web Storage')
for (const [name, content] of [['app.js', js], ['app.css', css], ['index.html', html]]) {
  const destination = join(directory, name)
  if (check) {
    if (await readFile(destination, 'utf8').catch(() => '') !== content) throw new Error(`Stale remote asset ${name}; rebuild the plugin`)
  } else { await mkdir(directory, { recursive: true }); await writeFile(destination, content) }
}
console.log(check ? 'Remote assets match source' : `Built remote assets: JS ${js.length} bytes, CSS ${css.length} bytes`)
