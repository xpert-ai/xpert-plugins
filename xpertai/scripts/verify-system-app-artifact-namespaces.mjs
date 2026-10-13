import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectPluginMetadata } from '../../scripts/check-plugin-metadata.mjs'

const workspaceRoot = new URL('../', import.meta.url)
const appsRoot = new URL('./apps/', workspaceRoot)
const namespacePattern = /^[a-z][a-z0-9_]*$/
const failures = []
let systemAppCount = 0
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const files = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: repositoryRoot, encoding: 'utf8'
}).split('\0').filter(Boolean))

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

for (const appName of readdirSync(appsRoot).sort()) {
  const appDir = join(appsRoot.pathname, appName)
  const packagePath = join(appDir, 'package.json')
  if (!statSync(appDir).isDirectory() || !existsSync(packagePath)) {
    continue
  }

  const packageJson = readJson(packagePath)
  const indexPath = join(appDir, 'src/index.ts')
  const indexSource = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : ''
  const isSystemPlugin =
    packageJson.xpert?.plugin?.level === 'system' || /\blevel:\s*['"]system['"]/.test(indexSource)

  if (!isSystemPlugin) {
    continue
  }

  systemAppCount += 1
  const packageNamespace = packageJson.xpert?.plugin?.artifactNamespace
  const legacyTopLevelNamespace = packageJson.artifactNamespace
  let runtimeNamespace
  try {
    runtimeNamespace = inspectPluginMetadata({
      packageFile: relative(repositoryRoot, packagePath), files,
      read: (file) => readFileSync(join(repositoryRoot, file), 'utf8')
    }).fields.artifactNamespace?.value
  } catch (error) { failures.push(error.message) }

  const manifestPath = join(appDir, '.xpertai-plugin/plugin.json')
  const values = { runtimeNamespace }
  if (existsSync(manifestPath)) {
    values.manifestNamespace = readJson(manifestPath).artifactNamespace
  }

  if (!namespacePattern.test(packageNamespace ?? '')) {
    failures.push(`${appName}: package.json xpert.plugin.artifactNamespace is missing or invalid`)
  }
  if (legacyTopLevelNamespace !== undefined) {
    failures.push(`${appName}: remove legacy top-level package.json artifactNamespace`)
  }

  for (const [location, value] of Object.entries(values)) {
    if (value !== packageNamespace) {
      failures.push(`${appName}: ${location} (${String(value)}) does not match ${String(packageNamespace)}`)
    }
  }

  console.log(`${appName}: ${packageNamespace ?? 'MISSING'}`)
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`ERROR ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log(`Verified artifactNamespace metadata for ${systemAppCount} system app plugins.`)
}
