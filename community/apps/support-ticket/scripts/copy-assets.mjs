import { cp, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')
const componentName = 'support-ticket'

await mkdir(join(packageRoot, 'dist', 'lib', 'remote-components', componentName), { recursive: true })
await cp(
  join(packageRoot, 'src', 'xpert-support-ticket-assistant.yaml'),
  join(packageRoot, 'dist', 'xpert-support-ticket-assistant.yaml')
)
await cp(
  join(packageRoot, 'src', 'lib', 'remote-components', componentName, 'app.js'),
  join(packageRoot, 'dist', 'lib', 'remote-components', componentName, 'app.js')
)
