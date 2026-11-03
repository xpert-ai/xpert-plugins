import { z } from 'zod/v3'
import { reportSchema } from './report'

export const factKeySchema = reportSchema.keyof().exclude(['questions'])
export const evidenceSchema = z.object({ sourceId: z.string().min(1).max(120), quote: z.string().min(1).max(1500) }).strict()
export const suggestionSchema = z.object({ field: factKeySchema, value: z.string().trim().min(1).max(8000), evidence: z.array(evidenceSchema).min(1).max(3) }).strict()
export const modelQuestionSchema = z.object({ field: factKeySchema, question: z.string().trim().min(1).max(300), reason: z.string().trim().min(1).max(300) }).strict()
export const modelOutputSchema = z.object({ fields: z.array(suggestionSchema).max(9), questions: z.array(modelQuestionSchema).max(3) }).strict()
export const questionSchema = modelQuestionSchema.extend({ id: z.string().regex(/^q_[a-f0-9]{16}$/) })
export const answerSchema = z.object({ questionId: z.string().regex(/^q_[a-f0-9]{16}$/), question: z.string().max(300), text: z.string().max(4000) }).strict()
export const answerInputSchema = answerSchema.pick({ questionId: true, text: true })
export const sourceSchema = z.object({ id: z.string(), text: z.string() }).strict()
export const analysisInputSchema = z.object({
  sources: z.array(sourceSchema), report: reportSchema, protectedFields: z.array(reportSchema.keyof()),
  previousQuestions: z.array(questionSchema), answers: z.array(answerSchema)
}).strict()
export const analysisResultSchema = z.object({
  attemptId: z.string().uuid(), sourceRevision: z.number().int(), completedAt: z.string(),
  fields: z.array(suggestionSchema), questions: z.array(questionSchema)
}).strict()
export const analysisFailureSchema = z.enum(['queue_unavailable', 'model_unavailable', 'model_timeout', 'invalid_output', 'interrupted', 'access_denied'])
export const analysisStateSchema = z.object({
  id: z.string().uuid(), status: z.enum(['queued', 'running', 'succeeded', 'failed', 'superseded']),
  sourceRevision: z.number().int(), createdAt: z.string(), completedAt: z.string().nullable(),
  errorCode: analysisFailureSchema.nullable()
}).strict()
export const analyzeSchema = z.object({ revision: z.number().int().positive(), requestId: z.string().uuid() }).strict()
export type AnalysisInput = z.infer<typeof analysisInputSchema>
export type AnalysisResult = z.infer<typeof analysisResultSchema>
export type AnalysisState = z.infer<typeof analysisStateSchema>
export type AnalysisFailure = z.infer<typeof analysisFailureSchema>
export type Answer = z.infer<typeof answerSchema>
export type AnswerInput = z.infer<typeof answerInputSchema>
export type Suggestion = z.infer<typeof suggestionSchema>
export type ModelOutput = z.infer<typeof modelOutputSchema>
