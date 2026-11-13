import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
const root = fileURLToPath(new URL('../', import.meta.url))
const run = (command, args, options = {}) => {
  const p = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (p.error || p.status !== 0) throw new Error('Failed: ' + command + ' ' + args[0])
  return p
}
const candidates = process.env.FUNDS_QUERY_BASE_PYTHON
  ? [process.env.FUNDS_QUERY_BASE_PYTHON]
  : ['python3.12', 'python3.11', 'python3']
const base = candidates.find((c) => {
  const p = spawnSync(c, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)'], {
    stdio: 'ignore'
  })
  return !p.error && p.status === 0
})
if (!base) throw new Error('Python 3.11+ is required. Install it, then rerun this command.')
const python = join(
  root,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
)
if (!existsSync(python)) run(base, ['-m', 'venv', join(root, '.venv')])
if (spawnSync(python, ['-m', 'pip', '--version'], { stdio: 'ignore' }).status !== 0)
  run(python, ['-m', 'ensurepip', '--upgrade'])
run(python, ['-m', 'pip', 'install', '-r', 'python/requirements.txt'])
run(python, ['-c', 'import openpyxl, defusedxml, sqlite3; print("Python runtime ready")'])
const config = {
  pythonExecutable: python,
  dataDirectory: resolve(
    process.env.FUNDS_QUERY_DATA_DIR || join(homedir(), '.local/share/xpert-funds-query')
  ),
  timeoutMs: 30000,
  debug: false
}
const configPath = join(root, 'local-config.json')
if (existsSync(configPath))
  console.log('Preserved existing local-config.json. Check its Python path before deployment.')
else {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  console.log('Created local-config.json for deployment.')
}
// Keep nested pnpm commands on the selected Node version without changing Volta defaults.
const corepack = join(dirname(process.execPath), '../lib/node_modules/corepack/dist/corepack.js')
if (process.platform !== 'win32' && existsSync(corepack)) {
  const bin = join(root, '.runtime/bin')
  mkdirSync(bin, { recursive: true })
  run(process.execPath, [corepack, 'enable', 'pnpm', '--install-directory', bin])
  const quote = (s) => "'" + s.replaceAll("'", "'\"'\"'") + "'"
  writeFileSync(
    join(root, '.runtime/use-env.sh'),
    'export PATH=' +
      quote(bin + ':' + dirname(process.execPath)) +
      ':"$PATH"\nexport NX_TUI=false\nexport NX_NATIVE_COMMAND_RUNNER=false\nexport NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false\n',
    { mode: 0o600 }
  )
  console.log('For this terminal: source .runtime/use-env.sh')
}
