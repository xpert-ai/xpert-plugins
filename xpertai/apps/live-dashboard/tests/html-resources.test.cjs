const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DASHBOARD_NETWORK_POLICY } = require('../dist/lib/document-network')

test('functional acceptance explicitly enables document networking', () => {
  assert.equal(DASHBOARD_NETWORK_POLICY.mode, 'unrestricted')
})
