// Bind development builds to the exact host contracts and SDK, without changing lockfiles.
// Re-run pnpm install --force in the plugin workspace to restore registry dependencies.
import { lstat, readFile, symlink, unlink, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const [platformRoot, ...pluginPaths] = process.argv.slice(2)
if (!platformRoot || !pluginPaths.length) throw new Error('Usage: node scripts/use-platform-packages.mjs /path/to/xpert /path/to/plugin [...]')
for (const packageName of ['contracts', 'plugin-sdk']) {
  const target = resolve(platformRoot, 'packages', packageName, 'dist')
  const pkg = JSON.parse(await readFile(resolve(target, 'package.json'), 'utf8'))
  if (pkg.name !== `@xpert-ai/${packageName}`) throw new Error(`Invalid public build: ${target}`)
  const entry = pkg.exports?.['.']?.import ?? pkg.module ?? pkg.main
  const api = await import(pathToFileURL(resolve(target, entry)).href)
  if (packageName === 'contracts' && typeof api.getPluginApplicationScopes !== 'function')
    throw new Error('Build the host contracts with scalar/array App scope support first')
  for (const pluginPath of pluginPaths) {
    const root = resolve(pluginPath)
    await readFile(resolve(root, 'package.json'), 'utf8')
    const link = resolve(root, 'node_modules/@xpert-ai', packageName)
    const current = await lstat(link).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
    if (current && !current.isSymbolicLink()) throw new Error(`Refusing to replace a real directory: ${link}`)
    await mkdir(resolve(root, 'node_modules/@xpert-ai'), { recursive: true })
    if (current) await unlink(link)
    await symlink(target, link, 'dir')
    console.log(`${root}: using public host ${pkg.name} ${pkg.version}`)
  }
}
