#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const PLUGIN_TABLE_PREFIX = 'plugin_'
const ARTIFACT_NAMESPACE_PATTERN = /^[a-z0-9_]+$/
const ARTIFACT_TABLE_NAME_PATTERN = /^[a-z0-9_]+$/
const args = new Set(process.argv.slice(2))
const mode = args.has('--all') ? 'all' : args.has('--staged') ? 'staged' : 'changed'
const allTrackedFiles = run('git ls-files').split('\n').filter(Boolean)
const packageCache = new Map()
const packageNamespaceCache = new Map()
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

function readWorkspaceFile(file) {
  const absolute = path.resolve(file)
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : ''
}

function readFileForMode(file) {
  if (sourceCache.has(file)) {
    return sourceCache.get(file)
  }

  let source = ''
  if (mode !== 'staged') {
    source = readWorkspaceFile(file)
  } else {
    const staged = run(`git show :${shellQuote(file)}`)
    source = staged || readWorkspaceFile(file)
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
    const openParenIndex = pattern.lastIndex - 1
    const closeParenIndex = findMatchingParen(source, openParenIndex)
    if (closeParenIndex === -1) {
      decorators.push({
        argument: '',
        line: source.slice(0, match.index).split(/\r?\n/).length
      })
      continue
    }

    decorators.push({
      argument: source.slice(openParenIndex + 1, closeParenIndex).trim(),
      line: source.slice(0, match.index).split(/\r?\n/).length
    })
    pattern.lastIndex = closeParenIndex + 1
  }
  return decorators
}

function findMatchingParen(source, openParenIndex) {
  let depth = 0
  let quote = null
  let escaped = false

  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index]

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }

    if (char === '(') {
      depth += 1
      continue
    }

    if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

// Resolve common @Entity(...) table-name forms without evaluating plugin code.
function resolveTableName(argument, source, packageInfo, file, seen = new Set()) {
  if (!argument) {
    return null
  }

  const expression = argument.trim().replace(/\s+as\s+const\s*$/, '').trim()
  const stringLiteral = expression.match(/^['"`]([^'"`]+)['"`]$/)
  if (stringLiteral) {
    return stringLiteral[1]
  }

  const objectName = expression.match(/(?:^|[,{\s])name\s*:\s*['"`]([^'"`]+)['"`]/)
  if (objectName) {
    return objectName[1]
  }

  const staticTableName = source.match(/static\s+readonly\s+tableName\s*=\s*['"`]([^'"`]+)['"`]/)
  if (staticTableName) {
    return staticTableName[1]
  }

  const member = expression.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/)
  if (member) {
    const [, objectIdentifier, propertyName] = member
    const localInitializer = extractConstInitializer(source, objectIdentifier)
    if (localInitializer) {
      const propertyExpression = extractObjectProperty(localInitializer, propertyName)
      return propertyExpression
        ? resolveTableName(propertyExpression, source, packageInfo, file, seen)
        : null
    }

    const imported = findNamedImport(source, objectIdentifier)
    if (imported && imported.specifier.startsWith('.')) {
      const importedFile = resolveImportFile(file, imported.specifier)
      if (!importedFile) {
        return null
      }
      const importedSource = readFileForMode(importedFile)
      const importedInitializer = extractConstInitializer(importedSource, imported.importedName)
      const propertyExpression = importedInitializer
        ? extractObjectProperty(importedInitializer, propertyName)
        : null
      return propertyExpression
        ? resolveTableName(propertyExpression, importedSource, packageInfo, importedFile, seen)
        : null
    }
  }

  const identifier = expression.match(/^([A-Za-z_$][\w$]*)$/)?.[1]
  if (identifier) {
    const identifierPattern = new RegExp(`(?:const|let|var)\\s+${escapeRegExp(identifier)}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`)
    const localLiteral = source.match(identifierPattern)?.[1]
    if (localLiteral) {
      return localLiteral
    }

    const symbolKey = `${file}:${identifier}`
    if (seen.has(symbolKey)) {
      return null
    }
    const imported = findNamedImport(source, identifier)
    if (imported && imported.specifier.startsWith('.')) {
      const importedFile = resolveImportFile(file, imported.specifier)
      if (!importedFile) {
        return null
      }
      const importedSource = readFileForMode(importedFile)
      const importedInitializer = extractConstInitializer(importedSource, imported.importedName)
      return importedInitializer
        ? resolveTableName(
            importedInitializer,
            importedSource,
            packageInfo,
            importedFile,
            new Set(seen).add(symbolKey)
          )
        : null
    }
  }

  const call = matchCallExpression(expression)
  if (call) {
    const imported = findNamedImport(source, call.callee)
    if (
      imported?.specifier === '@xpert-ai/plugin-sdk' &&
      imported.importedName === 'pluginArtifactTableName'
    ) {
      const callArguments = splitTopLevel(call.arguments)
      if (callArguments.length !== 2) {
        return null
      }
      const namespace = resolveTableName(
        callArguments[0],
        source,
        packageInfo,
        file,
        seen
      )
      const tableKey = resolveTableName(callArguments[1], source, packageInfo, file, seen)
      return namespace && tableKey ? pluginTableName(namespace, tableKey) : null
    }
  }

  const pluginArtifactCall = expression.match(
    /^pluginArtifactTableName\s*\(\s*([^,]+)\s*,\s*['"`]([a-z0-9_]+)['"`]\s*\)$/
  )
  if (pluginArtifactCall) {
    const namespace = resolveNamespaceExpression(pluginArtifactCall[1], source, packageInfo)
    return namespace ? pluginTableName(namespace, pluginArtifactCall[2]) : null
  }

  const packageTableHelperCall = expression.match(/^([A-Za-z_$][\w$]*)Table\s*\(\s*['"`]([a-z0-9_]+)['"`]\s*\)$/)
  if (packageTableHelperCall && packageInfo?.namespace) {
    return pluginTableName(packageInfo.namespace, packageTableHelperCall[2])
  }

  return null
}

function matchCallExpression(expression) {
  const callee = expression.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1]
  if (!callee) {
    return null
  }
  const openParenIndex = expression.indexOf('(')
  const closeParenIndex = findMatchingParen(expression, openParenIndex)
  if (closeParenIndex !== expression.length - 1) {
    return null
  }
  return {
    callee,
    arguments: expression.slice(openParenIndex + 1, closeParenIndex)
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
  const expression = objectExpression.trim().replace(/\s+as\s+const\s*$/, '').trim()
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
  const unresolved = path.normalize(path.join(path.dirname(importerFile), specifier))
  const withoutRuntimeExtension = unresolved.replace(/\.(?:js|mjs|cjs)$/, '')
  const candidates = [
    unresolved,
    `${withoutRuntimeExtension}.ts`,
    `${withoutRuntimeExtension}.tsx`,
    path.join(withoutRuntimeExtension, 'index.ts')
  ]
  return candidates.find((candidate) => readFileForMode(candidate)) ?? null
}

function resolveNamespaceExpression(expression, source, packageInfo) {
  const normalized = expression.trim()
  const literal = normalized.match(/^['"`]([^'"`]+)['"`]$/)
  if (literal) {
    return literal[1]
  }

  const identifier = normalized.match(/^([A-Za-z_$][\w$]*)$/)?.[1]
  if (identifier) {
    const identifierPattern = new RegExp(`(?:const|let|var)\\s+${escapeRegExp(identifier)}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`)
    return source.match(identifierPattern)?.[1] ?? packageInfo?.namespace ?? null
  }

  return packageInfo?.namespace ?? null
}

function pluginTableName(namespace, tableKey) {
  if (!ARTIFACT_NAMESPACE_PATTERN.test(namespace) || !ARTIFACT_NAMESPACE_PATTERN.test(tableKey)) {
    return null
  }
  return `${PLUGIN_TABLE_PREFIX}${namespace}_${tableKey}`
}

function findPackageInfo(file) {
  const packageJsonPath = findNearestPackageJson(file)
  if (!packageJsonPath) {
    return null
  }

  if (packageCache.has(packageJsonPath)) {
    return packageCache.get(packageJsonPath)
  }

  let name = null
  try {
    name = JSON.parse(readWorkspaceFile(packageJsonPath)).name ?? null
  } catch {
    name = null
  }

  const root = path.dirname(packageJsonPath)
  const explicitNamespace = findExplicitArtifactNamespace(root)
  const derivedNamespace = name ? derivePluginArtifactNamespace(name) : null
  const namespace = explicitNamespace ?? derivedNamespace
  const packageInfo = {
    root,
    packageJsonPath,
    name,
    namespace,
    explicitNamespace,
    derivedNamespace
  }
  packageCache.set(packageJsonPath, packageInfo)
  return packageInfo
}

function findNearestPackageJson(file) {
  let currentDir = path.dirname(path.resolve(file))
  const cwd = process.cwd()

  while (currentDir.startsWith(cwd)) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    if (existsSync(packageJsonPath)) {
      return path.relative(cwd, packageJsonPath)
    }

    const parent = path.dirname(currentDir)
    if (parent === currentDir) {
      return null
    }
    currentDir = parent
  }

  return null
}

// Find a package-level explicit namespace declaration such as OFFICE_EDITOR_ARTIFACT_NAMESPACE.
function findExplicitArtifactNamespace(packageRoot) {
  if (packageNamespaceCache.has(packageRoot)) {
    return packageNamespaceCache.get(packageRoot)
  }

  const candidates = allTrackedFiles
    .filter((file) => file.startsWith(`${packageRoot}/`))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .filter((file) => !file.includes('/dist/') && !file.includes('/node_modules/'))

  const namespaces = new Set()
  for (const file of candidates) {
    const source = readFileForMode(file)
    const pattern = /(?:export\s+)?const\s+[A-Z0-9_]*ARTIFACT_NAMESPACE\s*=\s*['"`]([a-z0-9_]+)['"`]/g
    let match
    while ((match = pattern.exec(source))) {
      namespaces.add(match[1])
    }
  }

  const namespace = namespaces.values().next().value ?? null
  packageNamespaceCache.set(packageRoot, namespace)
  return namespace
}

// Keep CI fallback derivation aligned with plugin-sdk's derivePluginArtifactNamespace helper.
function derivePluginArtifactNamespace(packageName) {
  const namespace = packageName
    .trim()
    .replace(/^@[^/]+\//, '')
    .replace(/^plugin[-_]/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

  return ARTIFACT_NAMESPACE_PATTERN.test(namespace) ? namespace : null
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const failures = []
const packageNamespaces = new Map()
const legacyNamespaceWarnings = new Map()
for (const file of normalizeFiles(listFiles())) {
  const source = readFileForMode(file)
  if (!source.includes('@Entity')) {
    continue
  }

  const packageInfo = findPackageInfo(file)
  if (packageInfo?.namespace) {
    packageNamespaces.set(packageInfo.root, packageInfo)
    if (!packageInfo.explicitNamespace && !legacyNamespaceWarnings.has(packageInfo.root)) {
      legacyNamespaceWarnings.set(packageInfo.root, packageInfo)
    }
  }

  for (const decorator of findEntityDecorators(source)) {
    const tableName = resolveTableName(decorator.argument, source, packageInfo, file)
    const requiredPrefix = packageInfo?.explicitNamespace
      ? `${PLUGIN_TABLE_PREFIX}${packageInfo.explicitNamespace}_`
      : PLUGIN_TABLE_PREFIX
    if (!tableName || !tableName.startsWith(requiredPrefix) || !ARTIFACT_TABLE_NAME_PATTERN.test(tableName)) {
      failures.push({
        file,
        line: decorator.line,
        tableName,
        argument: decorator.argument,
        requiredPrefix
      })
    }
  }
}

if (failures.length) {
  console.error(`Plugin Entity table names must start with their artifact namespace prefix.`)
  for (const failure of failures) {
    const actual = failure.tableName ? `"${failure.tableName}"` : `unresolved @Entity(${failure.argument || ''})`
    console.error(`- ${failure.file}:${failure.line} uses ${actual}; expected prefix "${failure.requiredPrefix}"`)
  }
  process.exit(1)
}

const namespaceRoots = new Map()
for (const packageInfo of packageNamespaces.values()) {
  if (!packageInfo.namespace) {
    continue
  }

  const roots = namespaceRoots.get(packageInfo.namespace) ?? []
  roots.push(packageInfo)
  namespaceRoots.set(packageInfo.namespace, roots)
}

for (const [namespace, roots] of namespaceRoots.entries()) {
  if (roots.length <= 1) {
    continue
  }

  console.warn(`Plugin artifact namespace "${namespace}" is used by multiple packages; review before publishing:`)
  for (const packageInfo of roots) {
    console.warn(`- ${packageInfo.name ?? packageInfo.root} (${packageInfo.root})`)
  }
}

for (const packageInfo of legacyNamespaceWarnings.values()) {
  console.warn(
    `Plugin package "${packageInfo.name ?? packageInfo.root}" declares entities without ARTIFACT_NAMESPACE; v1 accepts existing "${PLUGIN_TABLE_PREFIX}" table names and future versions should declare "${packageInfo.derivedNamespace}".`
  )
}

console.log(`Plugin Entity table name check passed (${mode}).`)
