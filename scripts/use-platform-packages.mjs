// Local development links only: validate the whole plan before replacing symlinks.
// Inspect built entries without importing host code; manifests and lockfiles stay unchanged.
import fs from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const usage =
  'Usage: node scripts/use-platform-packages.mjs [--dry-run] [--chatkit-types <built-package-dir>] <host-checkout> <plugin-dir> [...]'
const receiptName = '.xpert-host-sdk.json'

async function statOrNull(path) {
  try {
    return await fs.lstat(path)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function previousLink(target) {
  const stat = await statOrNull(target)
  if (!stat) return null
  if (!stat.isSymbolicLink()) throw new Error(`Refusing to replace non-symlink: ${target}`)
  return fs.readlink(target)
}

async function resolveTarget(target) {
  const parent = dirname(target)
  const resolvedParent = (await statOrNull(parent)) ? await fs.realpath(parent) : await resolveTarget(parent)
  return join(resolvedParent, basename(target))
}

async function inspectPackage(directory, name) {
  directory = await fs.realpath(directory)
  const manifest = JSON.parse(await fs.readFile(join(directory, 'package.json'), 'utf8'))
  if (manifest.name !== name || typeof manifest.version !== 'string' || !manifest.version.trim()) {
    throw new Error(`Expected built ${name} with a version: ${directory}`)
  }
  const rootExport = manifest.exports?.['.'] ?? manifest.exports
  const entries = [
    ...new Set(
      [
        typeof rootExport === 'string' ? rootExport : null,
        rootExport?.import,
        rootExport?.require,
        rootExport?.default,
        rootExport?.module,
        manifest.main,
        manifest.module
      ].filter((entry) => typeof entry === 'string')
    )
  ]
  const types = rootExport?.types ?? manifest.types ?? manifest.typings
  if (!entries.length || typeof types !== 'string') throw new Error(`Missing runtime or type entry: ${directory}`)
  const files = []
  for (const entry of [...new Set([...entries, types])]) {
    if (isAbsolute(entry)) throw new Error(`Entry must be package-relative: ${entry}`)
    const path = await fs.realpath(resolve(directory, entry))
    const local = relative(directory, path)
    if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local))
      throw new Error(`Entry escapes package: ${entry}`)
    const content = await fs.readFile(path)
    files.push({
      path: entry,
      sha256: createHash('sha256').update(content).digest('hex')
    })
  }
  return { name, directory, version: manifest.version, files }
}

export async function planPlatformPackages({ hostPath, pluginPaths, chatkitPath }) {
  const host = await fs.realpath(resolve(hostPath))
  const packages = await Promise.all(
    ['contracts', 'plugin-sdk'].map((name) => inspectPackage(join(host, 'packages', name, 'dist'), `@xpert-ai/${name}`))
  )
  const plugins = [...new Set(await Promise.all(pluginPaths.map((path) => fs.realpath(resolve(path)))))]
  const links = []
  if (chatkitPath) {
    const chatkit = await inspectPackage(resolve(chatkitPath), '@xpert-ai/chatkit-types')
    for (const pkg of packages)
      links.push({
        target: join(pkg.directory, 'node_modules', chatkit.name),
        destination: chatkit.directory
      })
    packages.push(chatkit)
  }
  for (const plugin of plugins) {
    const manifest = JSON.parse(await fs.readFile(join(plugin, 'package.json'), 'utf8'))
    for (const pkg of packages.filter((pkg) => pkg.name !== '@xpert-ai/chatkit-types')) {
      const declared = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(
        (field) => typeof manifest[field]?.[pkg.name] === 'string' && manifest[field][pkg.name].trim()
      )
      if (!declared) throw new Error(`Declare ${pkg.name} in the plugin manifest first: ${plugin}`)
      links.push({
        target: join(plugin, 'node_modules', pkg.name),
        destination: pkg.directory
      })
    }
  }
  for (const link of links) {
    // Resolve existing ancestors even when node_modules/@xpert-ai is not created yet.
    link.target = await resolveTarget(link.target)
    link.previous = await previousLink(link.target)
  }
  if (new Set(links.map((link) => link.target)).size !== links.length)
    throw new Error('Duplicate link targets in the plan')
  const receipts = []
  for (const plugin of plugins) {
    const path = await resolveTarget(join(plugin, 'node_modules', receiptName))
    const stat = await statOrNull(path)
    if (stat && !stat.isFile()) throw new Error(`Receipt must be a regular file: ${path}`)
    receipts.push({
      path,
      previous: stat ? await fs.readFile(path, 'utf8') : null
    })
  }
  return { schemaVersion: 1, host, packages, plugins, links, receipts }
}

function publicReceipt(plan, dryRun) {
  const { receipts, ...details } = plan
  return { ...details, dryRun, receipts: receipts.map(({ path }) => path) }
}

async function replaceLink(target, destination) {
  await fs.mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await fs.symlink(destination, temporary, 'dir')
    await fs.rename(temporary, target)
  } finally {
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

export async function applyPlatformPackages(plan) {
  // Recheck links before any write, in case the plan was created before another install.
  for (const link of plan.links) {
    if ((await previousLink(link.target)) !== link.previous)
      throw new Error(`Link changed since validation: ${link.target}`)
  }
  for (const receipt of plan.receipts) {
    const stat = await statOrNull(receipt.path)
    if (stat && !stat.isFile()) throw new Error(`Receipt must be a regular file: ${receipt.path}`)
    const content = stat ? await fs.readFile(receipt.path, 'utf8') : null
    if (content !== receipt.previous) throw new Error(`Receipt changed since validation: ${receipt.path}`)
  }
  const undo = []
  const receipt = publicReceipt(plan, false)
  try {
    for (const link of plan.links) {
      if (link.previous && resolve(dirname(link.target), link.previous) === link.destination) continue
      await replaceLink(link.target, link.destination)
      undo.push(() => (link.previous === null ? fs.unlink(link.target) : replaceLink(link.target, link.previous)))
    }
    for (const record of plan.receipts) {
      await fs.mkdir(dirname(record.path), { recursive: true })
      undo.push(() =>
        record.previous === null
          ? fs.unlink(record.path).catch((error) => {
              if (error.code !== 'ENOENT') throw error
            })
          : fs.writeFile(record.path, record.previous, { mode: 0o600 })
      )
      await fs.writeFile(record.path, `${JSON.stringify(receipt, null, 2)}\n`, {
        mode: 0o600
      })
    }
  } catch (error) {
    const failures = []
    for (const rollback of undo.reverse()) {
      try {
        await rollback()
      } catch (failure) {
        failures.push(failure)
      }
    }
    if (failures.length)
      throw new AggregateError(
        [error, ...failures],
        'Linking failed and rollback was incomplete; inspect the listed errors'
      )
    throw error
  }
  return receipt
}

function parseArgs(args) {
  const positional = []
  let dryRun = false
  let chatkitPath
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--chatkit-types') {
      if (chatkitPath !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(usage)
      chatkitPath = args[++i]
    } else if (arg.startsWith('--')) throw new Error(usage)
    else positional.push(arg)
  }
  if (positional.length < 2) throw new Error(usage)
  return {
    hostPath: positional[0],
    pluginPaths: positional.slice(1),
    chatkitPath,
    dryRun
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) console.log(usage)
    else {
      const options = parseArgs(process.argv.slice(2))
      const plan = await planPlatformPackages(options)
      const receipt = options.dryRun ? publicReceipt(plan, true) : await applyPlatformPackages(plan)
      console.log(JSON.stringify(receipt, null, 2))
    }
  } catch (error) {
    console.error(
      error instanceof AggregateError
        ? `${error.message}: ${error.errors.map((item) => item.message).join('; ')}`
        : error.message
    )
    process.exitCode = 1
  }
}
