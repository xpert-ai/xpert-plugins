import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { build } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { readRendererHtml } from './renderer-asset.mjs'
import { createHash } from 'node:crypto'
import { writeDistManifest, verifyDist } from './dist-manifest.mjs'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const result = await build({ configFile: false, root, plugins: [tailwindcss()], logLevel: 'warn',
  define: { 'process.env.NODE_ENV': '"production"' },
  build: { write: false, cssCodeSplit: false, target: 'es2022', minify: true,
    lib: { entry: join(root, 'src/remote/main.tsx'), name: 'LiveDashboard', formats: ['iife'], fileName: 'app' } } })
const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output)
await mkdir(join(root, 'dist/remote'), { recursive: true })
const renderer = readRendererHtml()
await writeFile(join(root, 'dist/remote/renderer.html'), renderer)
await writeFile(join(root, 'dist/remote/renderer-source.json'), JSON.stringify({ package: '@xpert-ai/community-data-analytics', asset: 'datascience-artifact-widget.html', sha256: createHash('sha256').update(renderer).digest('hex') }, null, 2))
for (const output of outputs) {
  if (output.type === 'chunk' && output.isEntry) await writeFile(join(root, 'dist/remote/app.js'), output.code)
  if (output.type === 'asset' && output.fileName.endsWith('.css')) await writeFile(join(root, 'dist/remote/app.css'), output.source)
}
await writeDistManifest(root)
await verifyDist(root)
