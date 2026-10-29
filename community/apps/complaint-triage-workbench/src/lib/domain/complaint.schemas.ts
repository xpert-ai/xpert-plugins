import { z } from 'zod'

export const complaintTriageResultSchema = z
  .object({
    summary: z.string().trim().min(1).max(1000),
    category: z.string().trim().min(1).max(120),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
    customerIntent: z.string().trim().min(1).max(500),
    riskFlags: z.array(z.string().trim().min(1).max(160)).max(12),
    suggestedAction: z.string().trim().min(1).max(1500),
    replyDraft: z.string().trim().min(1).max(4000)
  })
  .strict()

export const createComplaintCaseSchema = z
  .object({
    customerName: z.string().trim().min(1).max(160),
    customerReference: z.string().trim().min(1).max(160).optional(),
    complaintContent: z.string().trim().min(1).max(10000)
  })
  .strict()

export const listComplaintCasesSchema = z
  .object({
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(50).default(20),
    search: z.string().trim().min(1).max(160).optional()
  })
  .strict()

export const complaintCaseIdSchema = z
  .object({ caseId: z.string().uuid() })
  .strict()

export const submitComplaintAnalysisSchema = z
  .object({
    caseId: z.string().uuid(),
    attemptId: z.string().uuid(),
    result: complaintTriageResultSchema
  })
  .strict()

export const saveComplaintReviewSchema = z
  .object({
    caseId: z.string().uuid(),
    result: complaintTriageResultSchema
  })
  .strict()

export const confirmComplaintCaseSchema = saveComplaintReviewSchema

export type CreateComplaintCaseInput = z.infer<typeof createComplaintCaseSchema>
export type ListComplaintCasesInput = z.infer<typeof listComplaintCasesSchema>
export type ComplaintTriageResultInput = z.infer<typeof complaintTriageResultSchema>
export type SubmitComplaintAnalysisInput = z.infer<typeof submitComplaintAnalysisSchema>
export type SaveComplaintReviewInput = z.infer<typeof saveComplaintReviewSchema>
