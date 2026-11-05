import { spawnSync } from 'node:child_process'
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
const p = spawnSync(python, ['scripts/generate-fixtures.py', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit'
})
process.exit(p.status ?? 1)
