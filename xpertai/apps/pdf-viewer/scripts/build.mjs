import { build } from 'vite'
import { build as bundleWorker } from 'esbuild'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const result = await build({
  configFile: false, root, plugins: [tailwindcss(), { name: 'packaged-pdf-worker',
    resolveId(id) { if (id === 'virtual:pdf-worker') return '\0pdf-worker' },
    async load(id) { if (id !== '\0pdf-worker') return
      const bundled = await bundleWorker({ entryPoints: [require.resolve('pdfjs-dist/build/pdf.worker.min.mjs')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true })
      return 'export default ' + JSON.stringify(bundled.outputFiles[0].text)
    } }],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: { 'process.env.NODE_ENV': '"production"' },
  esbuild: { jsx: 'automatic' },
  build: { write: false, target: 'es2022', minify: true, cssCodeSplit: false,
    lib: { entry: join(root, 'remote/main.tsx'), name: 'DocumentView', formats: ['iife'], fileName: () => 'app.js', cssFileName: 'app' },
    rollupOptions: { output: { assetFileNames: 'app.[ext]' },
      onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }
    }
  }
})
const bundle = Array.isArray(result) && result.length === 1 ? result[0] : result
if (!('output' in bundle)) throw new Error('Expected a single production bundle')
const sharedCss = await readFile(require.resolve('@xpert-ai/plugin-shadcn-ui/style.css'), 'utf8')
const output = join(root, 'dist/lib/remote-components/pdf-viewer')
await mkdir(output, { recursive: true })
for (const asset of bundle.output) {
  const name = asset.fileName
  const content = asset.type === 'chunk' ? asset.code : `${sharedCss}\n${asset.source}`
  if (process.argv.includes('--check')) {
    if (await readFile(join(output, name), 'utf8') !== content) throw new Error(`Stale remote asset: ${name}`)
  } else await writeFile(join(output, name), content)
}

const pdfRoot = dirname(require.resolve("pdfjs-dist/package.json"))
async function packagedAssets(relative) {
  const source = join(pdfRoot, relative), target = join(root, 'dist/lib/pdf-assets', relative)
  if (!process.argv.includes('--check')) return cp(source, target, { recursive: true })
  if (relative === 'LICENSE') {
    if (!(await readFile(source)).equals(await readFile(target))) throw new Error(`Stale PDF asset: ${relative}`)
    return
  }
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const path = join(relative, entry.name)
    if (entry.isDirectory()) await packagedAssets(path)
    else if (!(await readFile(join(pdfRoot, path))).equals(await readFile(join(root, 'dist/lib/pdf-assets', path)))) throw new Error(`Stale PDF asset: ${path}`)
  }
}
for (const relative of ['cmaps', 'standard_fonts', 'wasm', 'LICENSE']) await packagedAssets(relative)
