import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const hashes = JSON.parse(await readFile(new URL('../dist/ui/assets.json', import.meta.url), 'utf8'))
for (const [name, hash] of Object.entries(hashes)) {
 const bytes = await readFile(new URL('../dist/ui/' + name, import.meta.url))
 if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('Asset changed: ' + name)
}
for (const name of ['index.js', 'index.d.ts', 'assistant.yaml']) if (!(await stat(new URL('../dist/' + name, import.meta.url))).size) throw Error('Missing ' + name)
const js = await readFile(new URL('../dist/ui/app.js', import.meta.url), 'utf8')
if (/TYPESAFE_API_KEY|api\.typesafe\.ai|localStorage|sessionStorage/.test(js)) throw Error('Unexpected secret or storage access in UI bundle')
console.log('Dist entry, template, asset checksums and client boundary passed')
