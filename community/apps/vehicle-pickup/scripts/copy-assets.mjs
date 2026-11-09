import { cp, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(__dirname, '..')
const componentName = 'vehicle-pickup-workbench'

await mkdir(join(packageRoot, 'dist', 'lib', 'remote-components', componentName), { recursive: true })
await cp(join(packageRoot, 'src', 'xpert-vehicle-pickup-assistant.yaml'), join(packageRoot, 'dist', 'xpert-vehicle-pickup-assistant.yaml'))
await cp(
  join(packageRoot, 'src', 'lib', 'remote-components', componentName, 'app.js'),
  join(packageRoot, 'dist', 'lib', 'remote-components', componentName, 'app.js')
)
await cp(
  join(packageRoot, 'src', 'lib', 'remote-components', componentName, 'app.css'),
  join(packageRoot, 'dist', 'lib', 'remote-components', componentName, 'app.css')
)
