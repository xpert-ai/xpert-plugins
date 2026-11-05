import { build } from 'esbuild'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const result = await build({
  entryPoints: [join(root, 'remote/app.tsx')],
  outfile: join(root, 'dist/remote/app.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'eof'
})
for (const file of result.outputFiles) {
  if (check) {
    if (!Buffer.from(file.contents).equals(await readFile(file.path))) throw new Error('Stale asset: ' + file.path)
  } else {
    await mkdir(dirname(file.path), { recursive: true })
    await writeFile(file.path, file.contents)
  }
}
const yaml = await readFile(join(root, 'src/assistant.yaml'))
if (check) {
  if (!yaml.equals(await readFile(join(root, 'dist/assistant.yaml')))) throw new Error('Stale template')
} else await writeFile(join(root, 'dist/assistant.yaml'), yaml)
async function sources(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const out = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await sources(path)))
    else
      out.push([
        relative(root, path),
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex')
      ])
  }
  return out
}
const digest = JSON.stringify([...(await sources(join(root, 'src'))), ...(await sources(join(root, 'remote')))])
if (check) {
  if (digest !== (await readFile(join(root, 'dist/source-manifest.json'), 'utf8')))
    throw new Error('Rebuild required: source changed')
} else await writeFile(join(root, 'dist/source-manifest.json'), digest)
console.log(check ? 'Distribution matches sources.' : 'Built self-contained remote assets and Assistant template.')
