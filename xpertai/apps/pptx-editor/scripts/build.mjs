import { build } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { build as bundleWorker } from 'esbuild'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const result = await build({
  configFile: false, root, plugins: [tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: { 'process.env.NODE_ENV': '"production"' },
  esbuild: { jsx: 'automatic' },
  build: { write: false, target: 'es2022', minify: true, cssCodeSplit: false,
    lib: { entry: join(root, 'remote/main.tsx'), name: 'PptxEditor', formats: ['iife'], fileName: () => 'app.js', cssFileName: 'app' },
    rollupOptions: { output: { assetFileNames: 'app.[ext]' },
      onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }
    }
  }
})
const bundle = Array.isArray(result) && result.length === 1 ? result[0] : result
if (!('output' in bundle)) throw new Error('Expected a single production bundle')
const sharedCss = await readFile(require.resolve('@xpert-ai/plugin-shadcn-ui/style.css'), 'utf8')
const output = join(root, 'dist/lib/remote-components/pptx-editor')
await mkdir(output, { recursive: true })
for (const asset of bundle.output) {
  const name = asset.fileName
  const content = asset.type === 'chunk' ? asset.code : `${sharedCss}\n${asset.source}`
  if (process.argv.includes('--check')) {
    if (await readFile(join(output, name), 'utf8') !== content) throw new Error(`Stale remote asset: ${name}`)
  } else await writeFile(join(output, name), content)
}
// Shared core and renderer are bundled once; server-only dependencies stay explicit in package.json.
const worker = await bundleWorker({ entryPoints: [join(root, 'worker/main.tsx')], bundle: true, write: false,
  platform: 'node', format: 'esm', target: 'node20', packages: 'external', jsx: 'automatic' })
const workerPath = join(root, 'dist/lib/pptx-worker.mjs')
const workerContent = worker.outputFiles[0].text
if (process.argv.includes('--check')) {
  if (await readFile(workerPath, 'utf8') !== workerContent) throw new Error('Stale PPTX worker')
} else await writeFile(workerPath, workerContent)
const template = await readFile(join(root, 'src/pptx-editor-assistant.yaml'), 'utf8')
const templatePath = join(root, 'dist/pptx-editor-assistant.yaml')
if (process.argv.includes('--check')) {
  if (await readFile(templatePath, 'utf8') !== template) throw new Error('Stale PPTX Assistant template')
} else await writeFile(templatePath, template)
const templatesRoot = join(root, 'assets/templates')
const provenance = JSON.parse(await readFile(join(templatesRoot, 'provenance.json'), 'utf8'))
if (provenance.templateCount !== 16 || provenance.layoutCount !== 192) throw new Error('Incomplete template catalog')
for (const entry of provenance.files) {
  const content = await readFile(join(templatesRoot, entry.path))
  if (createHash('sha256').update(content).digest('hex') !== entry.sha256) throw new Error(`Template integrity: ${entry.path}`)
  if (process.argv.includes('--check') && !content.equals(await readFile(join(root, 'dist/assets/templates', entry.path))))
    throw new Error(`Stale packaged template: ${entry.path}`)
}
if (!process.argv.includes('--check')) await cp(templatesRoot, join(root, 'dist/assets/templates'), { recursive: true })
await import('./build-cover-action.mjs')
