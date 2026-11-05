import { readFile, writeFile, mkdir, copyFile, readdir, rm } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
if (process.argv.includes('--clean')) {
  const target = resolve(root, 'dist')
  if (relative(root, target) !== 'dist') throw new Error('Refusing to clean a path outside this package dist directory')
  await rm(target, { recursive: true, force: true })
  process.exit(0)
}
const check = process.argv.includes('--check')
const artifact = resolve(root, 'dist/build-manifest.json')
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]))).flat()
}
const inputs = (await Promise.all(['src', 'remote/src', 'scripts'].map(dir => files(resolve(root, dir))))).flat()
const configFiles = ['package.json', 'tsconfig.json', 'tsconfig.tests.json', 'tsconfig.remote.json']
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex')
const sourceHashes = Object.fromEntries(await Promise.all([...inputs, ...configFiles.map(file => resolve(root, file))].sort().map(async file => [relative(root, file).replaceAll('\\', '/'), await hash(file)])))
if (check) {
  const manifest = JSON.parse(await readFile(artifact, 'utf8'))
  if (JSON.stringify(manifest.sources) !== JSON.stringify(sourceHashes)) throw new Error('Build is stale: source hashes differ; run npm run build.')
  for (const [file, expected] of Object.entries(manifest.outputs)) {
    if (await hash(resolve(root, file)) !== expected) throw new Error(`Built output changed: ${file}`)
  }
  process.stdout.write('Dist freshness and asset hashes verified.\n')
} else {
  await mkdir(resolve(root, 'dist/remote'), { recursive: true })
  await copyFile(resolve(root, 'src/support-triage-assistant.yaml'), resolve(root, 'dist/support-triage-assistant.yaml'))
  await copyFile(resolve(root, 'remote/dist/index.html'), resolve(root, 'dist/remote/index.html'))
  const outputs = Object.fromEntries(await Promise.all((await files(resolve(root, 'dist'))).filter(file => file !== artifact).sort().map(async file => [relative(root, file).replaceAll('\\', '/'), await hash(file)])))
  await writeFile(artifact, JSON.stringify({ version: 1, sources: sourceHashes, outputs }, null, 2) + '\n')
  process.stdout.write('Assistant template, remote assets and build manifest packaged.\n')
}
