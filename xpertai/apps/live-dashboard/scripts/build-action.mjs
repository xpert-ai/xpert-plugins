import { readFile, readdir, mkdir, writeFile, rm, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve } from 'node:path'
import { build } from 'vite'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const packageIndex = process.argv.indexOf('--verify-package')
if (packageIndex >= 0 && !process.argv[packageIndex + 1]) throw Error('Missing extracted package directory')
const target = join(packageIndex >= 0 ? resolve(process.argv[packageIndex + 1]) : root, 'dist/sandbox-actions')
const verify = process.argv.includes('--verify') || packageIndex >= 0
const sourceNames = ['resource-cache.mjs', 'runner.mjs', 'validate.mjs']
if (!(await lstat(join(root, 'sandbox-actions'))).isDirectory() ||
    JSON.stringify((await readdir(join(root, 'sandbox-actions'))).sort()) !== JSON.stringify(sourceNames))
  throw Error('Invalid Action source directory')
for (const name of sourceNames)
  if (!(await lstat(join(root, 'sandbox-actions', name))).isFile()) throw Error(`Invalid Action source: ${name}`)
const result = await build({ configFile: false, root, logLevel: 'error', build: { write: false, target: 'es2022', minify: true,
  lib: { entry: join(root, 'src/validation/host-entry.ts'), name: 'DocumentHost', formats: ['iife'] } } })
const chunk = (Array.isArray(result) ? result : [result]).flatMap(item => item.output).find(item => item.type === 'chunk' && item.isEntry)
if (!chunk) throw Error('Missing document host bundle')
const files = { 'host.js': Buffer.from(chunk.code),
  ...Object.fromEntries(await Promise.all(sourceNames.map(async name => [name, await readFile(join(root, 'sandbox-actions', name))]))) }
const hash = createHash('sha256')
if (!verify) { await rm(target, { recursive: true, force: true }); await mkdir(join(target, 'bundle'), { recursive: true }) }
else {
  for (const directory of [target, join(target, 'bundle')])
    if (!(await lstat(directory)).isDirectory()) throw Error('Invalid Action bundle directory')
  if (JSON.stringify((await readdir(join(target, 'bundle'))).sort()) !== JSON.stringify(Object.keys(files).sort()))
    throw Error('Action bundle file list differs from source')
}
for (const [name, bytes] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
  hash.update(`${name}\0${bytes.length}\0${createHash('sha256').update(bytes).digest('hex')}\n`)
  if (verify) {
    const path = join(target, 'bundle', name)
    if (!(await lstat(path)).isFile()) throw Error(`Invalid Action bundle file: ${name}`)
    if (!bytes.equals(await readFile(path))) throw Error('Stale HTML validation action')
  }
  else await writeFile(join(target, 'bundle', name), bytes)
}
const action = { name: 'live_dashboard.validate-html', version: '1.0.0', runtimeProfile: 'browser/playwright-1.61/v1', runtimeContractVersion: '1',
  playwrightVersion: '1.61.0', bundle: './bundle', entrypoint: 'runner.mjs', bundleSha256: hash.digest('hex') }
if (verify) {
  const path = join(target, 'action.json')
  if (!(await lstat(path)).isFile()) throw Error('Invalid Action manifest')
  if (JSON.stringify(action) !== JSON.stringify(JSON.parse(await readFile(path)))) throw Error('Stale HTML validation manifest')
}
else await writeFile(join(target, 'action.json'), JSON.stringify(action, null, 2) + '\n')
