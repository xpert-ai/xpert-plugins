import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { TriageError, scopeSchema } from './domain/contracts.js'

// The data scope always comes from the platform's runtime context, never from Workbench input or
// from the model: neither can read or write another tenant's or organization's tickets.

export function scopeFromView(context: XpertResolvedViewHostContext) {
  if (context.hostType !== 'agent') throw new TriageError('not_found', 'unsupported_host')
  return scopeSchema.parse({
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? '',
    userId: context.userId
  })
}

export function scopeFromAgent(context: IAgentMiddlewareContext) {
  return scopeSchema.parse({
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? '',
    userId: context.userId
  })
}
