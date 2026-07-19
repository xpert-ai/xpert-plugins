import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computePackState, withoutNodeDebugger } from './release-package-state.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseRoot = join(packageRoot, '.release')
const manifestPath = join(releaseRoot, 'release-manifest.json')
const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))

if (typeof packageJson.name !== 'string' || typeof packageJson.version !== 'string') {
  throw new Error('Cut package name or version is missing.')
}

await rm(releaseRoot, { recursive: true, force: true })
await mkdir(releaseRoot, { recursive: true })

const packResult = spawnSync('pnpm', ['pack', '--pack-destination', releaseRoot], {
  cwd: packageRoot,
  encoding: 'utf8',
  env: withoutNodeDebugger(process.env),
  maxBuffer: 32 * 1024 * 1024
})

if (packResult.status !== 0) {
  if (packResult.stdout) process.stdout.write(packResult.stdout)
  if (packResult.stderr) process.stderr.write(packResult.stderr)
  throw new Error(`pnpm pack failed with exit code ${packResult.status ?? 'unknown'}.`)
}

const tarballs = (await readdir(releaseRoot)).filter((file) => file.endsWith('.tgz'))
if (tarballs.length !== 1) {
  throw new Error(`Expected one prepared tarball, found ${tarballs.length}.`)
}

const tarball = tarballs[0]
const tarballPath = join(releaseRoot, tarball)
const tarballBytes = await readFile(tarballPath)
const tarballStat = await stat(tarballPath)
const tarballPackageJson = readTarballPackageJson(tarballPath)
const packState = await computePackState(packageRoot)

if (tarballPackageJson.name !== packageJson.name || tarballPackageJson.version !== packageJson.version) {
  throw new Error(
    `Prepared tarball identity mismatch: expected ${packageJson.name}@${packageJson.version}, ` +
    `received ${tarballPackageJson.name ?? 'unknown'}@${tarballPackageJson.version ?? 'unknown'}.`
  )
}

const manifest = {
  schemaVersion: 1,
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  tarball,
  size: tarballStat.size,
  sha256: createHash('sha256').update(tarballBytes).digest('hex'),
  sourceFileCount: packState.fileCount,
  sourceTreeSha256: packState.treeSha256,
  preparedAt: new Date().toISOString()
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
process.stdout.write(
  `Prepared ${manifest.packageName}@${manifest.packageVersion}\n` +
  `Tarball: ${tarballPath}\n` +
  `SHA-256: ${manifest.sha256}\n` +
  'Run pnpm run release:publish and enter a fresh npm OTP only when prompted.\n'
)

function readTarballPackageJson(tarballPath) {
  const result = spawnSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: withoutNodeDebugger(process.env),
    maxBuffer: 1024 * 1024
  })
  if (result.status !== 0) {
    throw new Error(`Unable to inspect prepared tarball: ${result.stderr?.trim() || 'tar failed'}`)
  }
  return JSON.parse(result.stdout)
}
