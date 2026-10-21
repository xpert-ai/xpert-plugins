import { readFile, readdir, mkdir, rm, copyFile, writeFile, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
const packageIndex = process.argv.indexOf('--verify-package')
if (packageIndex >= 0 && !process.argv[packageIndex + 1]) throw new Error('Missing extracted package directory')
const packageRoot = packageIndex >= 0 ? pathToFileURL(resolve(process.argv[packageIndex + 1]) + '/') : root
const target = new URL('dist/sandbox-actions/', packageRoot)
const verify = process.argv.includes('--verify') || packageIndex >= 0
const names = (await readdir(new URL('sandbox-actions/', root))).sort()
// The Action owns regular source files only; links must not pull host content into a release.
for (const name of names) {
  if (!/^[A-Za-z0-9_-]+\.(mjs|py)$/.test(name) || !(await lstat(new URL(`sandbox-actions/${name}`, root))).isFile())
    throw new Error(`Invalid Action source: ${name}`)
}
if (!verify) { await rm(target, { recursive: true, force: true }); await mkdir(new URL('bundle/', target), { recursive: true }) }
else {
  for (const directory of [target, new URL('bundle/', target)])
    if (!(await lstat(fileURLToPath(directory).replace(/\/$/, ''))).isDirectory()) throw new Error('Invalid Action bundle directory')
  if (JSON.stringify((await readdir(new URL('bundle/', target))).sort()) !== JSON.stringify(names))
    throw new Error('Action bundle file list differs from source')
}
const hash = createHash('sha256')
for (const name of names) {
  const source = new URL(`sandbox-actions/${name}`, root), destination = new URL(`bundle/${name}`, target)
  const bytes = await readFile(source), digest = createHash('sha256').update(bytes).digest('hex')
  hash.update(`${name}\0${bytes.length}\0${digest}\n`)
  if (verify) {
    if (!(await lstat(destination)).isFile()) throw new Error(`Invalid Action bundle file: ${name}`)
    if (!bytes.equals(await readFile(destination))) throw new Error(`Stale bundle: ${name}`)
  }
  else await copyFile(source, destination)
}
const action = { name: 'workspace_script.execute', version: '1.0.0', runtimeProfile: 'compute/node-python/v1', runtimeContractVersion: '1',
  bundle: './bundle', entrypoint: 'runner.mjs', bundleSha256: hash.digest('hex') }
if (verify) {
  const manifest = new URL('action.json', target)
  if (!(await lstat(manifest)).isFile()) throw new Error('Invalid Action manifest')
  if (JSON.stringify(JSON.parse(await readFile(manifest))) !== JSON.stringify(action)) throw new Error('Stale action manifest')
}
else await writeFile(new URL('action.json', target), JSON.stringify(action, null, 2) + '\n')
