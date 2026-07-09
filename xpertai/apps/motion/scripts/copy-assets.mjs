import { existsSync } from 'node:fs'
import { cp, copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distRoot = join(packageRoot, 'dist')

await mkdir(distRoot, { recursive: true })
await copyFile(join(packageRoot, 'src', 'xpert-motion-assistant.yaml'), join(distRoot, 'xpert-motion-assistant.yaml'))

const componentName = 'motion-workbench'
const sourceComponentDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName)
const distComponentDir = join(distRoot, 'lib', 'remote-components', componentName)
await mkdir(distComponentDir, { recursive: true })
await copyFile(join(sourceComponentDir, 'app.js'), join(distComponentDir, 'app.js'))
await copyFile(join(sourceComponentDir, 'app.css'), join(distComponentDir, 'app.css'))

const distAssetsDir = join(distRoot, 'assets')
await mkdir(distAssetsDir, { recursive: true })
if (existsSync(join(distAssetsDir, 'upstream'))) {
  await rm(join(distAssetsDir, 'upstream'), { recursive: true, force: true })
}
await cp(join(packageRoot, 'assets', 'upstream'), join(distAssetsDir, 'upstream'), { recursive: true })
