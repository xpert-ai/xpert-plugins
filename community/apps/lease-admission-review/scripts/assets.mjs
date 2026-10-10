import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { assistantDraft } = require('../dist/lib/templates.js')
const content = JSON.stringify(assistantDraft, null, 2) + '\n'
await mkdir(new URL('../dist/', import.meta.url), { recursive: true })
const target = new URL('../dist/assistant.yaml', import.meta.url)
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== content)
    throw new Error('Stale assistant.yaml')
} else await writeFile(target, content)
