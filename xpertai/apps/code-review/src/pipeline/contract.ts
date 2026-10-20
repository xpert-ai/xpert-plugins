import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import type { ProjectPipelineJsonValue } from '@xpert-ai/contracts'
import { idSchema, reviewRefSchema, resultSchema, shaSchema, snapshotSchema } from '../domain.js'

export const refs = {
  subject: 'code-review.pr-version@1', evidence: 'code-review.evidence@1', snapshot: 'code-review.snapshot@1',
  findings: 'code-review.findings@1', checks: 'code-review.checks@1', delivery: 'code-review.delivery@1',
  prepare: 'code-review.prepare@1', correctness: 'code-review.correctness@1', security: 'code-review.security@1',
  verify: 'code-review.verify@1', ci: 'code-review.ci@1', readiness: 'code-review.readiness@1',
  approval: 'code-review.approval@1', publish: 'code-review.publish@1', confirmed: 'code-review.confirmed@1', localSubject: 'code-review.local-git@1',
  archive: 'code-review.archive@1', localDelivery: 'code-review.local-delivery@1'
} as const
export const pipelineParametersSchema = z.object({
  requireChecks: z.boolean(), requiredChecks: z.array(z.string().min(1).max(200)).max(100),
  blockingPriorities: z.array(z.enum(['P0', 'P1', 'P2', 'P3'])).min(1).max(4)
}).strict()
export const pipelineSnapshotSchema = z.object({
  reviewId: idSchema, ref: reviewRefSchema, snapshot: snapshotSchema, instructions: z.string().max(6000)
}).strict()
export const pipelineFindingsSchema = resultSchema.extend({ reviewId: idSchema, headSha: shaSchema,
  pass: z.enum(['correctness', 'security', 'verify']), inputDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const pipelineChecksSchema = z.object({ headSha: shaSchema, state: z.enum(['passed', 'failed', 'unavailable', 'not_required']),
  checks: snapshotSchema.shape.checks, warnings: z.array(z.string()) }).strict()
export const pipelineDeliverySchema = z.object({ headSha: shaSchema, reviewId: z.number().int().positive(),
  url: z.string().url(), marker: z.string().min(1), event: z.literal('COMMENT') }).strict()
export const pipelineLocalDeliverySchema = z.object({ kind: z.literal('platform'), headSha: shaSchema, reviewId: idSchema,
  findingsDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export type ReviewPipelineEvidenceContent = z.output<typeof pipelineSnapshotSchema> | z.output<typeof pipelineFindingsSchema> |
  z.output<typeof pipelineChecksSchema> | z.output<typeof pipelineDeliverySchema> | z.output<typeof pipelineLocalDeliverySchema>
export type ReviewPipelineDeliveryReceipt = z.output<typeof pipelineDeliverySchema>
const attach = { id: idSchema, revision: z.number().int().positive(), projectId: idSchema, requestId: idSchema }
export const attachPipelineSchema = z.union([
  z.object({ ...attach, assistants: z.object({ correctness: idSchema, security: idSchema, verifier: idSchema }).strict(), parameters: pipelineParametersSchema }).strict(),
  z.object({ ...attach, bindingId: idSchema }).strict()
])

export function digest(value: ProjectPipelineJsonValue): string {
  const canonical = (item: ProjectPipelineJsonValue): string => {
    if (item === null || typeof item !== 'object') return JSON.stringify(item)
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`
    return `{${Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`
  }
  return createHash('sha256').update(canonical(value)).digest('hex')
}
export function evidenceId(operationId: string, port: string) {
  const hash = digest([operationId, port])
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
