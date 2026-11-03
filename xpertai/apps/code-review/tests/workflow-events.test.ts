import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CodeReviewCapability } from '../src/capability.js'
import { defaultPolicy, policySettingsSchema } from '../src/automation-contract.js'
import { workflowDecision, workflowEventSchema, workflowRef } from '../src/workflow-contract.js'
import { GitHub } from '../src/github.js'

const payload = workflowEventSchema.parse({ action: 'completed', installation: { id: 1 }, repository: { id: 2 },
  workflow_run: { id: 25, run_attempt: 1, head_sha: 'a'.repeat(40), head_branch: 'main', name: 'CI', conclusion: 'failure', status: 'completed', html_url: 'https://github.com/a/b/actions/runs/25' } })
test('workflow events without a PR support exact branch/workflow filters and failure/timeout opt-in', () => {
  const enabled = { ...defaultPolicy, enabled: true, onWorkflowFailure: true }
  assert.equal(workflowDecision(enabled, payload), null)
  assert.equal(workflowDecision(defaultPolicy, payload), 'automation_paused')
  assert.equal(workflowDecision({ ...enabled, executionMode: 'pipeline' }, payload), 'workflow_requires_assistant')
  assert.equal(workflowDecision({ ...enabled, branches: ['release'] }, payload), 'branch_excluded')
  assert.equal(workflowDecision({ ...enabled, workflows: ['Other CI'] }, payload), 'workflow_excluded')
  for (const conclusion of ['success', 'cancelled', 'skipped', 'timed_out'])
    assert.equal(workflowDecision(enabled, { ...payload, workflow_run: { ...payload.workflow_run, conclusion } }), 'trigger_disabled')
  assert.equal(workflowDecision({ ...enabled, onWorkflowTimeout: true }, { ...payload, workflow_run: { ...payload.workflow_run, conclusion: 'timed_out' } }), null)
  assert.equal(workflowRef({ ...payload.workflow_run, run_attempt: 2 }).attempt, 2)
})
test('legacy settings retain pipeline mode while new repositories default to Assistant mode', () => {
  const { executionMode, onWorkflowFailure, onWorkflowTimeout, workflows, ...legacy } = defaultPolicy
  assert.equal(policySettingsSchema.parse(legacy).executionMode, 'pipeline')
  assert.equal(defaultPolicy.executionMode, 'assistant')
  const capability = new CodeReviewCapability()
  assert.equal(capability.availableForBlankAssistant, true)
  assert.equal(capability.supportsQuickCreation, true)
})
test('job log redirects never forward credentials and bounded logs redact common token formats', async () => {
  const requests: { url: string; authorization: string | null }[] = []
  const github = new GitHub('fixture-token', async (input, init) => {
    const url = String(input); requests.push({ url, authorization: new Headers(init?.headers).get('authorization') })
    return url.startsWith('https://api.github.com') ? new Response(null, { status: 302, headers: { location: 'https://fixture.blob.core.windows.net/log.txt' } })
      : new Response('Authorization: Bearer secret\nghp_private\n' + 'x'.repeat(300000))
  })
  const result = await github.jobLog('owner', 'repo', 12)
  assert.equal(requests[0].authorization, 'Bearer fixture-token')
  assert.equal(requests[1].authorization, null)
  assert.equal(result.truncated, true)
  assert(!result.content.includes('secret')); assert(!result.content.includes('ghp_private'))
  assert(result.content.length <= 256 * 1024 + 100)
  const unsafe = new GitHub('fixture-token', async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }))
  await assert.rejects(unsafe.jobLog('owner', 'repo', 12), /invalid_log_redirect/)
})
