import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codexToolProfileConfig } from './codex-tool-profiles.mjs'
const names = (text) => JSON.parse(text.split('enabled_tools = ')[1])
test('visual preset contains exactly four base and four visual tools', () => {
  const tools = names(codexToolProfileConfig({ profiles: ['timeline-visual'] }))
  assert.equal(tools.length, 8)
  assert.ok(tools.includes('cut_update_transform'))
  assert.ok(!tools.includes('cut_report_failure'))
  assert.ok(!tools.includes('cut_revert_edit_proposal'))
})
test('subtitle authoring does not implicitly include commit, export or finalize', () => {
  const tools = names(codexToolProfileConfig({ profiles: ['caption-authoring'], pendingJobs: true }))
  assert.ok(tools.includes('cut_cancel_analysis_job'))
  for (const name of ['cut_commit_caption_draft','cut_finalize_version','cut_export_subtitle']) assert.ok(!tools.includes(name))
  assert.throws(() => codexToolProfileConfig({ profiles: ['made-up'] }), /Unknown/)
})
