#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const PLUGIN_TABLE_PREFIX = 'plugin_'
const PLUGIN_ARTIFACT_PART_PATTERN = /^[a-z0-9_]+$/
const args = new Set(process.argv.slice(2))
const mode = args.has('--all') ? 'all' : args.has('--staged') ? 'staged' : 'changed'
const sourceCache = new Map()

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
  if (sourceCache.has(file)) {
    return sourceCache.get(file)
  }

  let source = ''
  if (mode !== 'staged') {
    const absolute = path.resolve(file)
    source = existsSync(absolute) ? readFileSync(absolute, 'utf8') : ''
  } else {
    const staged = run(`git show :${shellQuote(file)}`)
    if (staged) {
      source = staged
    } else {
      const absolute = path.resolve(file)
      source = existsSync(absolute) ? readFileSync(absolute, 'utf8') : ''
    }
  }

  sourceCache.set(file, source)
  return source
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

function findEntityDecorators(source) {
  const decorators = []
  const pattern = /@Entity\s*\(/g
  let match
  while ((match = pattern.exec(source))) {
    const openIndex = source.indexOf('(', match.index)
    const closeIndex = findMatchingDelimiter(source, openIndex, '(', ')')
    if (closeIndex === -1) {
      decorators.push({
        argument: '',
        line: source.slice(0, match.index).split(/\r?\n/).length
      })
      continue
    }
    decorators.push({
      argument: source.slice(openIndex + 1, closeIndex).trim(),
      line: source.slice(0, match.index).split(/\r?\n/).length
    })
    pattern.lastIndex = closeIndex + 1
  }
  return decorators
}

function findMatchingDelimiter(source, openIndex, open, close) {
  let depth = 0
  let quote = null
  let escaped = false

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character
      continue
    }
    if (character === open) {
      depth += 1
    } else if (character === close) {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function resolveTableName(argument, file, seen = new Set()) {
  return resolveExpression(argument, file, seen)
}

function resolveExpression(rawExpression, file, seen) {
  const expression = stripTypeScriptWrappers(rawExpression)
  if (!expression) {
    return null
  }

  const stringLiteral = expression.match(/^['"`]([^'"`]+)['"`]$/)
  if (stringLiteral) {
    return stringLiteral[1]
  }

  if (expression.startsWith('{') && expression.endsWith('}')) {
    const nameExpression = extractObjectProperty(expression, 'name')
    return nameExpression ? resolveExpression(nameExpression, file, seen) : null
  }

  const call = matchCallExpression(expression)
  if (call) {
    const imported = findNamedImport(readFileForMode(file), call.callee)
    if (
      imported?.specifier === '@xpert-ai/plugin-sdk' &&
      imported.importedName === 'pluginArtifactTableName'
    ) {
      const callArgs = splitTopLevel(call.arguments)
      if (callArgs.length !== 2) {
        return null
      }
      const namespace = resolveExpression(callArgs[0], file, seen)
      const tableKey = resolveExpression(callArgs[1], file, seen)
      if (
        namespace &&
        tableKey &&
        PLUGIN_ARTIFACT_PART_PATTERN.test(namespace) &&
        PLUGIN_ARTIFACT_PART_PATTERN.test(tableKey)
      ) {
        return `${PLUGIN_TABLE_PREFIX}${namespace}_${tableKey}`
      }
    }
    return null
  }

  const member = expression.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/)
  if (member) {
    const [, objectName, propertyName] = member
    const source = readFileForMode(file)
    const localInitializer = extractConstInitializer(source, objectName)
    if (localInitializer) {
      const propertyExpression = extractObjectProperty(localInitializer, propertyName)
      return propertyExpression ? resolveExpression(propertyExpression, file, seen) : null
    }

    const imported = findNamedImport(source, objectName)
    if (imported && imported.specifier.startsWith('.')) {
      const importedFile = resolveImportFile(file, imported.specifier)
      if (!importedFile) {
        return null
      }
      const importedInitializer = extractConstInitializer(
        readFileForMode(importedFile),
        imported.importedName
      )
      if (importedInitializer) {
        const propertyExpression = extractObjectProperty(importedInitializer, propertyName)
        return propertyExpression
          ? resolveExpression(propertyExpression, importedFile, seen)
          : null
      }
    }

    if (propertyName === 'tableName') {
      const staticPattern = new RegExp(
        `class\\s+${escapeRegExp(objectName)}\\b[\\s\\S]*?static\\s+readonly\\s+tableName\\s*=\\s*['"\`]([^'"\`]+)['"\`]`
      )
      return source.match(staticPattern)?.[1] ?? null
    }
    return null
  }

  const identifier = expression.match(/^([A-Za-z_$][\w$]*)$/)?.[1]
  if (identifier) {
    const symbolKey = `${file}:${identifier}`
    if (seen.has(symbolKey)) {
      return null
    }
    const nextSeen = new Set(seen).add(symbolKey)
    const source = readFileForMode(file)
    const localInitializer = extractConstInitializer(source, identifier)
    if (localInitializer) {
      return resolveExpression(localInitializer, file, nextSeen)
    }

    const imported = findNamedImport(source, identifier)
    if (imported && imported.specifier.startsWith('.')) {
      const importedFile = resolveImportFile(file, imported.specifier)
      return importedFile
        ? resolveExpression(imported.importedName, importedFile, nextSeen)
        : null
    }
  }

  return null
}

function stripTypeScriptWrappers(expression) {
  let result = expression.trim().replace(/\s+as\s+const\s*$/, '').trim()
  while (result.startsWith('(')) {
    const closeIndex = findMatchingDelimiter(result, 0, '(', ')')
    if (closeIndex !== result.length - 1) {
      break
    }
    result = result.slice(1, -1).trim()
  }
  return result
}

function matchCallExpression(expression) {
  const callee = expression.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1]
  if (!callee) {
    return null
  }
  const openIndex = expression.indexOf('(')
  const closeIndex = findMatchingDelimiter(expression, openIndex, '(', ')')
  if (closeIndex !== expression.length - 1) {
    return null
  }
  return {
    callee,
    arguments: expression.slice(openIndex + 1, closeIndex)
  }
}

function splitTopLevel(source) {
  const parts = []
  let start = 0
  let roundDepth = 0
  let braceDepth = 0
  let bracketDepth = 0
  let quote = null
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character
    } else if (character === '(') {
      roundDepth += 1
    } else if (character === ')') {
      roundDepth -= 1
    } else if (character === '{') {
      braceDepth += 1
    } else if (character === '}') {
      braceDepth -= 1
    } else if (character === '[') {
      bracketDepth += 1
    } else if (character === ']') {
      bracketDepth -= 1
    } else if (
      character === ',' &&
      roundDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      parts.push(source.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(source.slice(start).trim())
  return parts.filter(Boolean)
}

function extractConstInitializer(source, identifier) {
  const declarationPattern = new RegExp(
    `(?:export\\s+)?const\\s+${escapeRegExp(identifier)}(?:\\s*:[^=\\n]+)?\\s*=`,
    'm'
  )
  const declaration = declarationPattern.exec(source)
  if (!declaration) {
    return null
  }

  const start = declaration.index + declaration[0].length
  let roundDepth = 0
  let braceDepth = 0
  let bracketDepth = 0
  let quote = null
  let escaped = false

  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character
    } else if (character === '(') {
      roundDepth += 1
    } else if (character === ')') {
      roundDepth -= 1
    } else if (character === '{') {
      braceDepth += 1
    } else if (character === '}') {
      braceDepth -= 1
    } else if (character === '[') {
      bracketDepth += 1
    } else if (character === ']') {
      bracketDepth -= 1
    } else if (
      (character === ';' || character === '\n') &&
      roundDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      return source.slice(start, index).trim()
    }
  }
  return source.slice(start).trim()
}

function extractObjectProperty(objectExpression, propertyName) {
  const expression = stripTypeScriptWrappers(objectExpression)
  if (!expression.startsWith('{') || !expression.endsWith('}')) {
    return null
  }
  for (const property of splitTopLevel(expression.slice(1, -1))) {
    const match = property.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/)
    if (match?.[1] === propertyName) {
      return match[2].trim()
    }
  }
  return null
}

function findNamedImport(source, localName) {
  const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g
  let importMatch
  while ((importMatch = importPattern.exec(source))) {
    for (const binding of importMatch[1].split(',')) {
      const bindingMatch = binding
        .trim()
        .match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/)
      if (bindingMatch && (bindingMatch[2] ?? bindingMatch[1]) === localName) {
        return {
          importedName: bindingMatch[1],
          specifier: importMatch[2]
        }
      }
    }
  }
  return null
}

function resolveImportFile(importerFile, specifier) {
  const importerDirectory = path.dirname(importerFile)
  const unresolved = path.normalize(path.join(importerDirectory, specifier))
  const withoutRuntimeExtension = unresolved.replace(/\.(?:js|mjs|cjs)$/, '')
  const candidates = [
    unresolved,
    `${withoutRuntimeExtension}.ts`,
    `${withoutRuntimeExtension}.tsx`,
    path.join(withoutRuntimeExtension, 'index.ts')
  ]
  return candidates.find((candidate) => readFileForMode(candidate)) ?? null
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
    const tableName = resolveTableName(decorator.argument, file)
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
