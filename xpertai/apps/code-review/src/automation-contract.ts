import { z } from 'zod/v3'

export const policySettingsSchema = z.object({
  enabled: z.boolean(),
  delivery: z.enum(['draft', 'automatic']),
  onOpened: z.boolean(), onReady: z.boolean(), onPush: z.boolean(),
  includeBots: z.boolean(),
  branches: z.array(z.string().trim().min(1).max(200)).max(30),
  ignoredPaths: z.array(z.string().trim().min(1).max(200)).max(30),
  instructions: z.string().max(6000),
  dailyLimit: z.number().int().min(1).max(200),
  visibility: z.literal('private')
}).strict()
export type PolicySettings = z.infer<typeof policySettingsSchema>
export const defaultPolicy: PolicySettings = {
  enabled: false, delivery: 'draft', onOpened: true, onReady: true, onPush: true,
  includeBots: false, branches: [], ignoredPaths: ['**/package-lock.json', '**/pnpm-lock.yaml', '**/yarn.lock'],
  instructions: '', dailyLimit: 20, visibility: 'private'
}
export const runStatusSchema = z.enum(['queued', 'running', 'awaiting_confirmation', 'publishing', 'published', 'failed', 'skipped', 'superseded', 'cancelled', 'publication_unknown'])
export type RunStatus = z.infer<typeof runStatusSchema>
