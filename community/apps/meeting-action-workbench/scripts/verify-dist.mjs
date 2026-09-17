import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const remote = join('lib', 'remote-components', 'meeting-action-workbench')
const pairs = [
  ['src/xpert-meeting-action-workbench-assistant.yaml', 'dist/xpert-meeting-action-workbench-assistant.yaml'],
  [join('src', remote, 'app.js'), join('dist', remote, 'app.js')],
  [join('src', remote, 'app.css'), join('dist', remote, 'app.css')]
]

const generated = spawnSync(process.execPath, [join(packageRoot, 'scripts', 'build-remote-components.mjs'), '--check'], {
  cwd: packageRoot,
  stdio: 'inherit'
})
if (generated.status !== 0) process.exit(generated.status ?? 1)

for (const [source, output] of pairs) {
  const [left, right] = await Promise.all([readFile(join(packageRoot, source)), readFile(join(packageRoot, output))])
  const normalizeText = (content) => content.toString('utf8').replace(/\r\n/g, '\n')
  if (normalizeText(left) !== normalizeText(right)) throw new Error('Stale dist asset: ' + output)
}
