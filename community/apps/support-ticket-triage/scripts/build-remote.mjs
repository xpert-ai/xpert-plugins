import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const check = process.argv.includes('--check')
const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const { outputFiles } = await build({
  absWorkingDir: root,
  entryPoints: { app: 'remote/main.tsx' },
  outdir: 'dist/remote',
  bundle: true,
  format: 'esm',
  alias: {
    react: dirname(require.resolve('react/package.json')),
    'react-dom': dirname(require.resolve('react-dom/package.json'))
  },
  jsx: 'automatic',
  target: ['es2022'],
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
  minify: true
})

for (const asset of outputFiles) {
  if (check) {
    const current = await readFile(asset.path)
    if (!current.equals(Buffer.from(asset.contents))) throw new Error(`Stale remote asset: ${asset.path}`)
  } else {
    await mkdir(dirname(asset.path), { recursive: true })
    await writeFile(asset.path, asset.contents)
  }
}
