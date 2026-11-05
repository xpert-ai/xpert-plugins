import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { build } from 'esbuild'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(__dirname, '..')
const remoteDir = join(packageRoot, 'src', 'lib', 'remote')
const outHtml = join(remoteDir, 'registration-console.html')

async function main() {
  const result = await build({
    entryPoints: [join(remoteDir, 'main.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    write: false,
    minify: false,
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  })
  const script = result.outputFiles[0].text
  let html = await readFile(join(remoteDir, 'template.html'), 'utf8')
  html = html.replace('<!--APP_SCRIPT-->', () => `<script>${script}</script>`)
  await mkdir(dirname(outHtml), { recursive: true })
  await writeFile(outHtml, html, 'utf8')
  console.log(`Registration console written to ${outHtml}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
