import { Injectable } from '@nestjs/common'
import { WorkflowTriggerStrategy, type IWorkflowTriggerStrategy, type TWorkflowTriggerParams } from '@xpert-ai/plugin-sdk'
import type { TWorkflowTriggerMeta } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { ReviewEvents } from './event-subscription.js'
import { Repositories } from './repositories.js'
import { scopeSchema, ReviewError } from './domain.js'

export const GITHUB_TRIGGER = 'code_review.github'
const schema = z.object({ enabled: z.boolean().default(true), instructions: z.string().max(6000).default('') }).strict()
type Config = z.input<typeof schema>
type Params = TWorkflowTriggerParams<Config> & { additionalInstructions?: string; scope?: { tenantId: string; organizationId: string | null; userId?: string; assistantUserId?: string; workspaceId?: string } }

@Injectable()
@WorkflowTriggerStrategy(GITHUB_TRIGGER)
export class CodeReviewGitHubTrigger implements IWorkflowTriggerStrategy<Config> {
  constructor(private readonly events: ReviewEvents, private readonly repositories: Repositories) {}
  meta: TWorkflowTriggerMeta = {
    name: GITHUB_TRIGGER, label: { en_US: 'GitHub events · Code review', zh_Hans: 'GitHub 事件 · 代码审查' },
    icon: { type: 'svg', value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M6 2a4 4 0 0 0-1 7.87v4.26a4 4 0 1 0 2 0V9.87A4 4 0 0 0 6 2Zm12 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM7 4h5a7 7 0 0 1 7 7v4h-2v-4a5 5 0 0 0-5-5H7Z"/></svg>' },
    assistant: { category: 'automation', kind: 'app-event', instructionField: 'instructions' },
    configSchema: { type: 'object', additionalProperties: false, properties: {
      enabled: { type: 'boolean', default: true, title: { en_US: 'Listen to configured repositories', zh_Hans: '监听代码审查中已配置的仓库' } },
      instructions: { type: 'string', maxLength: 6000, title: { en_US: 'Event instructions', zh_Hans: '事件处理要求' } }
    } }
  }
  private identity(p: Params) {
    if (!p.scope?.tenantId || !p.scope.organizationId) throw new ReviewError('trigger_scope_required')
    return { tenantId: p.scope.tenantId, organizationId: p.scope.organizationId, assistantId: p.xpertId }
  }
  async validate(p: Params) {
    try {
      schema.parse(p.config)
      if (p.config.enabled === false) return []
      const s = scopeSchema.parse({ ...this.identity(p), userId: p.scope?.userId, workspaceId: p.scope?.workspaceId })
      await this.events.access(s)
      return []
    } catch { return [{ message: 'Enable Code review on this published Assistant.' }] }
  }
  async publish(p: Params) {
    const identity = this.identity(p), config = schema.parse(p.config)
    const existing = await this.events.records.findOneBy(identity)
    let principalUserId = p.scope?.assistantUserId
    if (!principalUserId) {
      const policies = await this.repositories.records.find({ where: { ...identity, ownership: 'assistant' }, take: 100 })
      for (const policy of policies) {
        try { principalUserId = (await this.repositories.execution(policy)).userId; break } catch { /* Disabled Assistant. */ }
      }
    }
    const s = scopeSchema.parse({ ...identity, userId: principalUserId ?? existing?.userId,
      workspaceId: p.scope?.workspaceId ?? existing?.workspaceId })
    if (!s.workspaceId) throw new ReviewError('workspace_required')
    let enabled = config.enabled && !!principalUserId
    if (enabled) { try { await this.events.access(s) } catch { enabled = false } }
    const instructions = [config.instructions, p.additionalInstructions].filter(Boolean).join('\n\n')
    await this.events.records.upsert({ ...s, workspaceId: s.workspaceId, enabled, instructions }, ['tenantId', 'organizationId', 'assistantId'])
  }
  async stop(p: Params) { await this.events.records.update(this.identity(p), { enabled: false }) }
  async assistantStatus(p: Params) {
    const identity = this.identity(p), subscription = await this.events.records.findOneBy(identity)
    let available = false
    try {
      await this.events.access(scopeSchema.parse({ ...identity, userId: p.scope?.userId, workspaceId: p.scope?.workspaceId }))
      available = true
    } catch { /* The provider remains visible but cannot be enabled without its capability. */ }
    const repositories = subscription ? await this.repositories.records.find({ where: identity, take: 100 }) : []
    const application = available ? await this.repositories.app.config() : undefined
    return { available, connection: available && application?.webhookSecret && subscription?.enabled && repositories.some(p => p.settings.enabled) ? 'connected' as const : 'disconnected' as const,
      lastActivityAt: subscription?.lastEventAt?.toISOString() ?? null, lastRunAt: subscription?.lastRunAt?.toISOString() ?? null }
  }
}
