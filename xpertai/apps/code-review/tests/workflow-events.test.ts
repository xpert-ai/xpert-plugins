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
  assert.equal(workflowDecision({ ...enabled, executionMode: 'pipeline' }, payload), null)
  assert.equal(workflowDecision({ ...enabled, branches: ['release'] }, payload), 'branch_excluded')
  assert.equal(workflowDecision({ ...enabled, workflows: ['Other CI'] }, payload), 'workflow_excluded')
  for (const conclusion of ['success', 'cancelled', 'skipped', 'timed_out'])
    assert.equal(workflowDecision(enabled, { ...payload, workflow_run: { ...payload.workflow_run, conclusion } }), 'trigger_disabled')
  assert.equal(workflowDecision({ ...enabled, onWorkflowTimeout: true }, { ...payload, workflow_run: { ...payload.workflow_run, conclusion: 'timed_out' } }), null)
  const cancelled = { ...payload, workflow_run: { ...payload.workflow_run, conclusion: 'cancelled' } }
  assert.equal(workflowDecision({ ...enabled, onWorkflowTimeout: true }, cancelled), null)
  assert.equal(workflowDecision({ ...enabled, onWorkflowTimeout: true, branches: ['release'] }, cancelled), 'branch_excluded')
  assert.equal(workflowDecision({ ...enabled, onWorkflowTimeout: true, workflows: ['Other CI'] }, cancelled), 'workflow_excluded')
  assert.equal(workflowDecision({ ...enabled, onWorkflowTimeout: true }, { ...cancelled, action: 'in_progress' }), 'trigger_disabled')
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

test('workflow sources read large files by the pinned repository blob and respect the caller size limit', async () => {
  const sha = 'a'.repeat(40), blob = 'b'.repeat(40), size = 1024 * 1024 + 1
  const urls: string[] = []
  const github = new GitHub(undefined, async input => {
    urls.push(String(input))
    if (String(input).endsWith('/git/blobs/' + blob)) {
      return Response.json({ sha: blob, size, encoding: 'base64', content: Buffer.alloc(size, 97).toString('base64') })
    }
    return Response.json({ type: 'file', size, sha: blob, encoding: 'none', content: '' })
  })
  const repo = { owner: 'fixture', repository: 'repo' }
  await assert.rejects(github.source(repo, sha, 'locks/build.yaml'), /source_too_large/)
  assert.equal(urls.length, 1)
  assert.equal((await github.source(repo, sha, 'locks/build.yaml', 8 * 1024 * 1024)).length, size)
  assert.deepEqual(urls.slice(1), [
    `https://api.github.com/repos/fixture/repo/contents/locks/build.yaml?ref=${sha}`,
    `https://api.github.com/repos/fixture/repo/git/blobs/${blob}`
  ])
})

test('log numbering counts blank lines and CRLF, removes display escapes, and omits an incomplete truncated tail', async () => {
  const { jobLogLines, verifyWorkflowCitations } = await import('../src/workflow-citations.js')
  const content = 'repeat\r\n\r\n\u001b[31mrepeat\u001b[0m\r\npartial'
  assert.deepEqual(jobLogLines({ content, truncated: true }), ['repeat', '', 'repeat'])
  assert.deepEqual(jobLogLines({ content: 'a\n\n', truncated: false }), ['a', ''])
  assert.deepEqual(jobLogLines({ content: '', truncated: false }), [])
  const job = { id: 1, name: 'CI', run_id: 2, html_url: 'https://github.com/a/b', steps: [], conclusion: 'failure' }
  const gh = new GitHub(undefined, async () => new Response(content))
  const finding = { jobId: 1, cause: 'cause', evidence: 'evidence', suggestion: 'fix',
    repair: { files: [], workingDirectory: '.', update: [], verify: [], basis: 'test' },
    citations: { source: [], log: [{ quote: 'repeat', line: 2 }], limitation: 'No source' } }
  const repo = { owner: 'a', repository: 'b' }, sha = 'a'.repeat(40)
  await assert.rejects(verifyWorkflowCitations(finding, job, gh, repo, sha), /multiple lines/)
  finding.citations.log[0].line = 3
  assert.deepEqual((await verifyWorkflowCitations(finding,job,gh,repo,sha)).log, [{ line: 3, quote: 'repeat' }])
})

test('workflow previews preserve original YAML lines in the presence of blank and comment lines', async () => {
  const { workflowSourceContext } = await import('../src/workflow-citations.js')
  const path = '.github/workflows/shared.yml'
  const body = '# workflow\n\nsteps:\n  - name: Verify inputs\n    run: ./scripts/check\n'
  const github = new GitHub(undefined, async () => Response.json({
    type: 'file', size: body.length, encoding: 'base64', content: Buffer.from(body).toString('base64')
  }))
  const preview = await workflowSourceContext(github, { owner: 'a', repository: 'b' }, 'a'.repeat(40), [path,path],
    [{ id: 1, run_id: 2, name: 'job', conclusion: 'failure', html_url: 'https://github.com/a/b',
      steps: [{ number: 19, name: 'Verify inputs', status: 'completed', conclusion: 'failure' }] }])
  assert.deepEqual(preview, [{ path, lines: [{ line: 4, text: '  - name: Verify inputs' }, { line: 5, text: '    run: ./scripts/check' }] }])
})
