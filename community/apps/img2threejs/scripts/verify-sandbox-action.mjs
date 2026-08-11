import { createHash } from 'node:crypto'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'model-review-render')
const manifest = JSON.parse(await readFile(path.join(actionRoot, 'action.json'), 'utf8'))
if (manifest.name !== 'img2threejs.review-render' || manifest.version !== '1.0.0' ||
  manifest.runtimeProfile !== 'browser/playwright-1.61/v1' || manifest.playwrightVersion !== '1.61.0' ||
  manifest.entrypoint !== 'runner.mjs' || manifest.bundle !== './bundle') {
  throw new Error('Sandbox Action manifest contract is invalid.')
}
const bundleRoot = await realpath(path.join(actionRoot, 'bundle'))
const files = []
async function visit(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) await visit(absolute)
    else if (entry.isFile()) {
      const content = await readFile(absolute)
      files.push({ relativePath: path.relative(bundleRoot, absolute).split(path.sep).join('/'), size: content.length, sha256: createHash('sha256').update(content).digest('hex') })
    } else throw new Error(`Non-regular Action entry: ${absolute}`)
  }
}
await visit(bundleRoot)
files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
const hash = createHash('sha256')
for (const file of files) hash.update(`${file.relativePath}\0${file.size}\0${file.sha256}\n`)
if (hash.digest('hex') !== manifest.bundleSha256) throw new Error('Sandbox Action tree hash does not match.')
for (const required of [
  'runner.mjs',
  'runtime-modules/esbuild/package.json',
  'runtime-modules/@esbuild/linux-x64/bin/esbuild',
  'runtime-modules/@esbuild/linux-arm64/bin/esbuild',
  'runtime-modules/@esbuild/darwin-arm64/bin/esbuild',
  'runtime-modules/three/build/three.module.js',
  'runtime-modules/three/build/three.core.js',
  'runtime-modules/three/examples/jsm/exporters/GLTFExporter.js',
  'runtime-modules/three/examples/jsm/environments/RoomEnvironment.js'
]) {
  if (!(await stat(path.join(bundleRoot, required)).then((value) => value.isFile()).catch(() => false))) throw new Error(`Sandbox Action is missing ${required}.`)
}
process.stdout.write(`${JSON.stringify({ verified: true, files: files.length, bundleSha256: manifest.bundleSha256 })}\n`)
