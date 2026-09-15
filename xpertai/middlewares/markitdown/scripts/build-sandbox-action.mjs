import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'dist/sandbox-actions/convert')
await mkdir(path.join(output, 'bundle'), { recursive: true })
const hash = createHash('sha256')
for (const name of ['convert.py', 'runner.mjs']) {
  const data = await readFile(path.join(root, 'sandbox-actions/convert', name))
  await writeFile(path.join(output, 'bundle', name), data)
  hash.update(`${name}\0${data.length}\0${createHash('sha256').update(data).digest('hex')}\n`)
}
await writeFile(
  path.join(output, 'action.json'),
  `${JSON.stringify(
    {
      name: 'markitdown.convert',
      version: '1.1.0',
      runtimeProfile: 'document/python-3.12/v1',
      runtimeContractVersion: '1',
      bundle: './bundle',
      entrypoint: 'runner.mjs',
      bundleSha256: hash.digest('hex')
    },
    null,
    2
  )}\n`
)
