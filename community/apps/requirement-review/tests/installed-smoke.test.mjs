import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const script = resolve(packageRoot, 'scripts', 'installed-platform-smoke.mjs')

test('installed smoke help documents the explicit model-call gate', () => {
  const result = spawnSync(process.execPath, [script, '--help'], {
    cwd: packageRoot,
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /capture-auth/)
  assert.match(result.stdout, /REQTRACE_E2E_ALLOW_MODEL=1/)
  assert.match(result.stdout, /REQTRACE_E2E_BROWSER_EXECUTABLE/)
  assert.match(result.stdout, /完整刷新/)
})

test('installed smoke refuses a model call without explicit opt-in', () => {
  const env = { ...process.env, REQTRACE_E2E_URL: 'http://localhost:4200/test' }
  delete env.REQTRACE_E2E_ALLOW_MODEL
  const result = spawnSync(process.execPath, [script, 'run'], {
    cwd: packageRoot,
    env,
    encoding: 'utf8'
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /REQTRACE_E2E_ALLOW_MODEL=1/)
  assert.doesNotMatch(result.stderr, /Playwright/)
})
