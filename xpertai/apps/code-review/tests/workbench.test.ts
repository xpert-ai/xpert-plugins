import assert from 'node:assert/strict'
import { test } from 'node:test'
import { viewState, viewParameters, statusLabel } from '../remote-components/code-review/src/workbench-model.js'
import { workbenchEntrySchema, workbenchQuerySchema } from '../src/workbench-contract.js'

test('workbench deep links round trip the complete queue and selected-run state', () => {
  const state = {
    section: 'recent' as const,
    page: 3,
    search: 'pipeline',
    repository: 'xpert-ai/xpert',
    status: 'running',
    recordId: 'run',
    tab: 'history',
    pinned: true
  }
  assert.deepEqual(viewState(viewParameters(state)), state)
  assert.equal(viewState({ section: 'untrusted', tab: 'bogus', listPage: -1 }).section, 'inbox')
  assert.equal(viewState({ listPage: 1000 }).page, 50)
  assert.equal(viewState({ tab: 'bogus' }).tab, 'changes')
})
test('queue parameters are bounded and source kinds are explicit', () => {
  assert.equal(workbenchQuerySchema.parse({ search: '  #1188  ' }).search, '#1188')
  assert.throws(() => workbenchQuerySchema.parse({ page: 51 }))
  assert.throws(() => workbenchQuerySchema.parse({ recordId: '../../secret' }))
  assert.throws(() => workbenchQuerySchema.parse({ search: 'x'.repeat(201) }))
  assert.equal(workbenchEntrySchema.shape.source.safeParse('Agent: security').success, false)
  assert.equal(workbenchEntrySchema.shape.source.safeParse('automatic').success, true)
})
test('review statuses have localized labels including actionable and unknown states', () => {
  assert.equal(statusLabel('awaiting_confirmation', 'zh-Hans'), '待确认')
  assert.equal(statusLabel('publication_unknown', 'en-US'), 'Check GitHub')
  assert.equal(statusLabel('unrecognized_provider_state', 'zh-Hans'), '未知状态')
})
