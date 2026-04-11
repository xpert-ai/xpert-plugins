import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageRoot = path.resolve(__dirname, '..')
const sourceDir = path.join(packageRoot, 'src', '_assets')
const targetDir = path.join(packageRoot, 'dist', '_assets')

// Copy src/_assets
if (existsSync(sourceDir)) {
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(path.dirname(targetDir), { recursive: true })
  cpSync(sourceDir, targetDir, { recursive: true })
} else {
  // console.info('No assets to copy from src/_assets – skipping.')
}

// Copy all yaml files under src to dist
const srcRoot = path.join(packageRoot, 'src')
const distRoot = path.join(packageRoot, 'dist')

function removeYamlFiles(dir) {
  if (!existsSync(dir)) {
    return
  }

  const entries = readdirSync(dir)
  for (const entry of entries) {
    const entryPath = path.join(dir, entry)
    const stats = statSync(entryPath)

    if (stats.isDirectory()) {
      removeYamlFiles(entryPath)
      if (readdirSync(entryPath).length === 0) {
        rmSync(entryPath, { recursive: true, force: true })
      }
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      rmSync(entryPath, { force: true })
    }
  }
}

function copyYamlFiles(srcDir, destDir) {
  const entries = readdirSync(srcDir)
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry)
    const destPath = path.join(destDir, entry)
    const stats = statSync(srcPath)

    if (stats.isDirectory()) {
      copyYamlFiles(srcPath, destPath)
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      mkdirSync(path.dirname(destPath), { recursive: true })
      cpSync(srcPath, destPath)
      // console.info(`Copied ${srcPath.replace(packageRoot + '/', '')} → ${destPath.replace(packageRoot + '/', '')}`)
    }
  }
}

if (existsSync(srcRoot)) {
  removeYamlFiles(distRoot)
  copyYamlFiles(srcRoot, distRoot)
  // console.info('Copied all .yaml files from src to dist.')
} else {
  // console.info('No src directory found – skipping YAML copy.')
}
