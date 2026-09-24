import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const component = 'complaint-workbench'
const source = join(packageRoot, 'src', 'lib', 'remote-components', component)
const target = join(packageRoot, 'dist', 'lib', 'remote-components', component)

await mkdir(target, { recursive: true })
await Promise.all(
  ['app.js', 'app.css'].map((file) => copyFile(join(source, file), join(target, file)))
)
await copyFile(
  join(packageRoot, 'src', 'complaint-triage-assistant.yaml'),
  join(packageRoot, 'dist', 'complaint-triage-assistant.yaml')
)
