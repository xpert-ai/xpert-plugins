import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const actionRoot = path.join(root, 'dist', 'sandbox-actions', 'video-frame')
const manifest = JSON.parse(await readFile(path.join(actionRoot, 'action.json'), 'utf8'))
if (manifest.name !== 'story-studio.extract-video-frame' || manifest.version !== '1.0.0') throw new Error('Unexpected Story Studio Sandbox Action manifest.')
if (manifest.runtimeProfile !== 'browser/video-playwright-1.61/v1') {
  throw new Error('Story Studio Sandbox Action must target the browser-video runtime profile.')
}
const bundleRoot = path.join(actionRoot, manifest.bundle)
const files = []
async function visit(directory) { for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const absolute = path.join(directory, entry.name); if (entry.isDirectory()) await visit(absolute); else { const content = await readFile(absolute); files.push({ relativePath: path.relative(bundleRoot, absolute).split(path.sep).join('/'), size: content.length, sha256: createHash('sha256').update(content).digest('hex') }) } } }
await visit(bundleRoot)
const hash = createHash('sha256'); for (const file of files) hash.update(`${file.relativePath}\0${file.size}\0${file.sha256}\n`)
if (hash.digest('hex') !== manifest.bundleSha256) throw new Error('Story Studio Sandbox Action tree hash is stale.')
if (!files.some((file) => file.relativePath === manifest.entrypoint)) throw new Error('Story Studio Sandbox Action entrypoint is missing.')
const entrypoint = await readFile(path.join(bundleRoot, manifest.entrypoint), 'utf8')
if (entrypoint.includes('--input-dir') || entrypoint.includes('--output-dir')) {
  throw new Error('Story Studio Sandbox Action must use the platform runner --request/--output contract.')
}
if (!entrypoint.includes('--request') || !entrypoint.includes('--output')) {
  throw new Error('Story Studio Sandbox Action entrypoint is missing required runner arguments.')
}
