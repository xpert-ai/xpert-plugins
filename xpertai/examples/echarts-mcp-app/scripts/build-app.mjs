import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appRoot = resolve(root, 'src/app')
const outRoot = resolve(root, 'dist/app')

const htmlPath = resolve(appRoot, 'index.html')
const cssPath = resolve(appRoot, 'styles.css')
const entryPoint = resolve(appRoot, 'main.ts')
const outputPath = resolve(outRoot, 'index.html')

const [html, css, script] = await Promise.all([
  readFile(htmlPath, 'utf8'),
  readFile(cssPath, 'utf8'),
  build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    minify: false,
    legalComments: 'none'
  }).then((result) => result.outputFiles[0].text)
])

const bundledHtml = html
  .replace('<link rel="stylesheet" href="./styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./main.ts"></script>', `<script>\n${script}\n</script>`)

await mkdir(outRoot, { recursive: true })
await writeFile(outputPath, bundledHtml)
