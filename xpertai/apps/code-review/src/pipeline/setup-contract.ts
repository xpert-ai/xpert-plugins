import { z } from 'zod/v3'

export const reviewTemplateSources = {
  'code-review.pull-request@1.0.0': 'github',
  'code-review.pull-request-light@1.0.0': 'github',
  'code-review.local-git@1.0.0': 'local_git'
} as const
export const reviewSourceSchema = z.enum(['github', 'local_git'])
export const pipelineParametersSchema = z.object({
  requireChecks: z.boolean(), requiredChecks: z.array(z.string().min(1).max(200)).max(100),
  blockingPriorities: z.array(z.enum(['P0', 'P1', 'P2', 'P3'])).min(1).max(4)
}).strict()
const localized = z.record(z.string())
export const reviewPipelineCatalogSchema = z.object({
  defaultAssistantId: z.string().uuid().nullable(),
  assistants: z.array(z.object({ id: z.string().uuid(), name: z.string(), publishedVersion: z.string() })),
  templates: z.array(z.object({
    contributionKey: z.string(), templateRef: z.string(), sourceKind: reviewSourceSchema,
    title: z.string(), version: z.string(), description: localized,
    assistantSlots: z.array(z.object({ slot: z.string(), label: localized })),
    parameters: pipelineParametersSchema
  }))
})
export const reviewPipelineSetupSchema = z.object({
  contributionKey: z.string().min(1), templateRef: z.string().min(1),
  assistants: z.record(z.string().min(1), z.string().uuid()), parameters: pipelineParametersSchema
}).strict()
export const reviewPipelineConfigureSchema = reviewPipelineSetupSchema.extend({
  requestId: z.string().uuid(), sourceKind: reviewSourceSchema
}).strict()
export const savedReviewPipelinesSchema = z.object({ items: z.array(z.object({
  id: z.string().uuid(), sourceKind: reviewSourceSchema, title: z.string(), version: z.string(), createdAt: z.string()
})), next: z.string().uuid().nullable() })
export type ReviewPipelineCatalog = z.infer<typeof reviewPipelineCatalogSchema>
export type ReviewPipelineSetup = z.infer<typeof reviewPipelineSetupSchema>
export type ReviewSource = z.infer<typeof reviewSourceSchema>
export type ReviewPipelineChoice = { kind: 'template'; setup: ReviewPipelineSetup } |
  { kind: 'saved'; projectId: string; bindingId: string }

export function reviewTemplateSource(templateRef: string): ReviewSource | undefined {
  return Object.prototype.hasOwnProperty.call(reviewTemplateSources, templateRef)
    ? reviewTemplateSources[templateRef as keyof typeof reviewTemplateSources] : undefined
}
