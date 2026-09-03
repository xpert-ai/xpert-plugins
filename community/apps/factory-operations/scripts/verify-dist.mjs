import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const required = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/factory-operations-assistant.yaml',
  'dist/factory-operations-manager.yaml',
  'dist/lib/factory-middlewares.js',
  'dist/lib/factory-middlewares.d.ts',
  'dist/lib/remote-components/factory-operations-center/app.js',
  'dist/lib/remote-components/factory-operations-center/app.css',
  'dist/lib/remote-components/factory-case-workspace/app.js',
  'dist/lib/remote-components/factory-case-workspace/app.css',
  'dist/lib/remote-components/factory-operations-dashboard/app.js',
  'dist/lib/remote-components/factory-operations-dashboard/app.css'
]
for (const file of required) {
  if (!existsSync(resolve(file))) throw new Error(`Missing build output: ${file}`)
}

const [
  sourceYaml,
  builtYaml,
  sourceManagerYaml,
  builtManagerYaml,
  packageJson,
  bundleJson,
  builtIndex,
  builtConstants,
  builtTools
] = await Promise.all([
  readFile(resolve('src/factory-operations-assistant.yaml'), 'utf8'),
  readFile(resolve('dist/factory-operations-assistant.yaml'), 'utf8'),
  readFile(resolve('src/factory-operations-manager.yaml'), 'utf8'),
  readFile(resolve('dist/factory-operations-manager.yaml'), 'utf8'),
  readFile(resolve('package.json'), 'utf8').then(JSON.parse),
  readFile(resolve('.xpertai-plugin/plugin.json'), 'utf8').then(JSON.parse),
  readFile(resolve('dist/index.js'), 'utf8'),
  readFile(resolve('dist/lib/constants.js'), 'utf8'),
  readFile(resolve('dist/lib/factory-middlewares.js'), 'utf8')
])

if (sourceYaml !== builtYaml) throw new Error('Built Assistant YAML is stale.')
if (sourceManagerYaml !== builtManagerYaml) throw new Error('Built Manager Assistant YAML is stale.')
const runtimeLevel = packageJson.xpert?.plugin?.level
const runtimeNamespace = packageJson.xpert?.plugin?.artifactNamespace
if (bundleJson.name !== packageJson.name || bundleJson.version !== packageJson.version) {
  throw new Error('Plugin package and bundle identity are inconsistent.')
}
if (runtimeLevel !== 'tenant' || bundleJson.level !== runtimeLevel) {
  throw new Error('Plugin level metadata is inconsistent.')
}
if (
  runtimeNamespace !== 'factory_ops' ||
  bundleJson.artifactNamespace !== runtimeNamespace ||
  !`${builtIndex}\n${builtConstants}`.includes('factory_ops')
) {
  throw new Error('Artifact namespace metadata is inconsistent.')
}

if (
  packageJson.peerDependencies?.['@xpert-ai/contracts'] !== '^3.17.5' ||
  packageJson.peerDependencies?.['@xpert-ai/plugin-sdk'] !== '^3.17.5' ||
  packageJson.devDependencies?.['@xpert-ai/contracts'] !== '3.17.5' ||
  packageJson.devDependencies?.['@xpert-ai/plugin-sdk'] !== '3.17.5'
) {
  throw new Error('Host-native MCP SDK dependency versions are inconsistent.')
}

const xpertTarget = bundleJson.targetAppMeta?.xpert
const mcpContributions = xpertTarget?.marketplace?.contents?.filter((item) => item.type === 'mcp') ?? []
const mcpProviders = new Map(mcpContributions.map((item) => [item.name, item.metadata?.provider]))
if (
  bundleJson.toolsets !== undefined ||
  !xpertTarget?.types?.includes('mcp') ||
  !xpertTarget?.capabilities?.includes('factory-operations-mcp') ||
  !xpertTarget?.capabilities?.includes('factory-operations-insights-mcp') ||
  mcpContributions.length !== 2 ||
  mcpContributions.some((item) => item.metadata?.protocol !== 'native') ||
  mcpProviders.get('factory-operations') !== 'factory_ops' ||
  mcpProviders.get('factory-operations-insights') !== 'factory_ops_insights'
) {
  throw new Error('Factory Operations MCP manifest metadata is inconsistent.')
}
if (
  !builtConstants.includes("FACTORY_TOOLSET_PROVIDER_KEY = 'factory_ops'") ||
  !builtConstants.includes("FACTORY_INSIGHTS_TOOLSET_PROVIDER_KEY = 'factory_ops_insights'") ||
  !builtConstants.includes("FACTORY_MCP_CAPABILITY = 'factory-operations-mcp'") ||
  !builtConstants.includes("FACTORY_INSIGHTS_MCP_CAPABILITY = 'factory-operations-insights-mcp'") ||
  !builtConstants.includes("casesSearch: 'factory_cases_search'") ||
  !builtIndex.includes("type: 'mcp'") ||
  !builtTools.includes('XpertToolProvider') ||
  !builtTools.includes('factory-operations-mcp') ||
  !builtTools.includes('factory-operations-insights-mcp') ||
  !builtTools.includes('FactoryOperationsInsightsTools') ||
  !builtTools.includes('FactoryOperationsTools')
) {
  throw new Error('Factory Operations native MCP runtime build is stale.')
}

const expectedScreenshots = ['./assets/screenshot-01.jpg']
const appContribution = bundleJson.targetAppMeta?.['data-xpert']?.marketplace?.contents?.find(
  (item) => item.type === 'app' && item.name === 'factory-operations'
)
for (const [label, screenshots] of [
  ['interface', bundleJson.interface?.screenshots],
  ['assets', bundleJson.assets?.screenshots],
  ['appConfig', appContribution?.appConfig?.presentation?.screenshots]
]) {
  if (JSON.stringify(screenshots) !== JSON.stringify(expectedScreenshots)) {
    throw new Error(`Plugin ${label} screenshots are inconsistent.`)
  }
}
if (!existsSync(resolve(expectedScreenshots[0])) || !builtIndex.includes(expectedScreenshots[0])) {
  throw new Error('Application screenshot is missing or stale in the runtime build.')
}
