import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const request = JSON.parse(await readFile(process.argv[process.argv.indexOf('--request') + 1], 'utf8'))
const output = process.argv[process.argv.indexOf('--output') + 1]
const language = request.payload.language
if (language !== 'python' && language !== 'javascript') throw new Error('Invalid script language')
// Code is a verified input snapshot, never an inline command or shell expression.
const child = spawn(language === 'python' ? 'python3' : 'node', language === 'python'
  ? ['-I', '-B', join(dirname(fileURLToPath(import.meta.url)), 'python.py')]
  : [join(dirname(fileURLToPath(import.meta.url)), 'javascript.mjs')],
  { cwd: '/tmp', env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp/home', PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'inherit', 'inherit'] })
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
if (code !== 0) process.exit(1)
