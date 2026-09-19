import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const remote = join('lib', 'remote-components', 'meeting-action-workbench')

await mkdir(join(packageRoot, 'dist', remote), { recursive: true })
await cp(join(packageRoot, 'src', 'xpert-meeting-action-workbench-assistant.yaml'), join(packageRoot, 'dist', 'xpert-meeting-action-workbench-assistant.yaml'))
await cp(join(packageRoot, 'src', remote, 'app.js'), join(packageRoot, 'dist', remote, 'app.js'))
await cp(join(packageRoot, 'src', remote, 'app.css'), join(packageRoot, 'dist', remote, 'app.css'))
