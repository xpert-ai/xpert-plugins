import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicDiagnostic } from '../dist/lib/computer-completion.js'
import { messageCompletion } from '../dist/lib/message-completion.js'

test('an explicit successful terminal receipt does not require a textual report', () => {
  for (const result of ['', '   ', undefined]) {
    const completion = messageCompletion('CLI', [{ type: 'result', subtype: 'success', is_error: false, result }])
    assert.equal(completion.ok, true)
    assert.equal(completion.text, result ?? '')
  }
  assert.equal(messageCompletion('CLI', []).ok, false)
  assert.equal(messageCompletion('CLI', [{ type: 'result', subtype: 'error', is_error: true, result: '' }]).ok, false)
})

test('completion errors retain actionable context without common credential formats or control bytes', () => {
  const message = publicDiagnostic('mkdir -p qa; TOKEN=private-env; --api-key "private-flag"; ' +
    '{"password":"private-json"}; Bearer private-bearer; https://user:private-url@example.test; \u001bsecret:private-value')
  assert.match(message, /mkdir -p qa/)
  assert.doesNotMatch(message, /private-|\u001b/)
  assert.equal(publicDiagnostic('x'.repeat(10000)).length, 1200)
})
