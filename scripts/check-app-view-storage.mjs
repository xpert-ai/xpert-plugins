import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const appRoots = [
  join(repositoryRoot, 'xpertai', 'apps'),
  join(repositoryRoot, 'community', 'apps')
]
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.html'])
const forbiddenStorage = /\b(?:localStorage|sessionStorage)\b/g
const violations = []

for (const appRoot of appRoots) {
  for (const file of await listFiles(appRoot)) {
    const normalized = file.split(sep).join('/')
    if (
      (!normalized.includes('/src/lib/remote-components/') &&
        !normalized.includes('/src/lib/artifact-viewer/')) ||
      normalized.endsWith('/app.js') ||
      !sourceExtensions.has(extname(file))
    ) {
      continue
    }

    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(forbiddenStorage)) {
      const line = source.slice(0, match.index).split('\n').length
      violations.push(`${relative(repositoryRoot, file)}:${line}`)
    }
  }
}

if (violations.length) {
  throw new Error(
    `Sandboxed app views must use host capabilities or in-memory UI state instead of Web Storage:\n${violations.join('\n')}`
  )
}

console.log('Verified sandboxed app view sources do not access Web Storage.')

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== 'node_modules' && entry.name !== 'dist')
      .map((entry) => {
        const target = join(directory, entry.name)
        return entry.isDirectory() ? listFiles(target) : [target]
      })
  )
  return nested.flat()
}
