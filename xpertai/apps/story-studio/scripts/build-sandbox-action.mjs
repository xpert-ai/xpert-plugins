import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const actionRoot = path.join(root, 'dist', 'sandbox-actions', 'video-frame')
const bundleRoot = path.join(actionRoot, 'bundle')
await rm(actionRoot, { recursive: true, force: true })
await mkdir(bundleRoot, { recursive: true })
await build({ entryPoints: [path.join(root, 'sandbox-actions', 'video-frame', 'runner.mjs')], outfile: path.join(bundleRoot, 'runner.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node20', external: ['playwright-core'], legalComments: 'none' })
const files = await collectFiles(bundleRoot)
const bundleSha256 = treeSha256(files)
await writeFile(path.join(actionRoot, 'action.json'), `${JSON.stringify({ name: 'story-studio.extract-video-frame', version: '1.0.0', runtimeProfile: 'browser/video-playwright-1.61/v1', runtimeContractVersion: '1', playwrightVersion: '1.61.0', bundle: './bundle', entrypoint: 'runner.mjs', bundleSha256 }, null, 2)}\n`)

async function collectFiles(directory) {
  const files = []
  for (const entry of (await readdir(await realpath(directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(absolute))
    else { const content = await readFile(absolute); files.push({ relativePath: path.relative(bundleRoot, absolute).split(path.sep).join('/'), size: content.length, sha256: createHash('sha256').update(content).digest('hex') }) }
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}
function treeSha256(files) { const hash = createHash('sha256'); for (const file of files) hash.update(`${file.relativePath}\0${file.size}\0${file.sha256}\n`); return hash.digest('hex') }
