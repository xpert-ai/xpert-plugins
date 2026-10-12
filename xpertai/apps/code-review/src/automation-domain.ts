import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod/v3'
import { idSchema, shaSchema, ReviewError } from './domain.js'

export const QUEUE = 'code_review.automation'
export const CONTEXT = 'CODE_REVIEW_CONTEXT'
export const configSchema = z.object({
  githubApp: z.object({
    appId: z.string().regex(/^\d+$/),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    privateKey: z.string().min(1),
    webhookSecret: z.string().min(32),
    publicBaseUrl: z.string().url()
  }).strict().optional()
}).strict()
export type Config = z.infer<typeof configSchema>

export { policySettingsSchema, defaultPolicy, runStatusSchema } from './automation-contract.js'
export type { PolicySettings, RunStatus } from './automation-contract.js'
import { policySettingsSchema, type PolicySettings, type RunStatus } from './automation-contract.js'
export const savePolicySchema = z.object({
  id: idSchema, revision: z.number().int().positive(), settings: policySettingsSchema,
  confirmed: z.literal(true)
}).strict()
export const repositoryInput = z.object({
  owner: z.string().regex(/^[\w.-]+$/), repository: z.string().regex(/^[\w.-]+$/)
}).strict()

export const pullEventSchema = z.object({
  action: z.string(), installation: z.object({ id: z.number().int().positive() }),
  repository: z.object({ id: z.number().int().positive(), name: z.string(), owner: z.object({ login: z.string() }) }),
  pull_request: z.object({ number: z.number().int().positive(), title: z.string().max(1000), state: z.enum(['open', 'closed']),
    draft: z.boolean(), head: z.object({ sha: shaSchema }), base: z.object({ ref: z.string() }),
    user: z.object({ login: z.string(), type: z.string() }) })
})
export type PullEvent = z.infer<typeof pullEventSchema>
export const terminalStatuses: RunStatus[] = ['awaiting_confirmation', 'published', 'failed', 'skipped', 'superseded', 'cancelled', 'publication_unknown']

export function verifyWebhook(raw: Buffer | undefined, signature: string | undefined, secret: string | undefined) {
  if (!secret || !raw || raw.length > 2 * 1024 * 1024 || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    throw new ReviewError('invalid_webhook_signature')
  const expected = createHmac('sha256', secret).update(raw).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) throw new ReviewError('invalid_webhook_signature')
}

export function triggerDecision(settings: PolicySettings, event: PullEvent): string | null {
  const p = event.pull_request
  if (!settings.enabled) return 'automation_paused'
  if (p.state !== 'open') return 'pull_request_closed'
  if (p.draft) return 'draft_pull_request'
  if (!settings.includeBots && p.user.type === 'Bot') return 'bot_pull_request'
  if (settings.branches.length && !settings.branches.includes(p.base.ref)) return 'branch_excluded'
  const triggers: Record<string, boolean> = { opened: settings.onOpened, reopened: settings.onOpened, ready_for_review: settings.onReady, synchronize: settings.onPush }
  if (!triggers[event.action]) return 'trigger_disabled'
  return null
}

/** Linear state-set matching avoids regexp backtracking on repository-controlled filenames. */
export function ignoredPath(path: string, patterns: string[]) {
  return patterns.some(pattern => {
    let positions = new Set([0])
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i], next = new Set<number>()
      if (c === '*') {
        const recursive = pattern[i + 1] === '*'
        if (recursive) i++
        if (recursive && pattern[i + 1] === '/') {
          i++
          for (const position of positions) next.add(position)
          const first = Math.min(...positions)
          for (let j = first; j < path.length; j++) if (path[j] === '/') next.add(j + 1)
        } else {
          for (const position of positions) next.add(position)
          for (let j = 0; j < path.length; j++) if (next.has(j) && (recursive || path[j] !== '/')) next.add(j + 1)
        }
      } else {
        for (const position of positions) if (position < path.length && (c === '?' ? path[position] !== '/' : path[position] === c)) next.add(position + 1)
      }
      positions = next
      if (!positions.size) return false
    }
    return positions.has(path.length)
  })
}
