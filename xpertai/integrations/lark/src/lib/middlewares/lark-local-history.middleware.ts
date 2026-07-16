import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { LARK_LOCAL_HISTORY_MIDDLEWARE_NAME, LARK_SEARCH_CHAT_HISTORY_TOOL_NAME } from '../constants.js'
import { LarkMessageHistoryService } from '../lark-message-history.service.js'
import { iconImage, type LarkInboundFile } from '../types.js'
import { resolveLarkTrustedRuntimeContext } from './lark-trusted-runtime-context.js'

const searchHistorySchema = z.object({
  keyword: z.string().optional().describe('Optional keyword contained in the stored message text.'),
  direction: z.enum(['inbound', 'outbound', 'both']).optional().describe('Message direction. Defaults to both.'),
  before: z.string().optional().describe('Only messages before this ISO timestamp.'),
  after: z.string().optional().describe('Only messages after this ISO timestamp.'),
  cursor: z.string().max(1024).optional().describe('Opaque nextCursor returned by the previous search page.'),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum messages. Defaults to 20.'),
  includeFiles: z
    .boolean()
    .optional()
    .describe('Return up to 10 ready workspace file artifacts from matched messages.'),
  hasAttachments: z
    .boolean()
    .optional()
    .describe('Filter to messages with attachments (true) or without attachments (false).')
})

type RuntimeHistoryScope = {
  integrationId?: string
  scopeKey?: string
  xpertId?: string
  tenantId?: string
  organizationId?: string
  excludedLogIds: string[]
}

@Injectable()
@AgentMiddlewareStrategy(LARK_LOCAL_HISTORY_MIDDLEWARE_NAME)
export class LarkLocalHistoryMiddleware implements IAgentMiddlewareStrategy {
  constructor(private readonly historyService: LarkMessageHistoryService) {}

  meta: TAgentMiddlewareMeta = {
    name: LARK_LOCAL_HISTORY_MIDDLEWARE_NAME,
    builtin: true,
    icon: { type: 'image', value: iconImage },
    label: {
      en_US: 'Lark Local Message History',
      zh_Hans: '飞书本地消息历史'
    },
    description: {
      en_US: 'Search locally retained messages and workspace files for the current Lark conversation only.',
      zh_Hans: '仅检索当前飞书会话在本地保留的消息和工作区附件。'
    },
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    return {
      name: LARK_LOCAL_HISTORY_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input, config) => {
            const scope = this.resolveRuntimeScope(config, context)
            if (!scope.integrationId || !scope.scopeKey || !scope.xpertId) {
              throw new Error('lark_search_chat_history is only available inside a captured Lark conversation.')
            }
            const result = await this.historyService.searchChatHistory({
              integrationId: scope.integrationId,
              scopeKey: scope.scopeKey,
              xpertId: scope.xpertId,
              tenantId: scope.tenantId,
              organizationId: scope.organizationId,
              keyword: input.keyword,
              direction: input.direction,
              before: input.before,
              after: input.after,
              cursor: input.cursor,
              limit: input.limit,
              includeFiles: input.includeFiles,
              hasAttachments: input.hasAttachments,
              excludedLogIds: scope.excludedLogIds,
              respectContextReset: false
            })
            const text = JSON.stringify({
              items: result.items,
              totalScanned: result.totalScanned,
              hasMore: result.hasMore,
              nextCursor: result.nextCursor,
              fileCount: result.files?.length ?? 0
            })
            return [text, { files: (result.files ?? []).slice(0, 10).map(toFileArtifact) }]
          },
          {
            name: LARK_SEARCH_CHAT_HISTORY_TOOL_NAME,
            description:
              'Search locally stored historical messages for the current Lark private chat or group. The conversation scope is injected by the runtime and cannot be overridden. It never calls the Lark history API or returns raw webhook payloads.',
            schema: searchHistorySchema,
            responseFormat: 'content_and_artifact',
            verboseParsingErrors: true
          }
        )
      ]
    }
  }

  private resolveRuntimeScope(config: unknown, context: IAgentMiddlewareContext): RuntimeHistoryScope {
    const trusted = resolveLarkTrustedRuntimeContext(config)
    return {
      integrationId: trusted.integrationId,
      scopeKey: trusted.scopeKey,
      xpertId: trusted.xpertId ?? normalizeString(context.xpertId),
      tenantId: trusted.tenantId ?? RequestContext.currentTenantId() ?? undefined,
      organizationId: trusted.organizationId ?? RequestContext.getOrganizationId() ?? undefined,
      excludedLogIds: trusted.sourceMessageLogIds
    }
  }
}

function toFileArtifact(file: LarkInboundFile) {
  return {
    fileName: file.originalName ?? file.name ?? 'lark-history-file',
    filePath: file.workspacePath ?? file.filePath ?? '',
    fileUrl: file.fileUrl ?? file.url ?? '',
    mimeType: file.mimeType ?? file.mimetype ?? 'application/octet-stream'
  }
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
