import { cp, copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distRoot = join(packageRoot, 'dist')

await mkdir(distRoot, { recursive: true })
await copyFile(join(packageRoot, 'src', 'xpert-pencil-assistant.yaml'), join(distRoot, 'xpert-pencil-assistant.yaml'))

const componentName = 'pencil-workbench'
const sourceComponentDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName)
const distComponentDir = join(distRoot, 'lib', 'remote-components', componentName)
await rm(distComponentDir, { recursive: true, force: true })
await mkdir(distComponentDir, { recursive: true })
await copyFile(join(sourceComponentDir, 'app.js'), join(distComponentDir, 'app.js'))
await copyFile(join(sourceComponentDir, 'app.css'), join(distComponentDir, 'app.css'))
await cp(join(sourceComponentDir, 'assets'), join(distComponentDir, 'assets'), { recursive: true, force: true }).catch((error) => {
  if (error?.code !== 'ENOENT') {
    throw error
  }
})

await Promise.all([
  rm(join(distRoot, 'tsconfig.lib.tsbuildinfo'), { force: true }),
  rm(join(distRoot, 'tsconfig.spec.tsbuildinfo'), { force: true })
])
