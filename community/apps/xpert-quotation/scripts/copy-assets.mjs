import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(join(root, 'dist', 'lib'), { recursive: true })
await cp(join(root, 'src', 'xpert-quotation-assistant.yaml'), join(root, 'dist', 'xpert-quotation-assistant.yaml'))
await cp(join(root, 'src', 'lib', 'remote-components'), join(root, 'dist', 'lib', 'remote-components'), { recursive: true })
