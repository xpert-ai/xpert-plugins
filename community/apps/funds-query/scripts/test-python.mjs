import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const python =
  process.env.FUNDS_QUERY_PYTHON ||
  fileURLToPath(
    new URL(
      process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python',
      import.meta.url
    )
  )
if (!existsSync(python)) {
  console.error('Prepare Python first: node scripts/prepare-runtime.mjs')
  process.exit(1)
}
const run = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'python/tests', '-v'], {
  cwd: root,
  env: { ...process.env, PYTHONPATH: fileURLToPath(new URL('../python', import.meta.url)) },
  stdio: 'inherit'
})
process.exit(run.status ?? 1)
