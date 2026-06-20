import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const appsDir = join(root, 'apps')
const entityPattern = /@Entity\(\s*['"`]([^'"`]+)['"`]/g
const violations = []
const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage'])

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue
      }

      walk(path)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue
    }

    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(entityPattern)) {
      const entityName = match[1]
      if (!entityName.startsWith('plugin_')) {
        violations.push(`${relative(root, path)}: ${entityName}`)
      }
    }
  }
}

walk(appsDir)

if (violations.length > 0) {
  console.error('Entity names must start with "plugin_":')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('All community entity names start with "plugin_".')
