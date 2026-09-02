import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const required = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/factory-operations-assistant.yaml',
  'dist/factory-operations-manager.yaml',
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

const [sourceYaml, builtYaml, sourceManagerYaml, builtManagerYaml, packageJson, bundleJson, builtIndex, builtConstants] =
  await Promise.all([
    readFile(resolve('src/factory-operations-assistant.yaml'), 'utf8'),
    readFile(resolve('dist/factory-operations-assistant.yaml'), 'utf8'),
    readFile(resolve('src/factory-operations-manager.yaml'), 'utf8'),
    readFile(resolve('dist/factory-operations-manager.yaml'), 'utf8'),
    readFile(resolve('package.json'), 'utf8').then(JSON.parse),
    readFile(resolve('.xpertai-plugin/plugin.json'), 'utf8').then(JSON.parse),
    readFile(resolve('dist/index.js'), 'utf8'),
    readFile(resolve('dist/lib/constants.js'), 'utf8')
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
