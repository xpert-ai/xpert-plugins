import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const python = process.env.FUNDS_QUERY_PYTHON || fileURLToPath(new URL(
  process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python', import.meta.url
))
const result = spawnSync(python, ['scripts/package-plugin.py', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' })
if (result.error || result.status !== 0) throw new Error('Plugin packaging failed.')
