import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const python = process.env.FUNDS_QUERY_PYTHON || fileURLToPath(new URL(
  process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python', import.meta.url
))
const result = spawnSync(python, ['scripts/bundle-python.py'], { cwd: root, stdio: 'inherit' })
if (result.error || result.status !== 0) throw new Error('Prepare the pinned development Python dependencies before building.')
