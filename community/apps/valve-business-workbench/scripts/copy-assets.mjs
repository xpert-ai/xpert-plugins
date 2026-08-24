import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(scriptDir, '..')
const sourceRoot = join(packageRoot, 'src')
const distRoot = join(packageRoot, 'dist')

await mkdir(join(distRoot, 'lib', 'remote-components', 'valve-business-workbench'), { recursive: true })
await Promise.all([
  cp(
    join(sourceRoot, 'xpert-valve-business-workbench-assistant.yaml'),
    join(distRoot, 'xpert-valve-business-workbench-assistant.yaml')
  ),
  cp(
    join(sourceRoot, 'lib', 'remote-components', 'valve-business-workbench', 'app.js'),
    join(distRoot, 'lib', 'remote-components', 'valve-business-workbench', 'app.js')
  ),
  cp(
    join(sourceRoot, 'lib', 'remote-components', 'valve-business-workbench', 'app.css'),
    join(distRoot, 'lib', 'remote-components', 'valve-business-workbench', 'app.css')
  )
])
