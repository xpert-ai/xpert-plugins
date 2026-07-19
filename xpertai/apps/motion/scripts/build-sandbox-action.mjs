import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireFromPackage = createRequire(path.join(packageRoot, 'package.json'))
const sourceRoot = path.join(packageRoot, 'sandbox-actions', 'hyperframes-render')
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'hyperframes-render')
const bundleRoot = path.join(actionRoot, 'bundle')
const copiedPackages = new Map()
const actionVersion = '1.0.0'

await rm(actionRoot, { recursive: true, force: true })
await mkdir(bundleRoot, { recursive: true })
await build({
  entryPoints: [path.join(sourceRoot, 'runner.mjs')],
  outfile: path.join(bundleRoot, 'runner.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'none'
})
const producerPackageJsonPath = await copyPackageClosure(
  '@hyperframes/producer',
  requireFromPackage,
  packageRoot,
  false
)
const producerRoot = path.dirname(producerPackageJsonPath)
await copyPackageClosure('postcss', createRequire(producerPackageJsonPath), producerRoot, true)
await copyPackageClosure('esbuild', requireFromPackage, packageRoot, false)
await copyPackageClosure('@esbuild/linux-x64', requireFromPackage, packageRoot, false)
await copyPackageClosure('@esbuild/darwin-arm64', requireFromPackage, packageRoot, false)

const files = await collectFiles(bundleRoot)
const bundleSha256 = treeSha256(files)
await writeFile(
  path.join(actionRoot, 'action.json'),
  `${JSON.stringify(
    {
      name: 'motion.hyperframes-render',
      version: actionVersion,
      runtimeProfile: 'browser/video-playwright-1.61/v1',
      runtimeContractVersion: '1',
      playwrightVersion: '1.61.0',
      bundle: './bundle',
      entrypoint: 'runner.mjs',
      bundleSha256
    },
    null,
    2
  )}\n`
)
process.stdout.write(
  `${JSON.stringify({
    action: 'motion.hyperframes-render',
    version: actionVersion,
    bundleSha256,
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.size, 0)
  })}\n`
)

async function copyPackageClosure(packageName, resolver, resolverRoot, includeDependencies = true) {
  if (packageName === 'playwright-core') return
  const unresolvedPackageJsonPath = await resolvePackageJson(packageName, resolver, resolverRoot)
  if (!unresolvedPackageJsonPath) throw new Error(`Sandbox Action dependency is missing: ${packageName}`)
  const packageJsonPath = await realpath(unresolvedPackageJsonPath)
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const previous = copiedPackages.get(packageName)
  if (previous && previous !== packageJson.version)
    throw new Error(`Sandbox Action dependency ${packageName} resolves to ${previous} and ${packageJson.version}.`)
  if (previous) return packageJsonPath
  copiedPackages.set(packageName, packageJson.version)
  const packageDirectory = path.dirname(packageJsonPath)
  const target = path.join(bundleRoot, 'runtime-modules', ...packageName.split('/'))
  await mkdir(path.dirname(target), { recursive: true })
  await cp(packageDirectory, target, { recursive: true, dereference: true, filter: shouldCopyPackageEntry })
  const packageRequire = createRequire(packageJsonPath)
  if (includeDependencies) {
    for (const dependency of Object.keys(packageJson.dependencies ?? {}))
      await copyPackageClosure(dependency, packageRequire, packageDirectory)
    for (const dependency of Object.keys(packageJson.optionalDependencies ?? {})) {
      await copyPackageClosure(dependency, packageRequire, packageDirectory).catch(() => undefined)
    }
  }
  return packageJsonPath
}

async function resolvePackageJson(packageName, resolver, resolverRoot) {
  let current = resolverRoot
  while (current !== path.dirname(current)) {
    const direct = path.join(current, 'node_modules', ...packageName.split('/'), 'package.json')
    if (
      await stat(direct)
        .then((value) => value.isFile())
        .catch(() => false)
    )
      return direct
    current = path.dirname(current)
  }
  try {
    return resolver.resolve(`${packageName}/package.json`)
  } catch {
    try {
      let current = path.dirname(resolver.resolve(packageName))
      while (current !== path.dirname(current)) {
        const candidate = path.join(current, 'package.json')
        if (
          await stat(candidate)
            .then((value) => value.isFile())
            .catch(() => false)
        )
          return candidate
        current = path.dirname(current)
      }
    } catch {
      return null
    }
    return null
  }
}

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
        result.push({
          relativePath: path.relative(root, absolutePath).split(path.sep).join('/'),
          size: content.length,
          sha256: createHash('sha256').update(content).digest('hex')
        })
      } else throw new Error(`Sandbox Action contains a non-regular entry: ${absolutePath}`)
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
function shouldCopyPackageEntry(source) {
  const name = path.basename(source)
  if (name === 'node_modules' || name === '.DS_Store' || name === '.git' || name === 'test' || name === 'tests')
    return false
  if (name.endsWith('.map') || name.endsWith('.d.ts') || name.endsWith('.tsbuildinfo')) return false
  return true
}
