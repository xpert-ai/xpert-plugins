import { z } from 'zod/v3'

export const pipelineTargetSchema = z.object({ projectId: z.string().uuid(), bindingId: z.string().uuid() }).strict()
export type PipelineTarget = z.infer<typeof pipelineTargetSchema>

export const policySettingsSchema = z.object({
  enabled: z.boolean(),
  delivery: z.enum(['draft', 'automatic']),
  onOpened: z.boolean(), onReady: z.boolean(), onPush: z.boolean(),
  includeBots: z.boolean(),
  branches: z.array(z.string().trim().min(1).max(200)).max(30),
  ignoredPaths: z.array(z.string().trim().min(1).max(200)).max(30),
  instructions: z.string().max(6000),
  dailyLimit: z.number().int().min(1).max(200),
  visibility: z.enum(['private', 'project']),
  pipeline: pipelineTargetSchema.nullable().default(null)
}).strict()
export type PolicySettings = z.infer<typeof policySettingsSchema>
export const defaultPolicy: PolicySettings = {
  enabled: false, delivery: 'draft', onOpened: true, onReady: true, onPush: true,
  includeBots: false, branches: [], ignoredPaths: ['**/package-lock.json', '**/pnpm-lock.yaml', '**/yarn.lock'],
  instructions: '', dailyLimit: 20, visibility: 'private', pipeline: null
}
export const runStatusSchema = z.enum(['queued', 'running', 'awaiting_confirmation', 'publishing', 'published', 'failed', 'skipped', 'superseded', 'cancelled', 'publication_unknown', 'needs_configuration', 'blocked', 'awaiting_revision', 'completed'])
export type RunStatus = z.infer<typeof runStatusSchema>
