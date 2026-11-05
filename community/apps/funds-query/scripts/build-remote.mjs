import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createHash } from 'node:crypto'
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
async function sourceDigest() {
  const files = []
  async function visit(p) {
    for (const d of await readdir(p, { withFileTypes: true })) {
      const q = join(p, d.name)
      if (d.isDirectory()) await visit(q)
      else files.push(q)
    }
  }
  await visit(join(root, 'src/remote'))
  await visit(join(root, 'src/shared'))
  files.push(join(root, 'src/lib/schemas.ts'), fileURLToPath(import.meta.url))
  const hash = createHash('sha256')
  for (const p of files.sort()) {
    hash.update(relative(root, p))
    hash.update(await readFile(p))
  }
  return hash.digest('hex')
}
const out = join(root, 'dist/remote')
if (process.argv.includes('--check')) {
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  if (manifest.sourceDigest !== (await sourceDigest()))
    throw new Error('Vue sources changed. Rebuild the plugin before deployment.')
  for (const name of ['app.js', 'app.css'])
    if (
      createHash('sha256')
        .update(await readFile(join(out, name)))
        .digest('hex') !== manifest.files[name]
    )
      throw new Error('Generated asset changed: ' + name)
  console.log('Vue asset freshness verified.')
} else {
  await build({
    configFile: false,
    root,
    resolve: { dedupe: ['vue'] },
    plugins: [vue()],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      __VUE_OPTIONS_API__: false,
      __VUE_PROD_DEVTOOLS__: false
    },
    build: {
      outDir: out,
      emptyOutDir: true,
      lib: {
        entry: join(root, 'src/remote/main.ts'),
        name: 'FundsQueryWorkbench',
        formats: ['iife'],
        fileName: () => 'app.js'
      },
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          assetFileNames: (asset) =>
            asset.names?.some((n) => n.endsWith('.css')) ? 'app.css' : '[name][extname]'
        }
      }
    }
  })
  const files = {}
  for (const name of ['app.js', 'app.css'])
    files[name] = createHash('sha256')
      .update(await readFile(join(out, name)))
      .digest('hex')
  await writeFile(
    join(out, 'manifest.json'),
    JSON.stringify({ sourceDigest: await sourceDigest(), files }, null, 2)
  )
}
