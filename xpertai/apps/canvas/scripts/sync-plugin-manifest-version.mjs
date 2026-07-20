import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packageJsonPath = join(packageRoot, 'package.json')
const pluginManifestPath = join(packageRoot, '.xpertai-plugin/plugin.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const pluginManifest = JSON.parse(readFileSync(pluginManifestPath, 'utf8'))

if (!packageJson.name || !packageJson.version) {
  throw new Error('Canvas package name and version are required.')
}
if (pluginManifest.name !== packageJson.name) {
  throw new Error('Canvas package and plugin manifest names must match.')
}

if (pluginManifest.version !== packageJson.version) {
  pluginManifest.version = packageJson.version
  writeFileSync(pluginManifestPath, `${JSON.stringify(pluginManifest, null, 2)}\n`)
  console.log(`Synchronized Canvas plugin manifest version to ${packageJson.version}.`)
}
