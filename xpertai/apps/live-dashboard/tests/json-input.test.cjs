const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseJsonInput } = require('../dist/lib/json-input.js')
const { parseObjectJson } = require('../dist/lib/agent.schema.js')

for (const [label, input, offset, line, column, found] of [
  ['extra closing brace', '{"pattern":"x"}}', 15, 1, 16, '"}"'],
  ['missing array bracket', '{"measures":["amount"}', 21, 1, 22, '"}"'],
  ['unfinished object', '{"key":', 7, 1, 8, 'end of input'],
  ['multiline property', '{\n  "a": 1,\n}', 12, 3, 1, '"}"'],
  ['UTF-16 offsets after emoji', '{"a":"😀"}}', 10, 1, 11, '"}"'],
  ['escaped control character', '{"a":"\n"}', 6, 1, 7, '"\\n"'],
]) {
  test(`JSON diagnostics locate ${label}`, () => {
    assert.throws(() => parseJsonInput(input, 'binding.payloadJson'), error => {
      assert.match(error.message, /DASHBOARD_INVALID_JSON: binding.payloadJson/)
      assert.ok(error.message.includes(`offset ${offset} (0-based UTF-16), line ${line}, column ${column} (1-based)`), error.message)
      assert.ok(error.message.includes(`found ${found}.`), error.message)
      return true
    })
  })
}

test('syntax diagnostics do not expose payloads or native error snippets', () => {
  for (const input of ['{"password":"private-secret"}}', 'private-secret']) {
    assert.throws(() => parseJsonInput(input, 'requestJson'), error => {
      assert.match(error.message, /DASHBOARD_INVALID_JSON: requestJson/)
      assert.doesNotMatch(error.message, /private-secret|password/)
      return true
    })
  }
})

test('valid JSON with the wrong shape is distinguished from syntax errors', () => {
  for (const input of ['[]', 'null', '"text"', '42']) {
    assert.throws(() => parseObjectJson(input, 'requestJson'), error => {
      assert.match(error.message, /requestJson is valid JSON but must be an object/)
      assert.doesNotMatch(error.message, /offset|column/)
      return true
    })
  }
  assert.deepEqual(parseObjectJson('{"query":{"limit":20}}'), { query: { limit: 20 } })
})
