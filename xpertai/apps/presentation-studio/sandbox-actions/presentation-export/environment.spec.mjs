import assert from 'node:assert/strict'
import test from 'node:test'
import { sandboxChildEnvironment } from './environment.mjs'

test('uses the prebuilt theme runtime for every Sandbox Action child process', () => {
  assert.deepEqual(sandboxChildEnvironment('/tmp/presentation-job'), {
    INIT_CWD: '/tmp/presentation-job',
    DASHI_PPT_THEME_RUNTIME: 'prebuilt',
    DASHI_PPT_CERT_DIR: '/tmp/presentation-job/.https-preview',
    HOME: '/tmp/presentation-job/.home'
  })
})
