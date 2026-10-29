import { cp, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(__dirname, '..')

await mkdir(join(packageRoot, 'dist', 'lib', 'remote'), { recursive: true })
await cp(join(packageRoot, 'src', 'registration-analytics-assistant.yaml'), join(packageRoot, 'dist', 'registration-analytics-assistant.yaml'))
await cp(join(packageRoot, 'src', 'lib', 'remote', 'registration-console.html'), join(packageRoot, 'dist', 'lib', 'remote', 'registration-console.html'))
console.log('Assets copied to dist.')
