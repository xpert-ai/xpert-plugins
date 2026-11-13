import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const files = [
  ['src/lib/remote-components/resume-match/app.js', 'dist/lib/remote-components/resume-match/app.js'],
  ['src/lib/remote-components/resume-match/app.css', 'dist/lib/remote-components/resume-match/app.css'],
  ['src/xpert-resume-match-assistant.yaml', 'dist/xpert-resume-match-assistant.yaml']
]
for (const [source, target] of files) {
  const from = resolve(root, source)
  const to = resolve(root, target)
  const content = await readFile(from)
  if (check) {
    const current = await readFile(to).catch(() => null)
    if (!current || !content.equals(current)) throw new Error(`Stale distribution asset: ${target}`)
  } else {
    await mkdir(dirname(to), { recursive: true })
    await writeFile(to, content)
  }
}
console.log(check ? '分发产物已校验' : '分发产物已复制')
