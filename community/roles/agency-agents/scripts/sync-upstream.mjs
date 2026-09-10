import { readFileSync, writeFileSync, mkdtempSync, readdirSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parse } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = join(root, 'sources.lock.json')
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
const [sourceName, commit, flag] = process.argv.slice(2)
if (!lock[sourceName] || !/^[a-f0-9]{40}$/.test(commit ?? '')) {
  throw new Error('Usage: npm run sync -- <agency-agents|agency-agents-zh> <full commit SHA> [--apply]')
}
const source = lock[sourceName]
const temporary = mkdtempSync(join(tmpdir(), 'agency-sync-'))
const skipped = new Set(['scripts', 'integrations', 'examples', 'strategy', 'node_modules'])
try {
  const archive = join(temporary, 'source.tar.gz')
  execFileSync('curl', ['-fsSL', `https://codeload.github.com/${source.repository}/tar.gz/${commit}`, '-o', archive])
  const extracted = join(temporary, 'snapshot')
  mkdirSync(extracted)
  execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', extracted])
  const files = {}
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || skipped.has(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) scan(path)
      else if (entry.isFile() && entry.name.endsWith('.md') && directory !== extracted) {
        const bytes = readFileSync(path)
        const frontmatter = bytes.toString().match(/^---\r?\n([\s\S]*?)\r?\n---/)
        if (frontmatter && typeof parse(frontmatter[1])?.name === 'string') {
          files[relative(extracted, path)] = createHash('sha256').update(bytes).digest('hex')
        }
      }
    }
  }
  scan(extracted)
  const added = Object.keys(files).filter((path) => !source.files[path])
  const removed = Object.keys(source.files).filter((path) => !files[path])
  const changed = Object.keys(files).filter((path) => source.files[path] && files[path] !== source.files[path])
  console.log(JSON.stringify({ source: sourceName, commit, added, removed, changed }, null, 2))
  if (flag === '--apply') {
    for (const path of Object.keys(files)) {
      const destination = join(root, 'upstream', sourceName, path)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(join(extracted, path), destination)
    }
    for (const path of removed) rmSync(join(root, 'upstream', sourceName, path))
    copyFileSync(join(extracted, 'LICENSE'), join(root, 'licenses', `${sourceName}.txt`))
    lock[sourceName] = { ...source, commit, files }
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
    console.log('Snapshot updated. Review roles.json mappings before building; new/unmapped roles fail validation.')
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
