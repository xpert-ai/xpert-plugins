import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distRoot = join(packageRoot, 'dist')
const remoteNames = [
  'factory-operations-center',
  'factory-case-workspace',
  'factory-operations-dashboard',
  'factory-assistant-profile'
]

await Promise.all(remoteNames.map((remoteName) =>
  mkdir(join(distRoot, 'lib', 'remote-components', remoteName), { recursive: true })
))
await Promise.all([
  copyFile(
    join(packageRoot, 'src', 'factory-operations-assistant.yaml'),
    join(distRoot, 'factory-operations-assistant.yaml')
  ),
  copyFile(
    join(packageRoot, 'src', 'factory-operations-manager.yaml'),
    join(distRoot, 'factory-operations-manager.yaml')
  ),
  ...remoteNames.flatMap((remoteName) => {
    const sourceRemote = join(packageRoot, 'src', 'lib', 'remote-components', remoteName)
    const distRemote = join(distRoot, 'lib', 'remote-components', remoteName)
    return [
      copyFile(join(sourceRemote, 'app.js'), join(distRemote, 'app.js')),
      copyFile(join(sourceRemote, 'app.css'), join(distRemote, 'app.css'))
    ]
  })
])
