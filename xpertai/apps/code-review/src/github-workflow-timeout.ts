import { z } from 'zod/v3'
import { ReviewError, shaSchema } from './domain.js'
import type { GitHub } from './github.js'
import type { workflowRunSchema, workflowJobSchema, WorkflowTimeout } from './workflow-contract.js'

const checkSchema = z.object({ id: z.number().int().positive().safe(), head_sha: shaSchema,
  status: z.string(), conclusion: z.string().nullable(), app: z.object({ id: z.number() }),
  check_suite: z.object({ id: z.number() }), output: z.object({ annotations_count: z.number().int().nonnegative() }) })
const annotationSchema = z.object({ path: z.string(), start_line: z.number(), end_line: z.number(),
  annotation_level: z.string(), title: z.string().nullable().optional(), message: z.string(), raw_details: z.string().nullable().optional() })

/** @deprecated GitHub compatibility normalization until job timeouts consistently expose the timed_out conclusion. */
function timeoutAnnotation(annotation: z.infer<typeof annotationSchema>) {
  // Match the observed GitHub Actions job-level diagnostic exactly, never arbitrary log text or a timeout keyword.
  return annotation.annotation_level === 'failure' && annotation.path === '.github' && annotation.start_line === 1 && annotation.end_line === 1 &&
    !annotation.title && !annotation.raw_details && /^The job has exceeded the maximum execution time of (?:[1-9]\d*h(?:\d+m)?(?:\d+s)?|[1-9]\d*m(?:\d+s)?|[1-9]\d*s)$/.test(annotation.message)
}

export async function githubWorkflowTimeouts(github: GitHub, owner: string, repository: string,
  run: z.infer<typeof workflowRunSchema>, jobs: z.infer<typeof workflowJobSchema>[]): Promise<WorkflowTimeout[]> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/check-runs/`
  const evidence: WorkflowTimeout[] = []
  for (const job of jobs) {
    if (job.run_id !== run.id || job.head_sha !== run.head_sha) throw new ReviewError('workflow_evidence_mismatch')
    if (job.conclusion === 'timed_out') { evidence.push({ source: 'job_conclusion', jobId: job.id }); continue }
    if (job.conclusion !== 'cancelled') continue
    if (!job.check_run_url || !run.check_suite_id) throw new ReviewError('workflow_timeout_evidence_unavailable')
    const url = new URL(job.check_run_url)
    const id = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : ''
    if (url.origin !== 'https://api.github.com' || url.search || url.hash || url.username || url.password || !/^[1-9]\d*$/.test(id))
      throw new ReviewError('workflow_evidence_mismatch')
    // Reconstruct the repository-bound path; never fetch an arbitrary URL from a payload.
    const check = checkSchema.parse(await github.request(`${base}${id}`))
    if (String(check.id) !== id || check.head_sha !== run.head_sha || check.check_suite.id !== run.check_suite_id || check.app.id !== 15368 || check.status !== 'completed')
      throw new ReviewError('workflow_evidence_mismatch')
    if (check.conclusion === 'timed_out') { evidence.push({ source: 'check_run_conclusion', jobId: job.id, checkRunId: check.id }); continue }
    if (check.conclusion !== 'cancelled') throw new ReviewError('workflow_evidence_mismatch')
    let read = 0
    for (let page = 1; read < check.output.annotations_count && page <= 10; page++) {
      const annotations = z.array(annotationSchema).max(100).parse(await github.request(`${base}${id}/annotations?per_page=100&page=${page}`))
      const timeout = annotations.find(timeoutAnnotation)
      if (timeout) { evidence.push({ source: 'check_run_annotation', jobId: job.id, checkRunId: check.id, message: timeout.message }); break }
      read += annotations.length
      if (!annotations.length || page === 10 && read < check.output.annotations_count) throw new ReviewError('workflow_timeout_evidence_unavailable')
    }
  }
  return evidence
}
