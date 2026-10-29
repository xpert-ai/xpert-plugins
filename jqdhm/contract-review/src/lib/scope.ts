import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ContractReviewError } from './contracts.js'

const identity = z.string().min(1).max(128).regex(/^[\x21-\x7e]+$/)
export const scopeSchema = z.object({ tenantId: identity, organizationId: identity, userId: identity, assistantId: identity }).strict()
export type ContractScope = z.infer<typeof scopeSchema>
export function validateScope(input: unknown): ContractScope {
  const result = scopeSchema.safeParse(input)
  if (!result.success) throw new ContractReviewError('UNAUTHORIZED')
  return result.data
}
export function scopeFromView(context: XpertResolvedViewHostContext): ContractScope {
  if (context.hostType !== 'agent') throw new ContractReviewError('UNAUTHORIZED')
  const host = context as XpertResolvedViewHostContext & { xpertId?: string | null }
  return validateScope({ tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, assistantId: context.hostId || host.xpertId })
}
export function scopeFromAgent(context: IAgentMiddlewareContext): ContractScope {
  return validateScope({ tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, assistantId: context.xpertId })
}
