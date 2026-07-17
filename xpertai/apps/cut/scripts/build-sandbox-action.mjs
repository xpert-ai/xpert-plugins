import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(packageRoot, 'sandbox-actions', 'cut-render')
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'cut-render')
const bundleRoot = path.join(actionRoot, 'bundle')

await rm(actionRoot, { recursive: true, force: true })
await mkdir(bundleRoot, { recursive: true })
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
await build({
  entryPoints: [path.join(sourceRoot, 'browser-entry.ts')],
  outfile: path.join(bundleRoot, 'browser-entry.js'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['chrome120'],
  legalComments: 'none'
})

const files = await collectFiles(bundleRoot)
const bundleSha256 = treeSha256(files)
const manifest = {
  name: 'cut.render-mp4',
  version: '1.1.2',
  runtimeProfile: 'browser/playwright-1.61/v1',
  runtimeContractVersion: '1',
  playwrightVersion: '1.61.0',
  bundle: './bundle',
  entrypoint: 'runner.mjs',
  bundleSha256
}
await writeFile(path.join(actionRoot, 'action.json'), `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ action: manifest.name, version: manifest.version, bundleSha256, files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) })}\n`)

async function collectFiles(root) {
  const result = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolutePath)
      else if (entry.isFile()) {
        const content = await readFile(absolutePath)
        result.push({ relativePath: path.relative(root, absolutePath).split(path.sep).join('/'), size: content.length, sha256: createHash('sha256').update(content).digest('hex') })
      } else throw new Error(`Sandbox Action bundle contains a non-regular entry: ${absolutePath}`)
    }
  }
  await visit(await realpath(root))
  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}
function treeSha256(files) {
  const hash = createHash('sha256')
  for (const file of files) hash.update(`${file.relativePath}\0${file.size}\0${file.sha256}\n`)
  return hash.digest('hex')
}
