import { cp, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })
await cp(
  join(packageRoot, 'src', 'xpert-customer-complaint-assistant.yaml'),
  join(packageRoot, 'dist', 'xpert-customer-complaint-assistant.yaml')
)
await cp(join(packageRoot, 'src', 'lib', 'remote-components'), join(packageRoot, 'dist', 'lib', 'remote-components'), {
  recursive: true
})
