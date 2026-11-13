import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(join(packageRoot, 'dist', 'lib', 'remote'), { recursive: true })
await cp(join(packageRoot, 'src', 'lib', 'remote', 'travel-workbench.js'), join(packageRoot, 'dist', 'lib', 'remote', 'travel-workbench.js'))
await cp(join(packageRoot, 'src', 'lib', 'remote', 'travel-workbench.css'), join(packageRoot, 'dist', 'lib', 'remote', 'travel-workbench.css'))
await cp(join(packageRoot, 'src', 'travel-planner-assistant.yaml'), join(packageRoot, 'dist', 'travel-planner-assistant.yaml'))
