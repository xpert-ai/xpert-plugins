import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dbStudioPromptWorkflows } from '../src/lib/prompt-workflows.js'

test('DB Studio prompts provide unique commands and editable scenario drafts', () => {
  assert.equal(new Set(dbStudioPromptWorkflows.map((item) => item.name)).size, 4)
  for (const workflow of dbStudioPromptWorkflows) {
    assert.match(workflow.name, /^[a-z0-9][a-z0-9_-]*$/)
    assert.equal(workflow.visibility, 'team')
    assert.equal(new Set(workflow.scenarios.map((item) => item.id)).size, workflow.scenarios.length)
    for (const scenario of workflow.scenarios) {
      const draft = workflow.template.replace('{{args}}', scenario.args)
      assert.ok(draft.includes(scenario.args))
      assert.ok(!draft.includes('{{args}}'))
      assert.ok(scenario.label.trim())
    }
  }
})

test('read-only prompts and write prompts preserve their execution boundaries', () => {
  const query = dbStudioPromptWorkflows.find((item) => item.name === 'db-query')!
  const analyze = dbStudioPromptWorkflows.find((item) => item.name === 'db-analyze-sql')!
  const change = dbStudioPromptWorkflows.find((item) => item.name === 'db-change')!
  assert.ok(query.template.includes('不执行写入或结构变更'))
  assert.ok(analyze.template.includes('不要运行 EXPLAIN ANALYZE'))
  assert.ok(change.template.includes('db_studio_execute_plan'))
  assert.ok(change.template.includes('不绕过审批'))
  assert.ok(change.template.includes('未知结果不得盲目重试'))
})
