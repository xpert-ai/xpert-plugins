import { cp, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')

await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })

const yamlPath = join(packageRoot, 'src', 'xpert-invoice-reimbursement-assistant.yaml')
if (existsSync(yamlPath)) {
  await cp(yamlPath, join(packageRoot, 'dist', 'xpert-invoice-reimbursement-assistant.yaml'))
}

const remoteCompPath = join(packageRoot, 'src', 'lib', 'remote-components')
if (existsSync(remoteCompPath)) {
  await cp(remoteCompPath, join(packageRoot, 'dist', 'lib', 'remote-components'), { recursive: true })
}
