import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(packageRoot, 'sandbox-actions', 'canvas-export')
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'canvas-export')
const bundleRoot = path.join(actionRoot, 'bundle')

await rm(actionRoot, { recursive: true, force: true })
await mkdir(bundleRoot, { recursive: true })
await build({
  entryPoints: [path.join(sourceRoot, 'browser-renderer.tsx')],
  outfile: path.join(bundleRoot, 'renderer.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' }
})
await build({
  entryPoints: [path.join(sourceRoot, 'runner.mjs')],
  outfile: path.join(bundleRoot, 'runner.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['playwright-core'],
  legalComments: 'none'
})

const files = await collectFiles(bundleRoot)
const bundleSha256 = treeSha256(files)
await writeFile(path.join(actionRoot, 'action.json'), `${JSON.stringify({
  name: 'canvas.export',
  version: '1.0.0',
  runtimeProfile: 'browser/playwright-1.61/v1',
  runtimeContractVersion: '1',
  playwrightVersion: '1.61.0',
  bundle: './bundle',
  entrypoint: 'runner.mjs',
  bundleSha256
}, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ action: 'canvas.export', version: '1.0.0', files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), bundleSha256 })}\n`)

async function collectFiles(root) {
  const files = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolutePath)
      else if (entry.isFile()) {
        const content = await readFile(absolutePath)
        files.push({ relativePath: path.relative(root, absolutePath).split(path.sep).join('/'), size: content.length, sha256: createHash('sha256').update(content).digest('hex') })
      } else throw new Error(`Sandbox Action contains a non-regular entry: ${absolutePath}`)
    }
  }
  await visit(await realpath(root))
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function treeSha256(files) {
  const hash = createHash('sha256')
  for (const file of files) hash.update(`${file.relativePath}\0${file.size}\0${file.sha256}\n`)
  return hash.digest('hex')
}
