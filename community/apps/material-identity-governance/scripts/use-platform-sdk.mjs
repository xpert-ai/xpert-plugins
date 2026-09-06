import { lstat, readFile, symlink, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const flag = process.argv.indexOf('--platform-root')
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Usage: node scripts/use-platform-sdk.mjs --platform-root /path/to/xpert-pro')
const target = resolve(process.argv[flag + 1], 'packages/plugin-sdk/dist')
const metadata = JSON.parse(await readFile(resolve(target, 'package.json'), 'utf8'))
if (metadata.name !== '@xpert-ai/plugin-sdk') throw new Error('The target is not the public platform SDK build')
const entry = metadata.exports?.['.']?.import ?? metadata.main
if (typeof entry !== 'string') throw new Error('The SDK has no public import entry')
const sdk = await import(pathToFileURL(resolve(target, entry)).href)
if (!sdk.ProjectAccessRuntimeCapability || !sdk.XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN) throw new Error('Build the host SDK with ProjectAccess and scoped Assistant runtime support first')
const link = resolve(import.meta.dirname, '../node_modules/@xpert-ai/plugin-sdk')
const current = await lstat(link).catch(() => null)
if (current && !current.isSymbolicLink()) throw new Error('Refusing to replace a real SDK directory; install dependencies using pnpm first')
if (current) await unlink(link)
await symlink(target, link, 'dir')
console.log(`Using the current host public SDK ${metadata.version}; no private server imports are required.`)
