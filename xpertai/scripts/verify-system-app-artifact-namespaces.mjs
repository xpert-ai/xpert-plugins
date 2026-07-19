import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const workspaceRoot = new URL('../', import.meta.url)
const appsRoot = new URL('./apps/', workspaceRoot)
const namespacePattern = /^[a-z][a-z0-9_]*$/
const failures = []
let systemAppCount = 0

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
  const runtimeDeclaration = indexSource.match(/\bartifactNamespace:\s*([A-Z][A-Z0-9_]*|['"][^'"]+['"])/)?.[1]
  let runtimeNamespace

  if (runtimeDeclaration?.startsWith("'") || runtimeDeclaration?.startsWith('"')) {
    runtimeNamespace = runtimeDeclaration.slice(1, -1)
  } else if (runtimeDeclaration) {
    const constantsPath = join(appDir, 'src/lib/constants.ts')
    const constantsSource = existsSync(constantsPath) ? readFileSync(constantsPath, 'utf8') : ''
    runtimeNamespace = constantsSource.match(
      new RegExp(`export\\s+const\\s+${escapeRegExp(runtimeDeclaration)}\\s*=\\s*['"]([^'"]+)['"]`)
    )?.[1]
  }

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
