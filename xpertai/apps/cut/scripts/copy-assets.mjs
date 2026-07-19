import { cp, copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')
await mkdir(join(dist, 'lib', 'remote-components', 'cut-workbench'), { recursive: true })
await copyFile(join(root, 'src', 'xpert-cut-assistant.yaml'), join(dist, 'xpert-cut-assistant.yaml'))
await copyFile(join(root, 'src', 'lib', 'remote-components', 'cut-workbench', 'app.js'), join(dist, 'lib', 'remote-components', 'cut-workbench', 'app.js'))
await copyFile(join(root, 'src', 'lib', 'remote-components', 'cut-workbench', 'app.css'), join(dist, 'lib', 'remote-components', 'cut-workbench', 'app.css'))
await rm(join(dist, 'assets', 'upstream'), { recursive: true, force: true })
await mkdir(join(dist, 'assets'), { recursive: true })
await cp(join(root, 'assets', 'upstream'), join(dist, 'assets', 'upstream'), { recursive: true })
