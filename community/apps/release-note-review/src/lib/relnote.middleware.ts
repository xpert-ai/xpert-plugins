import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddleware, AgentMiddlewareStrategy, IAgentMiddlewareContext, IAgentMiddlewareStrategy, PromiseOrValue, RequestContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { RELNOTE_FEATURE, RELNOTE_MIDDLEWARE_NAME } from './constants.js'
import { RelnoteService, type SaveRelnoteNoteInput } from './relnote.service.js'
import type { RelnoteScope } from './types.js'

const riskSchema = z.object({ level: z.enum(['high', 'medium', 'low']), category: z.enum(['wakeword', 'navigation_cast', 'rollback_missing', 'compatibility', 'other']), item: z.string().min(1), evidence: z.string().min(1), suggestion: z.string().min(1) })
const getDraftSchema = z.object({ releaseId: z.string().uuid().describe('OTA release draft id.') })
const saveNoteSchema = z.object({ releaseId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), noteMarkdown: z.string().min(1), risks: z.array(riskSchema), rollout: z.enum(['full', 'canary']) })
const listSchema = z.object({ deviceModel: z.string().optional(), status: z.enum(['draft', 'ai_running', 'ai_done', 'ai_failed', 'confirmed']).optional(), limit: z.number().int().positive().max(100).optional() })

@Injectable()
@AgentMiddlewareStrategy(RELNOTE_MIDDLEWARE_NAME)
export class RelnoteMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: RelnoteService) {}
  meta: TAgentMiddlewareMeta = { name: RELNOTE_MIDDLEWARE_NAME, label: { en_US: 'OTA Release Note Review', zh_Hans: 'OTA 发布说明审核' }, description: { en_US: 'Read OTA release drafts and save AI-generated review results with optimistic revision control.', zh_Hans: '读取 OTA 发布草稿，并以乐观版本控制保存 AI 生成的审核结果。' }, icon: { type: 'font', value: 'ri-file-list-3-line' }, features: [RELNOTE_FEATURE], configSchema: { type: 'object', properties: {}, required: [] } }
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return { name: RELNOTE_MIDDLEWARE_NAME, tools: [
      tool(async (input: z.infer<typeof getDraftSchema>) => JSON.stringify(await this.service.getDraft(scope, input.releaseId)), { name: 'relnote_get_draft', description: 'Read one OTA release draft, including device model, version, raw change entries and revision. Always call this FIRST before generating a release note; pass its revision as expectedRevision to relnote_save_note.', schema: getDraftSchema }),
      tool(async (input: z.infer<typeof saveNoteSchema>) => JSON.stringify(await this.service.saveNote(scope, input as SaveRelnoteNoteInput)), { name: 'relnote_save_note', description: 'Write the generated release note, risk list and rollout suggestion back to the release draft. Requires expectedRevision from relnote_get_draft for optimistic locking. If a version conflict occurs, re-read once and retry once; do NOT create a new release.', schema: saveNoteSchema }),
      tool(async (input: z.infer<typeof listSchema>) => JSON.stringify(await this.service.listReleases(scope, input)), { name: 'relnote_list_releases', description: 'List historical OTA releases with their status. Use when the user asks about past releases of a device model.', schema: listSchema })
    ] }
  }
}
function scopeFromContext(context: IAgentMiddlewareContext): RelnoteScope { return { tenantId: context.tenantId ?? RequestContext.currentTenantId(), organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId, userId: context.userId ?? RequestContext.currentUserId(), assistantId: context.xpertId, conversationId: context.conversationId } }