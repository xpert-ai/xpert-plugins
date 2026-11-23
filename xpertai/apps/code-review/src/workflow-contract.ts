import { z } from 'zod/v3'
import { shaSchema } from './domain.js'
import type { PolicySettings } from './automation-contract.js'

export const workflowRefSchema = z.object({ kind: z.literal('workflow_run'), runId: z.number().int().positive().safe(),
  attempt: z.number().int().positive(), headSha: shaSchema, branch: z.string().nullable(), name: z.string().max(1000),
  conclusion: z.string().nullable(), url: z.string().url() }).strict()
export type WorkflowRef = z.infer<typeof workflowRefSchema>
export const workflowRunSchema = z.object({ id: z.number().int().positive().safe(), run_attempt: z.number().int().positive(),
  head_sha: shaSchema, head_branch: z.string().nullable(), name: z.string().nullable(), conclusion: z.string().nullable(),
  status: z.string(), html_url: z.string().url(), path: z.string().optional(),
  referenced_workflows: z.array(z.object({ path: z.string(), sha: shaSchema })).nullish(), check_suite_id: z.number().int().positive().safe().optional() })
export const workflowEventSchema = z.object({ action: z.string(), installation: z.object({ id: z.number().int().positive().safe() }),
  repository: z.object({ id: z.number().int().positive().safe() }), workflow_run: workflowRunSchema })
export const workflowJobSchema = z.object({ id: z.number().int().positive().safe(), run_id: z.number().int().positive().safe(),
  name: z.string(), conclusion: z.string().nullable(), html_url: z.string().url(),
  head_sha: shaSchema.optional(), check_run_url: z.string().url().optional(),
  steps: z.array(z.object({ name: z.string(), number: z.number(), conclusion: z.string().nullable(), status: z.string() })).default([]) })
export const workflowTimeoutSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('job_conclusion'), jobId: z.number().int().positive().safe() }),
  z.object({ source: z.literal('check_run_conclusion'), jobId: z.number().int().positive().safe(), checkRunId: z.number().int().positive().safe() }),
  z.object({ source: z.literal('check_run_annotation'), jobId: z.number().int().positive().safe(), checkRunId: z.number().int().positive().safe(), message: z.string().max(1000) })
])
export type WorkflowTimeout = z.infer<typeof workflowTimeoutSchema>
export const workflowEvidenceSchema = z.object({ workflowPath: z.string().optional(),
  workflowSources: z.array(z.object({ path: z.string(), lines: z.array(z.object({ line: z.number().int().positive(), text: z.string() })),
    previewUnavailable: z.boolean().optional() })).optional(), jobs: z.array(workflowJobSchema).max(100), truncated: z.boolean(), timeouts: z.array(workflowTimeoutSchema).max(100).optional() })
export type WorkflowEvidence = z.infer<typeof workflowEvidenceSchema>
const repairText = z.string().trim().min(1).max(1000)
const repairSchema = z.object({
  files: z.array(repairText).max(40).describe('Exact tracked repository files the repair changes. Expand each relevant configuration or stage.'),
  workingDirectory: repairText,
  update: z.array(repairText).max(15).describe('Repository-supported commands to produce the repair; empty for manual edits or if unavailable.'),
  verify: z.array(repairText).max(15),
  basis: repairText.describe('Explain the source defining the tracked targets and commands. Put line references in citations.source. Explain any missing evidence or intentionally empty fields.')
}).strict()
const lineNumber = z.number().int().positive().safe()
const quote = z.string().trim().min(1).max(500)
const logLine = z.object({ line: lineNumber, quote }).strict()
const sourceLine = logLine.extend({ path: z.string().min(1).max(1000) })
const citationList = z.object({
  steps: z.array(z.object({ number: lineNumber, name: z.string() })),
  log: z.array(logLine), source: z.array(sourceLine), limitation: repairText.optional()
}).strict()
const citationInput = z.object({
  log: z.array(logLine.partial({ line: true })).max(8).describe('Exact single-line excerpts from the complete raw job log. Use the absolute line printed by the log tool for repeated text.'),
  source: z.array(sourceLine.partial({ line: true })).max(8).describe('Exact single-line source excerpts at the failed SHA. Include the workflow run/uses command plus relevant script lines.'),
  limitation: repairText.optional().describe('Explain unavailable source or log evidence.')
}).strict().refine(refs => (refs.log.length && refs.source.length) || !!refs.limitation, {
  message: 'Cite both raw log and source, or explain the unavailable evidence in limitation.'
})
export const workflowResultSchema = z.object({ summary: z.string().trim().min(1).max(12000),
  findings: z.array(z.object({ jobId: z.number().int().positive().safe(), cause: z.string().trim().min(1).max(2000),
    evidence: z.string().trim().min(1).max(4000), suggestion: z.string().trim().min(1).max(4000), repair: repairSchema.optional(), citations: citationList.optional() }).strict()).max(30)
}).strict()
// Historical results did not include structured repair evidence.
export const workflowCompletionSchema = workflowResultSchema.extend({
  findings: z.array(workflowResultSchema.shape.findings.element.required({ repair: true }).extend({ citations: citationInput })).max(30)
})
export type WorkflowResult = z.infer<typeof workflowResultSchema>
export function workflowRef(run: z.infer<typeof workflowRunSchema>): WorkflowRef {
  return { kind: 'workflow_run', runId: run.id, attempt: run.run_attempt, headSha: run.head_sha, branch: run.head_branch,
    name: run.name ?? 'Workflow', conclusion: run.conclusion, url: run.html_url }
}
export function workflowDecision(settings: PolicySettings, event: z.infer<typeof workflowEventSchema>) {
  if (!settings.enabled) return 'automation_paused'
  if (event.action !== 'completed' || event.workflow_run.status !== 'completed') return 'trigger_disabled'
  const run = event.workflow_run
  // Cancelled runs are candidates only; the worker must establish timeout evidence before claiming quota or dispatching.
  if (!(run.conclusion === 'failure' && settings.onWorkflowFailure || ['timed_out', 'cancelled'].includes(run.conclusion ?? '') && settings.onWorkflowTimeout)) return 'trigger_disabled'
  if (settings.branches.length && !settings.branches.includes(run.head_branch ?? '')) return 'branch_excluded'
  if (settings.workflows.length && !settings.workflows.includes(run.name ?? '')) return 'workflow_excluded'
  return null
}
