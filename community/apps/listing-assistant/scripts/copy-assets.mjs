import { cp, mkdir } from 'fs/promises'
import { join } from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')
const componentName = 'listing_assistant__remote'

await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })
await mkdir(join(packageRoot, 'dist', 'lib', 'remote-components', componentName), { recursive: true })
await cp(
  join(packageRoot, 'src', 'xpert-listing-assistant-assistant.yaml'),
  join(packageRoot, 'dist', 'xpert-listing-assistant-assistant.yaml')
)
await cp(join(packageRoot, 'src', 'lib', 'remote-components'), join(packageRoot, 'dist', 'lib', 'remote-components'), {
  recursive: true
})
