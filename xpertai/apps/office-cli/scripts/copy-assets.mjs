import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })
await cp(
  join(packageRoot, 'src', 'xpert-office-cli-assistant.yaml'),
  join(packageRoot, 'dist', 'xpert-office-cli-assistant.yaml')
)
await cp(
  join(packageRoot, 'src', 'lib', 'remote-components'),
  join(packageRoot, 'dist', 'lib', 'remote-components'),
  { recursive: true }
)
