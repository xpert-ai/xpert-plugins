#!/usr/bin/env node
// Inspect source without importing plugins. Staged checks read only Git's index,
// including package-only releases and metadata constants in sibling source files.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../xpertai/package.json', import.meta.url))
let ts
const sourceExtensions = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']
const fieldPaths = { version: ['version'], level: ['xpert', 'plugin', 'level'], artifactNamespace: ['xpert', 'plugin', 'artifactNamespace'] }
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 })
const list = (output) => output.split('\0').filter(Boolean)

function unwrap(node) {
  while (node && (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ||
    ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression
  return node
}
const nameOf = (node) => node && (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) ? node.text : undefined

export function inspectPluginMetadata({ packageFile, read, files }) {
  ts ??= require('typescript')
  const modules = new Map()
  const resolving = new Set()
  const packageDir = path.posix.dirname(packageFile)
  const entry = sourceExtensions.map((ext) => `${packageDir}/src/index${ext}`).find((file) => files.has(file))
  if (!entry) throw new Error(`${packageFile}: cannot find a source plugin entry (src/index.ts or .js)`)

  function source(file) {
    if (!modules.has(file)) modules.set(file, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true))
    return modules.get(file)
  }
  function relativeFile(file, specifier) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
    return [target, ...sourceExtensions.map((ext) => target.replace(/\.(?:mjs|cjs|js)$/, '') + ext)]
      .find((candidate) => files.has(candidate))
  }
  function member(result, key) {
    if (result?.fields) return result.fields.get(key)
    if (result?.module) return binding(result.module, key)
    if (result?.builtin) return { builtin: `${result.builtin}.${key}` }
    if (result?.value !== null && typeof result?.value === 'object') {
      return { value: result.value[key], ...(result.origin ? { origin: { file: result.origin.file, keys: [...result.origin.keys, key] } } : {}) }
    }
    return undefined
  }
  function jsonFile(file) {
    return { value: JSON.parse(read(file)), origin: { file, keys: [] } }
  }
  function imported(file, specifier, exported) {
    if (['fs', 'path', 'url', 'module'].includes(specifier)) specifier = `node:${specifier}`
    if (specifier.startsWith('node:')) return { builtin: exported === 'default' ? specifier : `${specifier}.${exported}` }
    if (!specifier.startsWith('.')) return undefined
    const target = relativeFile(file, specifier)
    if (!target) return undefined
    if (target.endsWith('.json')) return exported === 'default' ? jsonFile(target) : member(jsonFile(target), exported)
    return exported === '*' ? { module: target } : binding(target, exported)
  }
  function binding(file, name) {
    const key = `${file}:${name}`
    if (resolving.has(key)) return undefined
    resolving.add(key)
    try {
      for (const statement of source(file).statements) {
        if (name === 'default' && ts.isExportAssignment(statement)) return evaluate(statement.expression, file)
        if (ts.isImportDeclaration(statement) && statement.importClause) {
          const clause = statement.importClause
          const specifier = statement.moduleSpecifier.text
          if (clause.name?.text === name) return imported(file, specifier, 'default')
          if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings) && clause.namedBindings.name.text === name) {
            return specifier.startsWith('node:') ? { builtin: specifier } : imported(file, specifier, '*')
          }
          for (const item of clause.namedBindings?.elements ?? []) {
            if (item.name.text === name) return imported(file, specifier, item.propertyName?.text ?? name)
          }
        }
        if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) {
          for (const declaration of statement.declarationList.declarations) {
            if (nameOf(declaration.name) === name) return evaluate(declaration.initializer, file)
            if (ts.isObjectBindingPattern(declaration.name)) {
              const element = declaration.name.elements.find((item) => nameOf(item.name) === name)
              if (element && !element.initializer && !element.dotDotDotToken) {
                return member(evaluate(declaration.initializer, file), nameOf(element.propertyName ?? element.name))
              }
            }
          }
        }
        if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          const item = statement.exportClause.elements.find((item) => item.name.text === name)
          if (item) return statement.moduleSpecifier
            ? imported(file, statement.moduleSpecifier.text, item.propertyName?.text ?? name)
            : binding(file, item.propertyName?.text ?? name)
        }
      }
      return undefined
    } finally { resolving.delete(key) }
  }
  function evaluate(expression, file) {
    const node = unwrap(expression)
    if (!node) return undefined
    if (ts.isStringLiteralLike(node)) return { value: node.text }
    if (ts.isIdentifier(node)) {
      if (node.text === '__dirname') return { value: path.posix.dirname(file) }
      if (node.text === 'require') return { builtin: 'require' }
      return binding(file, node.text)
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (node.getText(source(file)) === 'import.meta.url') return { value: file }
      return member(evaluate(node.expression, file), node.name.text)
    }
    if (ts.isElementAccessExpression(node)) return member(evaluate(node.expression, file), evaluate(node.argumentExpression, file)?.value)
    if (ts.isObjectLiteralExpression(node)) {
      const fields = new Map()
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = evaluate(property.expression, file)
          if (!spread?.fields && !spread?.origin) return undefined
          for (const key of spread.fields?.keys() ?? Object.keys(spread.value)) fields.set(key, member(spread, key))
        } else if (ts.isPropertyAssignment(property)) fields.set(nameOf(property.name), evaluate(property.initializer, file))
        else if (ts.isShorthandPropertyAssignment(property)) fields.set(property.name.text, binding(file, property.name.text))
      }
      return { fields }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL') {
      const [relative, base] = node.arguments?.map((arg) => evaluate(arg, file)?.value) ?? []
      if (typeof relative === 'string' && typeof base === 'string') return { value: path.posix.normalize(path.posix.join(path.posix.dirname(base), relative)) }
    }
    if (!ts.isCallExpression(node)) return undefined
    if (ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source(file)) === 'JSON' && node.expression.name.text === 'parse') {
      const input = evaluate(node.arguments[0], file)
      return input?.resource ? jsonFile(input.resource) : undefined
    }
    const callable = evaluate(node.expression, file)?.builtin
    const args = node.arguments.map((arg) => evaluate(arg, file)?.value)
    if (callable === 'node:module.createRequire') return { builtin: 'require' }
    if (callable === 'require' && typeof args[0] === 'string') return imported(file, args[0], 'default')
    if (callable === 'node:fs.readFileSync' && typeof args[0] === 'string' && files.has(args[0])) return { resource: args[0] }
    if (callable === 'node:url.fileURLToPath' && typeof args[0] === 'string') return { value: args[0] }
    if (callable === 'node:path.dirname' && typeof args[0] === 'string') return { value: path.posix.dirname(args[0]) }
    if (callable === 'node:path.join' && args.every((arg) => typeof arg === 'string')) return { value: path.posix.join(...args) }
    return undefined
  }

  const meta = member(binding(entry, 'default'), 'meta')
  if (!meta) throw new Error(`${entry}: cannot statically resolve the default plugin's meta; use a metadata object with package.json property references`)
  return { entry, fields: Object.fromEntries(Object.keys(fieldPaths).map((field) => [field, member(meta, field)])) }
}

export function checkPluginMetadata({ root, staged = false, all = false, packagePath, log = console.log }) {
  const files = new Set(list(git(root, staged ? ['ls-files', '--cached', '-z'] : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])))
  const changed = all ? [...files] : list(git(root, staged
    ? ['diff', '--cached', '--name-only', '--no-renames', '-z']
    : ['diff', 'HEAD', '--name-only', '--no-renames', '-z']))
  if (!staged && !all) changed.push(...list(git(root, ['ls-files', '--others', '--exclude-standard', '-z'])))
  const read = (file) => staged ? git(root, ['show', `:${file}`]) : readFileSync(path.join(root, file), 'utf8')
  const packages = new Set()
  if (packagePath && !files.has(`${packagePath}/package.json`)) throw new Error(`Unknown package directory: ${packagePath}`)
  for (const file of packagePath ? [`${packagePath}/package.json`] : changed) {
    if (/(?:^|\/)(?:node_modules|dist)\//.test(file)) continue
    let dir = path.posix.dirname(file)
    while (dir !== '.') {
      if (files.has(`${dir}/package.json`)) { packages.add(`${dir}/package.json`); break }
      dir = path.posix.dirname(dir)
    }
  }
  const errors = []
  let checked = 0
  for (const packageFile of packages) {
    const manifest = JSON.parse(read(packageFile))
    if (!manifest.xpert?.plugin) {
      let previous
      try { previous = JSON.parse(git(root, ['show', `HEAD:${packageFile}`])) } catch { /* New non-plugin package. */ }
      if (!previous?.xpert?.plugin) continue
    }
    checked++
    try {
      const { entry, fields } = inspectPluginMetadata({ packageFile, read, files })
      for (const [field, keys] of Object.entries(fieldPaths)) {
        const expected = keys.reduce((value, key) => value?.[key], manifest)
        if (field === 'artifactNamespace' && expected === undefined && manifest.xpert?.plugin?.level === 'organization' && !fields[field]) continue
        if (typeof expected !== 'string' || !expected ||
          (field === 'level' && !['system', 'tenant', 'organization'].includes(expected)) ||
          (field === 'artifactNamespace' && !/^[a-z0-9_]+$/.test(expected))) {
          errors.push(`${packageFile}: missing or invalid ${keys.join('.')}`)
        } else if (fields[field]?.origin?.file !== packageFile || fields[field].origin.keys.join('.') !== keys.join('.') || fields[field].value !== expected) {
          errors.push(`${entry}: meta.${field} must read this package's package.json ${keys.join('.')} directly or through imported constants; hardcoded copies and fallback values can drift after release`)
        }
      }
    } catch (error) { errors.push(error.message) }
  }
  if (errors.length) throw new Error(errors.join('\n'))
  log(`Plugin metadata check passed (${staged ? 'staged' : 'working-tree'}, ${checked} plugins).`)
  return checked
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    const packageIndex = args.indexOf('--package')
    if (args.some((arg, index) => !['--staged', '--all', '--package'].includes(arg) && !(packageIndex >= 0 && index === packageIndex + 1)) ||
      (packageIndex >= 0 && !args[packageIndex + 1]) || (args.includes('--staged') && (args.includes('--all') || packageIndex >= 0))) {
      throw new Error('Usage: node scripts/check-plugin-metadata.mjs [--staged | --all | --package <repository-relative-directory>]')
    }
    checkPluginMetadata({ root: git(process.cwd(), ['rev-parse', '--show-toplevel']).trim(), staged: args.includes('--staged'), all: args.includes('--all'), packagePath: packageIndex >= 0 ? args[packageIndex + 1] : undefined })
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
