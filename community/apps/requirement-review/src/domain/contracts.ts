import { z } from 'zod'

export const reviewStatusSchema = z.enum([
  'READY',
  'ANALYZING',
  'REVIEWING',
  'CONFIRMED',
  'FAILED',
  'EMPTY'
])
export const attemptStatusSchema = z.enum([
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'INTERRUPTED'
])

export const aiDraftSchema = z
  .object({
    requirements: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(120),
            description: z.string().trim().min(1).max(2000),
            evidence: z
              .array(
                z
                  .object({
                    segmentId: z.string().regex(/^S\d{2,3}$/),
                    quote: z.string().trim().min(1).max(2000)
                  })
                  .strict()
              )
              .min(1)
              .max(3),
            acceptance: z
              .array(
                z
                  .object({
                    text: z.string().trim().min(1).max(1000),
                    basis: z.enum(['source', 'proposal'])
                  })
                  .strict()
              )
              .max(5),
            openQuestions: z.array(z.string().trim().min(1).max(1000)).max(3)
          })
          .strict()
      )
      .max(8),
    summary: z.string().max(2000)
  })
  .strict()

export type ReviewStatus = z.infer<typeof reviewStatusSchema>
export type AttemptStatus = z.infer<typeof attemptStatusSchema>
export type AiDraft = z.infer<typeof aiDraftSchema>
export const editableDraftSchema = z
  .object({
    requirements: z
      .array(
        aiDraftSchema.shape.requirements.element
          .extend({
            id: z.string().uuid(),
            included: z.boolean()
          })
          .strict()
      )
      .max(8)
  })
  .strict()
export type EditableDraft = z.infer<typeof editableDraftSchema>
export type ConfirmedSnapshot = {
  draft: EditableDraft
  confirmedBy: string
  confirmedAt: string
  sourceVersion: number
}
