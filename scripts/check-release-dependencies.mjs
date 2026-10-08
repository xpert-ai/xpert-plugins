#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const releaseWorkspaces = ['xpertai', 'community']
const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
const metadataNames = new Set(['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', '.npmrc', '.pnpmfile.cjs'])

function git(root, args) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })
}

function isMetadata(file) {
  return metadataNames.has(path.posix.basename(file)) || (file.includes('/patches/') && file.endsWith('.patch'))
}

function inWorkspace(file, workspace) {
  return file.startsWith(`${workspace}/`) || file.startsWith('packages/')
}

export function localReferenceErrors(file, manifest, trackedFiles) {
  const errors = []
  for (const field of dependencyFields) {
    for (const [name, specifier] of Object.entries(manifest[field] ?? {})) {
      if (typeof specifier !== 'string') continue
      const local = specifier.match(/^(?:link:|file:)(.*)$/)?.[1]
      if (local === undefined && !/^(?:\.{1,2}[\\/]|[\\/]|~[\\/]|[A-Za-z]:[\\/])/.test(specifier)) continue
      const reference = local ?? specifier
      if (!reference || reference.startsWith('~') || reference.startsWith('//') ||
          path.posix.isAbsolute(reference) || path.win32.isAbsolute(reference)) {
        errors.push(`${file}: ${field}.${name} uses a machine-specific dependency (${specifier})`)
        continue
      }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference.replaceAll('\\', '/')))
      if (target === '..' || target.startsWith('../') ||
          (!trackedFiles.has(`${target}/package.json`) && !trackedFiles.has(target))) {
        errors.push(`${file}: ${field}.${name} must resolve to a tracked repository package/file (${specifier})`)
      }
    }
  }
  return errors
}

function runPnpm(args, cwd) {
  const result = spawnSync('pnpm', args, {
    cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CI: 'true', pnpm_config_verify_deps_before_run: 'false' }
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${result.stdout ?? ''}${result.stderr ?? ''}`.trim())
  return result.stdout.trim()
}

// Copy only Git-owned dependency inputs. Existing node_modules, ignored local
// SDK links and unstaged fixes cannot make a staged commit pass this check.
export function checkReleaseDependencies({ root, staged = false, workspace, pnpm = runPnpm, log = console.log }) {
  if (workspace && !releaseWorkspaces.includes(workspace)) throw new Error(`Unknown release workspace: ${workspace}`)
  const files = new Set(git(root, staged
    ? ['ls-files', '--cached', '-z']
    : ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean))
  const changed = staged
    ? git(root, ['diff', '--cached', '--name-only', '--no-renames', '-z']).toString().split('\0').filter(Boolean)
    : null
  const selected = releaseWorkspaces.filter((name) => (!workspace || workspace === name) &&
    (!staged || changed.some((file) =>
      (isMetadata(file) && (inWorkspace(file, name) || !file.includes('/'))) ||
      file === 'scripts/check-release-dependencies.mjs' || file.startsWith('.github/workflows/'))))
  if (!selected.length) return []
  if (git(root, ['ls-files', '-u']).length) throw new Error('Resolve Git conflicts before checking dependencies')

  const inputs = new Map()
  for (const file of files) {
    if (!isMetadata(file)) continue
    inputs.set(file, staged ? git(root, ['show', `:${file}`]) : readFileSync(path.join(root, file)))
  }
  const errors = []
  for (const [file, content] of inputs) {
    if (path.posix.basename(file) === 'package.json' && selected.some((name) => inWorkspace(file, name))) {
      errors.push(...localReferenceErrors(file, JSON.parse(content), files))
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))

  const snapshot = mkdtempSync(path.join(tmpdir(), 'xpert-release-dependencies-'))
  try {
    for (const [file, content] of inputs) {
      const target = path.join(snapshot, file)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
    for (const name of selected) {
      const manifest = JSON.parse(inputs.get(`${name}/package.json`) ?? '{}')
      const expected = manifest.packageManager?.match(/^pnpm@(\d+\.\d+\.\d+(?:-[^+]+)?)(?:\+.*)?$/)?.[1]
      if (!expected) throw new Error(`${name}/package.json must pin an exact pnpm packageManager version`)
      const cwd = path.join(snapshot, name)
      const actual = pnpm(['--version'], cwd).trim()
      if (actual !== expected) throw new Error(`${name} requires pnpm ${expected}, got ${actual}. Enable the Corepack pnpm shim or install the pinned version.`)
      try {
        pnpm(['install', '--lockfile-only', '--frozen-lockfile', '--ignore-scripts', '--offline'], cwd)
      } catch (error) {
        throw new Error(`${name}: frozen dependency validation failed.\n${error.message}\n` +
          `Run pnpm -C ${name} install --lockfile-only --no-frozen-lockfile --ignore-scripts, then stage the manifests and lockfile together.`)
      }
      if (!inputs.get(`${name}/pnpm-lock.yaml`)?.equals(readFileSync(path.join(cwd, 'pnpm-lock.yaml')))) {
        throw new Error(`${name}: frozen validation unexpectedly changed the lockfile`)
      }
      log(`${name}: ${staged ? 'staged' : 'working-tree'} dependencies pass pnpm ${actual} frozen validation`)
    }
    return selected
  } finally {
    rmSync(snapshot, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    const workspaceIndex = args.indexOf('--workspace')
    if (args.some((arg, index) => arg !== '--staged' && arg !== '--workspace' && !(workspaceIndex >= 0 && index === workspaceIndex + 1)) ||
        (workspaceIndex >= 0 && !args[workspaceIndex + 1])) throw new Error('Usage: node scripts/check-release-dependencies.mjs [--staged] [--workspace xpertai|community]')
    checkReleaseDependencies({
      root: git(process.cwd(), ['rev-parse', '--show-toplevel']).toString().trim(),
      staged: args.includes('--staged'), workspace: workspaceIndex >= 0 ? args[workspaceIndex + 1] : undefined
    })
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
