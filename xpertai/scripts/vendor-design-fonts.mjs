import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = dirname(scriptDirectory)
const pluginRoot = process.cwd()
const pluginDist = join(pluginRoot, 'dist')
const sourceDist = join(workspaceRoot, 'packages', 'design-fonts', 'dist')
const vendorDist = join(pluginDist, 'vendor', 'design-fonts')

await mkdir(vendorDist, { recursive: true })
await cp(sourceDist, vendorDist, { recursive: true })

let replacementCount = 0
for (const file of await listFiles(pluginDist)) {
  if (!/\.(?:js|d\.ts)$/.test(file) || file.startsWith(vendorDist)) {
    continue
  }
  const source = await readFile(file, 'utf8')
  const vendorEntry = relative(dirname(file), join(vendorDist, 'index.js')).split(sep).join('/')
  const specifier = vendorEntry.startsWith('.') ? vendorEntry : `./${vendorEntry}`
  const rewritten = source.replace(/(['"])@xpert-ai\/design-fonts\1/g, (_match, quote) => {
    replacementCount += 1
    return `${quote}${specifier}${quote}`
  })
  if (rewritten !== source) {
    await writeFile(file, rewritten)
  }
}

if (!replacementCount) {
  throw new Error(`No @xpert-ai/design-fonts imports were found in ${pluginDist}.`)
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return nested.flat()
}
