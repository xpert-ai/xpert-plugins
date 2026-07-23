import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireFromPackage = createRequire(path.join(packageRoot, 'package.json'))
const sourceRoot = path.join(packageRoot, 'sandbox-actions', 'presentation-export')
const actionRoot = path.join(packageRoot, 'dist', 'sandbox-actions', 'presentation-export')
const bundleRoot = path.join(actionRoot, 'bundle')
const projectRoot = path.join(bundleRoot, 'project')
const actionVersion = '1.0.2'
const ignoredBundleNames = new Set(['node_modules', '.DS_Store', '.npmignore', '.gitignore', '.npmrc'])
const esmRequireBanner = `import { createRequire as __xpertCreateRequire } from 'node:module'; const require = __xpertCreateRequire(import.meta.url);`

await rm(actionRoot, { recursive: true, force: true })
await mkdir(bundleRoot, { recursive: true })
await cp(path.join(packageRoot, 'assets', 'upstream', 'dashiai-ppt', 'project'), projectRoot, {
  recursive: true,
  dereference: true,
  filter: shouldCopyBundleEntry
})
await cp(path.join(packageRoot, 'assets', 'upstream', 'UPSTREAM.json'), path.join(bundleRoot, 'UPSTREAM.json'))
const runtimeBuild = await import(pathToFileURL(path.join(
  projectRoot,
  'src',
  'components',
  'themes',
  'runtime-build.mjs'
)).href)
runtimeBuild.buildClientRuntimeFromModules({
  root: projectRoot,
  outFile: path.join(projectRoot, 'dist', 'theme-runtime', 'imported-theme-runtime.generated.js'),
  themeKeys: ['theme13', 'theme14']
})

await build({
  entryPoints: [path.join(sourceRoot, 'runner.mjs')],
  outfile: path.join(bundleRoot, 'runner.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: esmRequireBanner },
  legalComments: 'none'
})
await build({
  entryPoints: [path.join(projectRoot, 'scripts', 'render-goal-deck.jsx')],
  outfile: path.join(projectRoot, 'scripts', 'render-goal-deck.action.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  alias: { esbuild: path.join(sourceRoot, 'esbuild-prebuilt-stub.mjs') },
  banner: { js: esmRequireBanner },
  legalComments: 'none'
})
await build({
  entryPoints: [path.join(projectRoot, 'scripts', 'export-pptx.mjs')],
  outfile: path.join(projectRoot, 'scripts', 'export-pptx.action.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['playwright-core'],
  banner: { js: esmRequireBanner },
  legalComments: 'none'
})

const copiedPackages = new Map()
for (const packageName of [
  '@fontsource/anton',
  '@fontsource/archivo',
  '@fontsource/caveat',
  '@fontsource/ibm-plex-mono',
  '@fontsource/ibm-plex-sans',
  '@fontsource/inter',
  '@fontsource/jetbrains-mono',
  '@fontsource/newsreader',
  '@fontsource/space-grotesk',
  '@fontsource/space-mono',
  'gsap',
  'html-to-image',
  'pptxgenjs'
]) {
  await copyPackageClosure(packageName, requireFromPackage)
}

const files = await collectFiles(bundleRoot)
const bundleSha256 = treeSha256(files)
await writeFile(path.join(actionRoot, 'action.json'), `${JSON.stringify({
  name: 'presentation.export',
  version: actionVersion,
  runtimeProfile: 'browser/playwright-1.61/v1',
  runtimeContractVersion: '1',
  playwrightVersion: '1.61.0',
  bundle: './bundle',
  entrypoint: 'runner.mjs',
  bundleSha256
}, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ action: 'presentation.export', version: actionVersion, bundleSha256, files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) })}\n`)

async function copyPackageClosure(packageName, resolver) {
  if (packageName === 'playwright-core') return
  const packageJsonPath = await resolvePackageJson(packageName, resolver)
  if (!packageJsonPath) return
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const previous = copiedPackages.get(packageName)
  if (previous && previous !== packageJson.version) {
    throw new Error(`Sandbox Action dependency ${packageName} resolves to multiple versions: ${previous}, ${packageJson.version}.`)
  }
  if (previous) return
  copiedPackages.set(packageName, packageJson.version)
  const packageDirectory = path.dirname(packageJsonPath)
  // npm pack always strips nested directories named node_modules. Keep the
  // deterministic dependency closure under an ordinary bundle directory and
  // let the Action Runner expose it through NODE_PATH to its child processes.
  const target = path.join(bundleRoot, 'runtime-modules', ...packageName.split('/'))
  await mkdir(path.dirname(target), { recursive: true })
  await cp(packageDirectory, target, {
    recursive: true,
    dereference: true,
    filter: shouldCopyBundleEntry
  })
  const packageRequire = createRequire(packageJsonPath)
  for (const dependency of Object.keys(packageJson.dependencies ?? {})) await copyPackageClosure(dependency, packageRequire)
  for (const dependency of Object.keys(packageJson.optionalDependencies ?? {})) {
    await copyPackageClosure(dependency, packageRequire).catch(() => undefined)
  }
}

async function resolvePackageJson(packageName, resolver) {
  try {
    return resolver.resolve(`${packageName}/package.json`)
  } catch {
    let current = path.dirname(resolver.resolve(packageName))
    while (current !== path.dirname(current)) {
      const candidate = path.join(current, 'package.json')
      if (await stat(candidate).then((value) => value.isFile()).catch(() => false)) return candidate
      current = path.dirname(current)
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
      } else {
        throw new Error(`Sandbox Action bundle contains a non-regular entry: ${absolutePath}`)
      }
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
function shouldCopyBundleEntry(source) {
  return !ignoredBundleNames.has(path.basename(source))
}
