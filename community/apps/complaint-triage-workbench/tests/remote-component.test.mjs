import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ComplaintTriageViewProvider,
  COMPLAINT_TRIAGE_WORKBENCH_REMOTE_ENTRY_KEY,
  COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY
} from '../dist/index.js'

test('serves the complaint workbench remote component with business actions', async () => {
  const provider = new ComplaintTriageViewProvider({}, {})
  const entry = await provider.getRemoteComponentEntry(
    { locale: 'zh-Hans' },
    COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY,
    { entry: COMPLAINT_TRIAGE_WORKBENCH_REMOTE_ENTRY_KEY }
  )

  assert.equal(entry.contentType, 'text/html; charset=utf-8')
  assert.match(entry.html, /xpertai\.remote_component/)
  assert.match(entry.html, /create_case/)
  assert.match(entry.html, /analyze_case/)
  assert.match(entry.html, /confirm_case/)
  assert.doesNotMatch(entry.html, /localStorage/)
})
