import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')

await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })
await cp(join(packageRoot, 'src', 'xpert-lucidchart-assistant.yaml'), join(packageRoot, 'dist', 'xpert-lucidchart-assistant.yaml'))
await cp(join(packageRoot, 'src', 'lib', 'remote-components'), join(packageRoot, 'dist', 'lib', 'remote-components'), {
  recursive: true
})
await cp(join(packageRoot, 'docs'), join(packageRoot, 'dist', 'docs'), { recursive: true })
