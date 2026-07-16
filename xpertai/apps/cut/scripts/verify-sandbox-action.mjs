import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'cut-render')
const manifest = JSON.parse(await readFile(path.join(actionRoot, 'action.json'), 'utf8'))
if (manifest.name !== 'cut.render-mp4' || manifest.version !== '1.0.0' || manifest.runtimeProfile !== 'browser/playwright-1.61/v1') {
  throw new Error('Sandbox Action manifest identity or runtime profile is invalid.')
}
const bundleRoot = await realpath(path.join(actionRoot, manifest.bundle))
const files = []
let bytes = 0
async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    const fileStat = await lstat(absolutePath)
    if (fileStat.isSymbolicLink()) throw new Error(`Action Bundle contains a symlink: ${absolutePath}`)
    if (fileStat.isDirectory()) await visit(absolutePath)
    else {
      if (!fileStat.isFile() || fileStat.nlink !== 1) throw new Error(`Action Bundle contains a non-regular or hard-linked file: ${absolutePath}`)
      const content = await readFile(absolutePath)
      bytes += content.length
      files.push({ relativePath: path.relative(bundleRoot, absolutePath).split(path.sep).join('/'), size: content.length, sha256: createHash('sha256').update(content).digest('hex') })
    }
  }
}
await visit(bundleRoot)
files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
const hash = createHash('sha256')
for (const file of files) hash.update(`${file.relativePath}\0${file.size}\0${file.sha256}\n`)
if (hash.digest('hex') !== manifest.bundleSha256) throw new Error('Sandbox Action tree hash is stale.')
if (files.length > 100 || bytes > 32 * 1024 * 1024) throw new Error('Sandbox Action exceeds Cut package limits.')
for (const required of ['runner.mjs', 'browser-entry.js']) {
  if (!files.some((file) => file.relativePath === required)) throw new Error(`Sandbox Action ${required} is missing.`)
}
if (files.some((file) => file.relativePath.startsWith('node_modules/') || file.relativePath.includes('/node_modules/'))) throw new Error('Sandbox Action must not bundle a node_modules tree.')
if (files.some((file) => file.relativePath.startsWith('playwright-core/'))) throw new Error('playwright-core must be supplied by Browser Runtime.')
const runner = await readFile(path.join(bundleRoot, 'runner.mjs'), 'utf8')
if (!runner.includes('from "playwright-core"') && !runner.includes("from 'playwright-core'")) throw new Error('Runner must keep playwright-core external.')
process.stdout.write(`${JSON.stringify({ action: manifest.name, version: manifest.version, files: files.length, bytes, bundleSha256: manifest.bundleSha256 })}\n`)
