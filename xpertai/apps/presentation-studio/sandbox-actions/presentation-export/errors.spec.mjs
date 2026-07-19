import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyExportError } from './errors.mjs'

test('classifies screenshot timeouts as retryable export timeouts', () => {
  assert.equal(
    classifyExportError('Export failed: locator.screenshot: Timeout 45778ms exceeded.'),
    'EXPORT_TIMEOUT'
  )
})

test('keeps browser launch failures distinct from export timeouts', () => {
  assert.equal(classifyExportError('Chromium executable is unavailable.'), 'BROWSER_LAUNCH_FAILED')
})
