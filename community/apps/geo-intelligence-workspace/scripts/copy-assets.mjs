import { cp, mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })
await cp(join(packageRoot, 'src', 'lib', 'remote-components'), join(packageRoot, 'dist', 'lib', 'remote-components'), { recursive: true })
const source = join(packageRoot, 'src/lib/remote-components/geo-intelligence')
const modules = await Promise.all(['bridge.js', 'dashboard.js', 'run-card.js', 'app.js'].map(name => readFile(join(source, name), 'utf8')))
// The standalone development host needs an explicit origin as well.
const bundle = `window.__GEO_PARENT_ORIGINS = window.__GEO_PARENT_ORIGINS || ['http://127.0.0.1:4417'];\n${modules.join('\n')}`
await writeFile(join(packageRoot, 'dist/lib/remote-components/geo-intelligence/app.js'), bundle)
