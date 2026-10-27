import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const output = new URL('dist/remote/', root)
const result = await build({ entryPoints: [new URL('remote/main.tsx', root).pathname], bundle: true, write: false,
  format: 'iife', platform: 'browser', target: 'es2022', minify: true, jsx: 'automatic', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' } })
const temporary = await mkdtemp(join(tmpdir(), 'spaces-css-'))
let css
try {
  const outputCss = join(temporary, 'app.css')
  execFileSync(new URL('node_modules/.bin/tailwindcss', root).pathname, ['-i', new URL('remote/styles.css', root).pathname, '-o', outputCss, '--minify'], { cwd: root, stdio: 'pipe' })
  const require = createRequire(import.meta.url)
  css = await readFile(require.resolve('@xpert-ai/plugin-shadcn-ui/style.css'), 'utf8') + '\n' + await readFile(outputCss, 'utf8')
} finally { await rm(temporary, { recursive: true, force: true }) }
const files = { 'app.js': result.outputFiles[0].text, 'app.css': css }
if (process.argv.includes('--check')) {
  for (const [name, content] of Object.entries(files)) {
    if (await readFile(new URL(name, output), 'utf8') !== content) throw new Error(`Stale remote asset: ${name}`)
  }
} else {
  await mkdir(output, { recursive: true })
  for (const [name, content] of Object.entries(files)) await writeFile(new URL(name, output), content)
}
