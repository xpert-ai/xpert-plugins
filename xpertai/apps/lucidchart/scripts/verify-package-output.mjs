import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packageJsonPath = join(packageRoot, 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

const requiredFiles = new Set([
  packageJson.main,
  packageJson.module,
  packageJson.types,
  packageJson.exports?.['.']?.import,
  packageJson.exports?.['.']?.default,
  packageJson.exports?.['.']?.types,
  '.xpertai-plugin/plugin.json',
  'assets/logo.svg',
  'dist/lib/lucidchart.plugin.js',
  'dist/lib/lucidchart.service.js',
  'dist/lib/lucidchart.middleware.js',
  'dist/lib/lucidchart-view.provider.js',
  'dist/lib/remote-components/lucidchart-workbench/app.js',
  'dist/xpert-lucidchart-assistant.yaml',
  'skills/index/SKILL.md'
])

const missingFiles = [...requiredFiles]
  .filter((file) => typeof file === 'string' && file.trim().length > 0)
  .map((file) => file.replace(/^\.\//, ''))
  .filter((file) => !existsSync(join(packageRoot, file)))

if (missingFiles.length) {
  console.error(`Missing files required for publishing ${packageJson.name}@${packageJson.version}:`)
  for (const file of missingFiles) {
    console.error(`- ${normalize(file)}`)
  }
  process.exit(1)
}
