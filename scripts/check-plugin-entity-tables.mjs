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
  if (mode !== 'staged') {
    return readWorkspaceFile(file)
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
function resolveTableName(argument, source, packageInfo) {
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

  const pluginArtifactCall = argument.match(
    /^pluginArtifactTableName\s*\(\s*([^,]+)\s*,\s*['"`]([a-z0-9_]+)['"`]\s*\)$/
  )
  if (pluginArtifactCall) {
    const namespace = resolveNamespaceExpression(pluginArtifactCall[1], source, packageInfo)
    return namespace ? pluginTableName(namespace, pluginArtifactCall[2]) : null
  }

  const packageTableHelperCall = argument.match(/^([A-Za-z_$][\w$]*)Table\s*\(\s*['"`]([a-z0-9_]+)['"`]\s*\)$/)
  if (packageTableHelperCall && packageInfo?.namespace) {
    return pluginTableName(packageInfo.namespace, packageTableHelperCall[2])
  }

  return null
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
    const tableName = resolveTableName(decorator.argument, source, packageInfo)
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
