import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(scriptDir, '..')
const sourceComponent = join(packageRoot, 'src', 'lib', 'remote-components', 'review-workbench')
const targetComponent = join(packageRoot, 'dist', 'lib', 'remote-components', 'review-workbench')

mkdirSync(targetComponent, { recursive: true })
for (const name of ['app.js', 'app.css']) {
  copyFileSync(join(sourceComponent, name), join(targetComponent, name))
}
copyFileSync(
  join(packageRoot, 'src', 'xpert-img2threejs-assistant.yaml'),
  join(packageRoot, 'dist', 'xpert-img2threejs-assistant.yaml')
)
