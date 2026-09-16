import { cp, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')

await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })
await cp(
  join(packageRoot, 'src', 'xpert-conversation-review-assistant.yaml'),
  join(packageRoot, 'dist', 'xpert-conversation-review-assistant.yaml')
)
await cp(
  join(packageRoot, 'src', 'lib', 'remote-components'),
  join(packageRoot, 'dist', 'lib', 'remote-components'),
  { recursive: true }
)
await cp(join(packageRoot, 'examples'), join(packageRoot, 'dist', 'examples'), { recursive: true })
