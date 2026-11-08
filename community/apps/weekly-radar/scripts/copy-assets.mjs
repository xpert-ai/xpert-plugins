import { cp, mkdir } from 'fs/promises'
import { join } from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')

await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })
await mkdir(join(packageRoot, 'dist', 'lib', 'remote-components', 'weekly-radar-workbench'), { recursive: true })
await cp(
  join(packageRoot, 'src', 'xpert-weekly-radar-assistant.yaml'),
  join(packageRoot, 'dist', 'xpert-weekly-radar-assistant.yaml')
)
await cp(
  join(packageRoot, 'src', 'lib', 'remote-components', 'weekly-radar-workbench', 'app.js'),
  join(packageRoot, 'dist', 'lib', 'remote-components', 'weekly-radar-workbench', 'app.js')
)
await cp(
  join(packageRoot, 'src', 'lib', 'remote-components', 'weekly-radar-workbench', 'app.css'),
  join(packageRoot, 'dist', 'lib', 'remote-components', 'weekly-radar-workbench', 'app.css')
)
