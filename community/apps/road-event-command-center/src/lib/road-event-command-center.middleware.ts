import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { ICopilotModel, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { FEATURE, MIDDLEWARE_NAME } from './constants.js'
import { recommendationOutputSchema } from './domain/draft.js'
import { RoadEventCommandCenterDraftService, type DraftScope } from './road-event-command-center-draft.service.js'

/** Binds the road-event workbench feature to Assistants created from this plugin's template. */
@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class RoadEventCommandCenterMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly drafts: RoadEventCommandCenterDraftService) {}

  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Road event workspace', zh_Hans: '道路事件工作台' },
    description: {
      en_US: 'Enables the road-event draft workbench.',
      zh_Hans: '启用道路事件草稿工作台。'
    },
    features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }

  getToolNames() {
    return ['generate_road_event_recommendation']
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope: DraftScope = {
      tenantId: context.tenantId,
      organizationId: context.organizationId ?? '',
      workspaceId: context.workspaceId ?? '',
      userId: context.userId,
      xpertId: context.xpertId ?? ''
    }
    return {
      name: MIDDLEWARE_NAME,
      tools: [tool(async (_input, config) => {
        const current = await this.drafts.get(scope)
        if (!current.draft) throw new Error('road_event_draft_required')
        const attemptedAt = new Date().toISOString()
        try {
          const copilotModel = config.configurable?.copilotModel as ICopilotModel | undefined
          if (!copilotModel) throw new Error('model_unavailable')
          const model = await context.runtime.createModelClient(copilotModel, { purpose: 'invoke' })
          if (!('withStructuredOutput' in model) || typeof model.withStructuredOutput !== 'function') {
            throw new Error('model_unavailable')
          }
          const structuredModel = model.withStructuredOutput(recommendationOutputSchema)
          const recommendation = recommendationOutputSchema.parse(await structuredModel.invoke([
            new SystemMessage('You are a road incident response analyst. Produce practical, cautious recommendations for a human duty officer. Never claim that emergency services have been contacted, never dispatch resources, and clearly state uncertainty. Return only the requested structured fields.'),
            new HumanMessage(JSON.stringify({
              event: current.draft,
              instruction: 'Assess the event and propose an initial response plan. Prioritize immediate safety, traffic control, verification, and escalation when appropriate.'
            }))
          ], { signal: config.signal }))
          const modelName = copilotModel.model ?? copilotModel.referencedModel?.model ?? 'Assistant chat model'
          const saved = {
            ...current.draft,
            recommendation: { ...recommendation, generatedAt: attemptedAt, model: modelName },
            recommendationAttempt: { status: 'succeeded' as const, attemptedAt },
            confirmation: null
          }
          const receipt = await this.drafts.save(scope, { expectedRevision: current.revision, draft: saved })
          return JSON.stringify({
            success: true,
            revision: receipt.revision,
            recommendation: saved.recommendation,
            message: 'Recommendation generated with the Assistant chat model and saved to the road-event draft. The duty officer must review it; no dispatch was made.'
          })
        } catch (error) {
          const errorCode = error instanceof Error && error.message === 'model_unavailable'
            ? 'model_unavailable' as const
            : error instanceof z.ZodError ? 'invalid_output' as const : 'model_error' as const
          const failedDraft = {
            ...current.draft,
            recommendationAttempt: { status: 'failed' as const, attemptedAt, errorCode }
          }
          const receipt = await this.drafts.save(scope, { expectedRevision: current.revision, draft: failedDraft })
          return JSON.stringify({
            success: false,
            retryable: true,
            code: errorCode,
            revision: receipt.revision,
            message: 'Recommendation generation failed and the failure status was saved. The user may explicitly ask to retry. No dispatch was made.'
          })
        }
      }, {
        name: 'generate_road_event_recommendation',
        schema: z.object({}).strict(),
        verboseParsingErrors: true,
        description: 'Generate and persist a structured, human-reviewable response recommendation for the current saved road-event draft using this Assistant’s configured chat model. Call only when the user asks to generate or retry a recommendation. Never dispatch resources or represent the recommendation as human-approved.'
      })]
    }
  }
}
