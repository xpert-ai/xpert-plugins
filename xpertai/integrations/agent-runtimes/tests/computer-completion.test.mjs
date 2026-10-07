import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicDiagnostic } from '../dist/lib/computer-completion.js'

test('completion errors retain actionable context without common credential formats or control bytes', () => {
  const message = publicDiagnostic('mkdir -p qa; TOKEN=private-env; --api-key "private-flag"; ' +
    '{"password":"private-json"}; Bearer private-bearer; https://user:private-url@example.test; \u001bsecret:private-value')
  assert.match(message, /mkdir -p qa/)
  assert.doesNotMatch(message, /private-|\u001b/)
  assert.equal(publicDiagnostic('x'.repeat(10000)).length, 1200)
})
