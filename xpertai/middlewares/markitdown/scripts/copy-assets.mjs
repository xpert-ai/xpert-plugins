import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(packageRoot, 'src')
const distRoot = path.join(packageRoot, 'dist')
const ASSET_EXTENSIONS = new Set(['.md', '.png'])

function copyAssetFiles(srcDir, destDir) {
  const entries = readdirSync(srcDir)

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry)
    const destPath = path.join(destDir, entry)
    const stats = statSync(srcPath)

    if (stats.isDirectory()) {
      copyAssetFiles(srcPath, destPath)
      continue
    }

    if (!ASSET_EXTENSIONS.has(path.extname(entry))) {
      continue
    }

    mkdirSync(path.dirname(destPath), { recursive: true })
    cpSync(srcPath, destPath)
  }
}

if (existsSync(srcRoot) && existsSync(distRoot)) {
  copyAssetFiles(srcRoot, distRoot)
}
