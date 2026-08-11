import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireFromPackage = createRequire(path.join(packageRoot, 'package.json'))
const sourceRoot = path.join(packageRoot, 'sandbox-actions', 'model-review-render')
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'model-review-render')
const bundleRoot = path.join(actionRoot, 'bundle')
const copiedPackages = new Map()

await rm(actionRoot, { recursive: true, force: true })
await mkdir(bundleRoot, { recursive: true })
await build({
  entryPoints: [path.join(sourceRoot, 'runner.mjs')],
  outfile: path.join(bundleRoot, 'runner.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['playwright-core'],
  legalComments: 'none'
})
await copyPackageClosure('esbuild')
await copyPackageClosure('@esbuild/linux-x64')
await copyPackageClosure('@esbuild/linux-arm64')
await copyPackageClosure('@esbuild/darwin-arm64')
await copyThree()
const files = await collectFiles(bundleRoot)
const bundleSha256 = treeSha256(files)
await writeFile(path.join(actionRoot, 'action.json'), `${JSON.stringify({
  name: 'img2threejs.review-render',
  version: '1.0.0',
  runtimeProfile: 'browser/playwright-1.61/v1',
  runtimeContractVersion: '1',
  playwrightVersion: '1.61.0',
  bundle: './bundle',
  entrypoint: 'runner.mjs',
  bundleSha256
}, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ action: 'img2threejs.review-render', bundleSha256, files: files.length })}\n`)

async function copyPackageClosure(packageName) {
  const packageJsonPath = await resolvePackageJson(packageName)
  if (!packageJsonPath) throw new Error(`Sandbox Action dependency is missing: ${packageName}`)
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  if (copiedPackages.has(packageName)) return
  copiedPackages.set(packageName, packageJson.version)
  const target = path.join(bundleRoot, 'runtime-modules', ...packageName.split('/'))
  await mkdir(path.dirname(target), { recursive: true })
  await cp(path.dirname(packageJsonPath), target, { recursive: true, dereference: true, filter: shouldCopy })
}
async function copyThree() {
  const packageJsonPath = await resolvePackageJson('three')
  if (!packageJsonPath) throw new Error('Sandbox Action dependency is missing: three')
  const target = path.join(bundleRoot, 'runtime-modules', 'three')
  await mkdir(path.join(target, 'build'), { recursive: true })
  await cp(packageJsonPath, path.join(target, 'package.json'))
  await cp(path.join(path.dirname(packageJsonPath), 'build', 'three.module.js'), path.join(target, 'build', 'three.module.js'))
  await cp(path.join(path.dirname(packageJsonPath), 'build', 'three.core.js'), path.join(target, 'build', 'three.core.js'))
  const roundedBoxTarget = path.join(target, 'examples', 'jsm', 'geometries')
  await mkdir(roundedBoxTarget, { recursive: true })
  await cp(
    path.join(path.dirname(packageJsonPath), 'examples', 'jsm', 'geometries', 'RoundedBoxGeometry.js'),
    path.join(roundedBoxTarget, 'RoundedBoxGeometry.js')
  )
  const exporterTarget = path.join(target, 'examples', 'jsm', 'exporters')
  await mkdir(exporterTarget, { recursive: true })
  await cp(
    path.join(path.dirname(packageJsonPath), 'examples', 'jsm', 'exporters', 'GLTFExporter.js'),
    path.join(exporterTarget, 'GLTFExporter.js')
  )
  const environmentTarget = path.join(target, 'examples', 'jsm', 'environments')
  await mkdir(environmentTarget, { recursive: true })
  await cp(
    path.join(path.dirname(packageJsonPath), 'examples', 'jsm', 'environments', 'RoomEnvironment.js'),
    path.join(environmentTarget, 'RoomEnvironment.js')
  )
}
async function resolvePackageJson(packageName) {
  let current = packageRoot
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', ...packageName.split('/'), 'package.json')
    if (await stat(candidate).then((value) => value.isFile()).catch(() => false)) return realpath(candidate)
    current = path.dirname(current)
  }
  try { return await realpath(requireFromPackage.resolve(`${packageName}/package.json`)) } catch { return null }
}
async function collectFiles(root) {
  const result = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) {
        const content = await readFile(absolute)
        result.push({ relativePath: path.relative(root, absolute).split(path.sep).join('/'), size: content.length, sha256: createHash('sha256').update(content).digest('hex') })
      } else throw new Error(`Sandbox Action contains a non-regular entry: ${absolute}`)
    }
  }
  await visit(await realpath(root))
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}
function treeSha256(files) {
  const hash = createHash('sha256')
  for (const file of files) hash.update(`${file.relativePath}\0${file.size}\0${file.sha256}\n`)
  return hash.digest('hex')
}
function shouldCopy(source) {
  const name = path.basename(source)
  return !['node_modules', '.git', '.DS_Store', 'test', 'tests'].includes(name) && !name.endsWith('.map') && !name.endsWith('.d.ts')
}
