import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceRemote = join(root, 'src', 'lib', 'remote-components', 'presentation-studio-workbench')
const targetRemote = join(root, 'dist', 'lib', 'remote-components', 'presentation-studio-workbench')
await mkdir(targetRemote, { recursive: true })
await Promise.all([
  cp(join(sourceRemote, 'app.js'), join(targetRemote, 'app.js')),
  cp(join(sourceRemote, 'app.css'), join(targetRemote, 'app.css')),
  cp(join(root, 'src', 'xpert-presentation-studio-assistant.yaml'), join(root, 'dist', 'xpert-presentation-studio-assistant.yaml'))
])
