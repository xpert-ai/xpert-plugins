import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const manifestPath = path.join(root, '.xpertai-plugin/plugin.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.name !== pkg.name) throw new Error('Plugin manifest name does not match package.json')
if (manifest.version !== pkg.version)
  await writeFile(manifestPath, JSON.stringify({ ...manifest, version: pkg.version }, null, 2) + '\n')
await cp(path.join(root, 'src/_assets'), path.join(root, 'dist/_assets'), { recursive: true })
const output = path.join(root, 'dist/sandbox-actions/convert')
await rm(output, { recursive: true, force: true })
await mkdir(path.join(output, 'bundle'), { recursive: true })
const hash = createHash('sha256')
for (const name of (await readdir(path.join(root, 'sandbox-actions/convert')))
  .filter((name) => name.endsWith('.mjs'))
  .sort()) {
  const bytes = await readFile(path.join(root, 'sandbox-actions/convert', name))
  await writeFile(path.join(output, 'bundle', name), bytes)
  hash.update(`${name}\0${bytes.length}\0${createHash('sha256').update(bytes).digest('hex')}\n`)
}
await writeFile(
  path.join(output, 'action.json'),
  JSON.stringify(
    {
      name: 'opendataloader.convert',
      version: '1.2.1',
      runtimeProfile: 'document/java-17/v1',
      runtimeContractVersion: '1',
      bundle: './bundle',
      entrypoint: 'runner.mjs',
      bundleSha256: hash.digest('hex')
    },
    null,
    2
  ) + '\n'
)
