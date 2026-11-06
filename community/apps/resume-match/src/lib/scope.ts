import { ForbiddenException } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import type { MatchScope } from './types.js'

export function viewScope(context: XpertResolvedViewHostContext): MatchScope {
  if (!context.tenantId || !context.organizationId || !context.userId) {
    throw new ForbiddenException('需要已登录的组织用户才能使用简历匹配工作台。')
  }
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

export function toolScope(context: IAgentMiddlewareContext): MatchScope {
  if (!context.tenantId || !context.organizationId || !context.userId) {
    throw new ForbiddenException('智能助理缺少可用的组织上下文。')
  }
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}
