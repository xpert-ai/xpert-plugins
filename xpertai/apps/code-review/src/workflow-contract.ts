import { z } from 'zod/v3'
import { shaSchema } from './domain.js'
import type { PolicySettings } from './automation-contract.js'

export const workflowRefSchema = z.object({ kind: z.literal('workflow_run'), runId: z.number().int().positive().safe(),
  attempt: z.number().int().positive(), headSha: shaSchema, branch: z.string().nullable(), name: z.string().max(1000),
  conclusion: z.string().nullable(), url: z.string().url() }).strict()
export type WorkflowRef = z.infer<typeof workflowRefSchema>
export const workflowRunSchema = z.object({ id: z.number().int().positive().safe(), run_attempt: z.number().int().positive(),
  head_sha: shaSchema, head_branch: z.string().nullable(), name: z.string().nullable(), conclusion: z.string().nullable(),
  status: z.string(), html_url: z.string().url() })
export const workflowEventSchema = z.object({ action: z.string(), installation: z.object({ id: z.number().int().positive().safe() }),
  repository: z.object({ id: z.number().int().positive().safe() }), workflow_run: workflowRunSchema })
export const workflowJobSchema = z.object({ id: z.number().int().positive().safe(), run_id: z.number().int().positive().safe(),
  name: z.string(), conclusion: z.string().nullable(), html_url: z.string().url(),
  steps: z.array(z.object({ name: z.string(), number: z.number(), conclusion: z.string().nullable(), status: z.string() })).default([]) })
export const workflowEvidenceSchema = z.object({ jobs: z.array(workflowJobSchema).max(100), truncated: z.boolean() })
export type WorkflowEvidence = z.infer<typeof workflowEvidenceSchema>
export const workflowResultSchema = z.object({ summary: z.string().trim().min(1).max(12000),
  findings: z.array(z.object({ jobId: z.number().int().positive().safe(), cause: z.string().trim().min(1).max(2000),
    evidence: z.string().trim().min(1).max(4000), suggestion: z.string().trim().min(1).max(4000) }).strict()).max(30)
}).strict()
export type WorkflowResult = z.infer<typeof workflowResultSchema>
export function workflowRef(run: z.infer<typeof workflowRunSchema>): WorkflowRef {
  return { kind: 'workflow_run', runId: run.id, attempt: run.run_attempt, headSha: run.head_sha, branch: run.head_branch,
    name: run.name ?? 'Workflow', conclusion: run.conclusion, url: run.html_url }
}
export function workflowDecision(settings: PolicySettings, event: z.infer<typeof workflowEventSchema>) {
  if (!settings.enabled) return 'automation_paused'
  if (settings.executionMode !== 'assistant') return 'workflow_requires_assistant'
  if (event.action !== 'completed' || event.workflow_run.status !== 'completed') return 'trigger_disabled'
  const run = event.workflow_run
  if (!(run.conclusion === 'failure' && settings.onWorkflowFailure || run.conclusion === 'timed_out' && settings.onWorkflowTimeout)) return 'trigger_disabled'
  if (settings.branches.length && !settings.branches.includes(run.head_branch ?? '')) return 'branch_excluded'
  if (settings.workflows.length && !settings.workflows.includes(run.name ?? '')) return 'workflow_excluded'
  return null
}
