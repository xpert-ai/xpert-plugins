import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distRoot = join(packageRoot, 'dist')

await mkdir(distRoot, { recursive: true })
await copyFile(join(packageRoot, 'src', 'xpert-canvas-assistant.yaml'), join(distRoot, 'xpert-canvas-assistant.yaml'))

const componentName = 'canvas-workbench'
const sourceComponentDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName)
const distComponentDir = join(distRoot, 'lib', 'remote-components', componentName)
await mkdir(distComponentDir, { recursive: true })
await copyFile(join(sourceComponentDir, 'app.js'), join(distComponentDir, 'app.js'))
await copyFile(join(sourceComponentDir, 'app.css'), join(distComponentDir, 'app.css'))
