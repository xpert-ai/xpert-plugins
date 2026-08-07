import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '..')
const sourceDir = path.join(packageRoot, 'src', '_assets')
const targetDir = path.join(packageRoot, 'dist', '_assets')

if (existsSync(sourceDir)) {
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(path.dirname(targetDir), { recursive: true })
  cpSync(sourceDir, targetDir, { recursive: true })
}

function copyYamlFiles(srcDir, destDir) {
  for (const entry of readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, entry)
    const destPath = path.join(destDir, entry)
    if (statSync(srcPath).isDirectory()) {
      copyYamlFiles(srcPath, destPath)
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      mkdirSync(path.dirname(destPath), { recursive: true })
      cpSync(srcPath, destPath)
    }
  }
}

const srcRoot = path.join(packageRoot, 'src')
if (existsSync(srcRoot)) {
  copyYamlFiles(srcRoot, path.join(packageRoot, 'dist'))
}
