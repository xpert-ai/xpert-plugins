import { z } from 'zod/v3'
const caseId = z
  .string()
  .uuid()
  .describe(
    'Exact case UUID returned by the read tool, never the display caseKey.',
  )
const operationId = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .describe('Stable operation identifier. Reuse only for an identical request.')
const expectedRevision = z
  .number()
  .int()
  .positive()
  .describe('Current case revision returned by the read tool.')
export const readSchema = z
  .object({ caseId: caseId.optional(), search: z.string().max(100).optional() })
  .strict()
export const dispatchSchema = z
  .object({
    caseId,
    expectedRevision,
    operationId,
    changeSummary: z.string().trim().min(5).max(200),
  })
  .strict()
export const finalizeSchema = z
  .object({
    caseId,
    expectedRevision,
    operationId,
    evidenceIds: z.array(z.string().min(1).max(100)).min(1).max(60),
    assessment: z.string().trim().min(20).max(2000),
    changeSummary: z.string().trim().min(5).max(200),
  })
  .strict()
export const actionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create_case'),
      kind: z.enum(['duplicate_codes', 'code_collision', 'drawing_request']),
      title: z.string().trim().min(4).max(200).optional(),
      operationId,
    })
    .strict(),
  z
    .object({
      action: z.literal('coordinate'),
      caseId,
      expectedRevision,
      operationId,
    })
    .strict(),
  z
    .object({
      action: z.literal('run_node'),
      caseId,
      nodeKey: z.string().min(1).max(100),
      expectedRevision,
      operationId,
    })
    .strict(),
  z
    .object({
      action: z.literal('decide_proposal'),
      caseId,
      expectedRevision,
      operationId,
      decision: z.enum(['approved', 'rejected']),
      reason: z.string().trim().min(5).max(1000),
    })
    .strict(),
  z
    .object({ action: z.literal('retry_project'), caseId, operationId })
    .strict(),
])
export const receiptSchema = z
  .object({
    success: z.boolean(),
    code: z.string(),
    caseId: z.string().optional(),
    revision: z.number().optional(),
    recordId: z.string().optional(),
    message: z.string().optional(),
  })
  .strict()
export type ReadInput = z.infer<typeof readSchema>
export type FinalizeInput = z.infer<typeof finalizeSchema>
export type DispatchInput = z.infer<typeof dispatchSchema>
export type ViewAction = z.infer<typeof actionSchema>
