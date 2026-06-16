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
  'dist/lib/drawio.plugin.js',
  'dist/lib/drawio.service.js',
  'dist/lib/drawio.middleware.js',
  'dist/lib/drawio-view.provider.js',
  'dist/lib/remote-components/drawio-workbench/app.js',
  'dist/xpert-drawio-assistant.yaml',
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
