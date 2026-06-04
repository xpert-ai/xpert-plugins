#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const PLUGIN_TABLE_PREFIX = 'plugin_'
const args = new Set(process.argv.slice(2))
const mode = args.has('--all') ? 'all' : args.has('--staged') ? 'staged' : 'changed'

function run(command) {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return ''
  }
}

function listFiles() {
  if (mode === 'all') {
    return run('git ls-files').split('\n')
  }

  if (mode === 'staged') {
    return run('git diff --cached --name-only --diff-filter=ACMR').split('\n')
  }

  const tracked = run('git diff --name-only --diff-filter=ACMR HEAD').split('\n')
  const untracked = run('git ls-files --others --exclude-standard').split('\n')
  return [...tracked, ...untracked]
}

function normalizeFiles(files) {
  return Array.from(
    new Set(
      files
        .map((file) => file.trim())
        .filter(Boolean)
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
        .filter((file) => !file.includes('/dist/') && !file.includes('/node_modules/'))
    )
  )
}

function readFileForMode(file) {
  if (mode !== 'staged') {
    const absolute = path.resolve(file)
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : ''
  }

  const staged = run(`git show :${shellQuote(file)}`)
  if (staged) {
    return staged
  }
  const absolute = path.resolve(file)
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : ''
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

function findEntityDecorators(source) {
  const decorators = []
  const pattern = /@Entity\s*\(([\s\S]*?)\)/g
  let match
  while ((match = pattern.exec(source))) {
    decorators.push({
      argument: match[1].trim(),
      line: source.slice(0, match.index).split(/\r?\n/).length
    })
  }
  return decorators
}

function resolveTableName(argument, source) {
  if (!argument) {
    return null
  }

  const stringLiteral = argument.match(/^['"`]([^'"`]+)['"`]$/)
  if (stringLiteral) {
    return stringLiteral[1]
  }

  const objectName = argument.match(/(?:^|[,{\s])name\s*:\s*['"`]([^'"`]+)['"`]/)
  if (objectName) {
    return objectName[1]
  }

  const staticTableName = source.match(/static\s+readonly\s+tableName\s*=\s*['"`]([^'"`]+)['"`]/)
  if (staticTableName) {
    return staticTableName[1]
  }

  const identifier = argument.match(/^([A-Za-z_$][\w$]*)$/)?.[1]
  if (identifier) {
    const identifierPattern = new RegExp(`(?:const|let|var)\\s+${escapeRegExp(identifier)}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`)
    return source.match(identifierPattern)?.[1] ?? null
  }

  return null
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const failures = []
for (const file of normalizeFiles(listFiles())) {
  const source = readFileForMode(file)
  if (!source.includes('@Entity')) {
    continue
  }

  for (const decorator of findEntityDecorators(source)) {
    const tableName = resolveTableName(decorator.argument, source)
    if (!tableName || !tableName.startsWith(PLUGIN_TABLE_PREFIX)) {
      failures.push({
        file,
        line: decorator.line,
        tableName,
        argument: decorator.argument
      })
    }
  }
}

if (failures.length) {
  console.error(`Plugin Entity table names must start with "${PLUGIN_TABLE_PREFIX}".`)
  for (const failure of failures) {
    const actual = failure.tableName ? `"${failure.tableName}"` : `unresolved @Entity(${failure.argument || ''})`
    console.error(`- ${failure.file}:${failure.line} uses ${actual}`)
  }
  process.exit(1)
}

console.log(`Plugin Entity table name check passed (${mode}).`)
