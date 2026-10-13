import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
async function files(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await files(join(directory, entry.name)))
    else found.push(join(directory, entry.name))
  }
  return found
}
async function digest(paths) {
  const result = {}
  for (const path of paths.sort()) result[relative(root, path)] = createHash('sha256').update(await readFile(path)).digest('hex')
  return result
}
const source = await digest([
  ...await files(join(root, 'src')), ...await files(join(root, 'mcp-apps')), ...await files(join(root, 'ui')),
  join(root, 'package.json'), join(root, '.xpertai-plugin/plugin.json'), join(root, 'tsconfig.lib.json'), join(root, 'scripts/build-mcp-app.mjs')
])
const output = await digest((await files(join(root, 'dist'))).filter(path => /\.(js|css|html|d\.ts)$/.test(path)))
const manifestPath = join(root, 'dist/build-manifest.json')
const manifest = JSON.stringify({ source, output }, null, 2) + '\n'
if (process.argv.includes('--record')) await writeFile(manifestPath, manifest)
else if (await readFile(manifestPath, 'utf8') !== manifest) throw new Error('Source/dist digest mismatch; rebuild Maps before installation')
await stat(join(root, 'dist/index.js'))
await stat(join(root, 'dist/index.d.ts'))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
if (pkg.xpert?.plugin?.level !== 'organization' || pkg.xpert?.plugin?.artifactNamespace !== 'maps') throw new Error('Incorrect Maps scope metadata')
const bundle = JSON.parse(await readFile(join(root, '.xpertai-plugin/plugin.json'), 'utf8'))
if (bundle.name !== pkg.name || bundle.version !== pkg.version || bundle.artifactNamespace !== pkg.xpert.plugin.artifactNamespace) throw new Error('Maps bundle manifest must match package metadata')
if (!pkg.files.includes('.xpertai-plugin')) throw new Error('MCP App bundle root manifest missing from package allowlist')
if (!pkg.files.includes('docs')) throw new Error('Documentation missing from package allowlist')
const docs = JSON.parse(await readFile(join(root, 'docs/docs.json'), 'utf8'))
async function checkPages(value) {
  if (!value || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    if (key === 'pages' && Array.isArray(item)) {
      for (const page of item) {
        if (typeof page === 'string') await stat(join(root, 'docs', `${page}.mdx`))
        else await checkPages(page)
      }
    } else if (Array.isArray(item)) { for (const child of item) await checkPages(child) }
    else await checkPages(item)
  }
}
await checkPages(docs.navigation)
console.log('Maps distribution and documentation verified')
