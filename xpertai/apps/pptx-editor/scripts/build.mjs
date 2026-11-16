import { build } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

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
