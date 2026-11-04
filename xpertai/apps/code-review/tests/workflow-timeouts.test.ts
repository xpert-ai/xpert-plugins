import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GitHub } from '../src/github.js'
import { githubWorkflowTimeouts } from '../src/github-workflow-timeout.js'

const run = { id: 25, run_attempt: 2, head_sha: 'a'.repeat(40), check_suite_id: 30, head_branch: 'main', name: 'CI',
  status: 'completed', conclusion: 'cancelled', html_url: 'https://github.com/fixture/repo/actions/runs/25' }
const job = { id: 40, run_id: 25, head_sha: run.head_sha, name: 'test', conclusion: 'cancelled', html_url: run.html_url + '/job/40',
  check_run_url: 'https://api.github.com/repos/fixture/repo/check-runs/41', steps: [] }
const timeout = { path: '.github', start_line: 1, end_line: 1, annotation_level: 'failure', title: '', raw_details: '',
  message: 'The job has exceeded the maximum execution time of 1m0s' }
const cancelled = { ...timeout, start_line: 7, end_line: 7, message: 'The operation was canceled.' }
function fixture() {
  const check = { id: 41, head_sha: run.head_sha, check_suite: { id: 30 }, app: { id: 15368 }, status: 'completed', conclusion: 'cancelled', output: { annotations_count: 1 } }
  const pages = [[timeout]], requests: string[] = []
  const github = new GitHub('fixture', async input => {
    const url = new URL(String(input)); requests.push(url.pathname + url.search)
    return Response.json(url.pathname.endsWith('/annotations') ? pages[Number(url.searchParams.get('page')) - 1] ?? [] : check)
  })
  return { check, pages, requests, github, inspect: (jobs = [job]) => githubWorkflowTimeouts(github, 'fixture', 'repo', run, jobs) }
}

test('cancelled timeout normalizes to typed, job-bound evidence without changing GitHub conclusion', async () => {
  const f = fixture()
  assert.deepEqual(await f.inspect(), [{ source: 'check_run_annotation', jobId: 40, checkRunId: 41, message: timeout.message }])
  assert.equal(run.conclusion, 'cancelled')
  assert.deepEqual(f.requests, ['/repos/fixture/repo/check-runs/41', '/repos/fixture/repo/check-runs/41/annotations?per_page=100&page=1'])
})

test('explicit job/check timed_out conclusions work without matching annotation text', async () => {
  const f = fixture()
  assert.deepEqual(await f.inspect([{ ...job, conclusion: 'timed_out' }]), [{ source: 'job_conclusion', jobId: 40 }])
  assert.equal(f.requests.length, 0)
  f.check.conclusion = 'timed_out'
  assert.deepEqual(await f.inspect(), [{ source: 'check_run_conclusion', jobId: 40, checkRunId: 41 }])
  assert.equal(f.requests.length, 1)
})

test('ordinary cancellations and user-authored timeout messages are not job timeout evidence', async () => {
  for (const annotation of [cancelled,
    { ...timeout, message: 'Request timed out' }, { ...timeout, message: 'Example: ' + timeout.message },
    { ...timeout, message: timeout.message + '\nextra' }, { ...timeout, path: 'src/test.ts' },
    { ...timeout, title: 'User diagnostic' }, { ...timeout, annotation_level: 'notice' },
    { ...timeout, start_line: 12 }, { ...timeout, raw_details: 'Custom check' }]) {
    const f = fixture(); f.pages[0] = [annotation]
    assert.deepEqual(await f.inspect(), [])
  }
  const f = fixture(); f.check.output.annotations_count = 0
  assert.deepEqual(await f.inspect(), [])
})

test('annotation pagination finds later timeout evidence and rejects incomplete scans', async () => {
  const f = fixture(); f.check.output.annotations_count = 101; f.pages[0] = Array.from({ length: 100 }, () => cancelled); f.pages[1] = [timeout]
  assert.equal((await f.inspect())[0].source, 'check_run_annotation')
  assert.match(f.requests.at(-1)!, /page=2$/)
  f.pages[1] = []
  await assert.rejects(f.inspect(), /workflow_timeout_evidence_unavailable/)
  f.check.output.annotations_count = 1001
  for (let i = 0; i < 10; i++) f.pages[i] = Array.from({ length: 100 }, () => cancelled)
  await assert.rejects(f.inspect(), /workflow_timeout_evidence_unavailable/)
})

test('foreign repository/check suite/SHA/provider evidence and arbitrary URLs are rejected', async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.check.head_sha = 'b'.repeat(40) },
    (f: ReturnType<typeof fixture>) => { f.check.check_suite.id = 31 },
    (f: ReturnType<typeof fixture>) => { f.check.app.id = 99 },
    (f: ReturnType<typeof fixture>) => { f.check.id = 42 },
    (f: ReturnType<typeof fixture>) => { f.check.status = 'in_progress' }
  ]) { const f = fixture(); change(f); await assert.rejects(f.inspect(), /workflow_evidence_mismatch/) }
  for (const wrong of [{ ...job, run_id: 26 }, { ...job, head_sha: 'b'.repeat(40) },
    { ...job, check_run_url: 'https://evil.example/repos/fixture/repo/check-runs/41' },
    { ...job, check_run_url: 'https://api.github.com/repos/foreign/repo/check-runs/41' },
    { ...job, check_run_url: job.check_run_url + '?token=secret' }]) {
    const f = fixture(); await assert.rejects(f.inspect([wrong]), /workflow_evidence_mismatch/); assert.equal(f.requests.length, 0)
  }
})

test('permission and transient API failures are not translated into ordinary cancellations', async () => {
  for (const status of [403, 404, 429, 500]) {
    const github = new GitHub('fixture', async () => new Response('', { status }))
    await assert.rejects(githubWorkflowTimeouts(github, 'fixture', 'repo', run, [job]))
  }
})
