import { cp, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
await mkdir(new URL('dist', root), { recursive: true })
await copyFile(
  new URL('src/funds-query-assistant.yaml', root),
  new URL('dist/funds-query-assistant.yaml', root)
)
console.log('Assistant template copied to dist.')
