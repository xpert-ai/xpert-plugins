import { cp, mkdir } from 'fs/promises'
import { join } from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')

await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })
await mkdir(join(packageRoot, 'dist', 'skills'), { recursive: true })
await mkdir(join(packageRoot, 'dist', 'lib', 'remote-components', 'crm-workbench'), { recursive: true })
await cp(join(packageRoot, 'src', 'xpert-crm-assistant.yaml'), join(packageRoot, 'dist', 'xpert-crm-assistant.yaml'))
await cp(join(packageRoot, 'src', 'skills'), join(packageRoot, 'dist', 'skills'), { recursive: true })
await cp(
  join(packageRoot, 'src', 'lib', 'remote-components', 'crm-workbench', 'app.js'),
  join(packageRoot, 'dist', 'lib', 'remote-components', 'crm-workbench', 'app.js')
)
await cp(
  join(packageRoot, 'src', 'lib', 'remote-components', 'crm-workbench', 'app.css'),
  join(packageRoot, 'dist', 'lib', 'remote-components', 'crm-workbench', 'app.css')
)
