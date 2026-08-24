import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDirectory, '..')
const sourceAssets = path.join(packageRoot, 'src', '_assets')
const targetAssets = path.join(packageRoot, 'dist', '_assets')

if (existsSync(sourceAssets)) {
  rmSync(targetAssets, { recursive: true, force: true })
  mkdirSync(path.dirname(targetAssets), { recursive: true })
  cpSync(sourceAssets, targetAssets, { recursive: true })
}

function copyYamlFiles(sourceDirectory, targetDirectory) {
  for (const entry of readdirSync(sourceDirectory)) {
    const sourcePath = path.join(sourceDirectory, entry)
    const targetPath = path.join(targetDirectory, entry)
    if (statSync(sourcePath).isDirectory()) {
      copyYamlFiles(sourcePath, targetPath)
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      mkdirSync(path.dirname(targetPath), { recursive: true })
      cpSync(sourcePath, targetPath)
    }
  }
}

const sourceRoot = path.join(packageRoot, 'src')
if (existsSync(sourceRoot)) copyYamlFiles(sourceRoot, path.join(packageRoot, 'dist'))
