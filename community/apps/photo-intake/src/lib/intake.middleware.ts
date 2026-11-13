import type { BaseMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Injectable, Logger } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy, mergeModelRequirements, ToolImagesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import type {
  AgentMiddleware,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  ToolImagesApi
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  ANALYZE_CASE_TOOL,
  FEATURE,
  LIST_CATEGORIES_TOOL,
  MIDDLEWARE_NAME,
  SUBMIT_SUGGESTIONS_TOOL
} from './constants.js'
import { CATEGORIES, CATEGORY_IDS } from './domain/categories.js'
import { caseIdSchema, IntakeError, submitSuggestionsSchema } from './domain/contracts.js'
import type { IntakeScope } from './domain/contracts.js'
import { IntakeService } from './intake.service.js'
import { scopeFromAgent } from './scope.js'

const logger = new Logger('PhotoIntakeMiddleware')

export interface OpenAnalysis {
  caseId: string
  revision: number
}

function textOf(message: BaseMessage) {
  return typeof message.content === 'string' ? message.content : ''
}

function parseRecord(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function toolStatus(message: BaseMessage) {
  return 'status' in message ? message.status : undefined
}

/**
 * Analyses opened by this user turn whose suggestions have not been saved yet.
 * Only messages after the latest human message count, so older turns are never re-failed.
 */
export function findOpenAnalyses(messages: BaseMessage[]): OpenAnalysis[] {
  let start = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].getType() === 'human') {
      start = index + 1
      break
    }
  }
  const open = new Map<string, OpenAnalysis>()
  for (const message of messages.slice(start)) {
    if (message.getType() !== 'tool' || toolStatus(message) === 'error') continue
    const record = parseRecord(textOf(message))
    if (!record || typeof record.caseId !== 'string') continue
    if (message.name === ANALYZE_CASE_TOOL && typeof record.revision === 'number') {
      open.set(record.caseId, { caseId: record.caseId, revision: record.revision })
    } else if (message.name === SUBMIT_SUGGESTIONS_TOOL && record.success === true) {
      open.delete(record.caseId)
    }
  }
  return [...open.values()]
}

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class PhotoIntakeMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Photo intake', zh_Hans: '拍照受理' },
    description: {
      en_US: 'Enable the photo intake workbench and its analysis tools.',
      zh_Hans: '启用拍照受理工作台和识别工具。'
    },
    icon: { type: 'font', value: 'ri-camera-lens-line' },
    features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }

  constructor(private readonly service: IntakeService) {}

  getToolNames() {
    return [LIST_CATEGORIES_TOOL, ANALYZE_CASE_TOOL, SUBMIT_SUGGESTIONS_TOOL]
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    // Fail at binding time when the host gives no usable identity, not on first tool call.
    const scope = scopeFromAgent(context)
    const images = () => context.runtime?.capabilities?.get(ToolImagesRuntimeCapability)
    return {
      name: MIDDLEWARE_NAME,
      tools: [
        this.listCategoriesTool(),
        this.analyzeCaseTool(scope, images),
        this.submitSuggestionsTool(scope)
      ],
      wrapModelCall: async (request, handler) => {
        const api = images()
        if (!api) return handler(request)
        const open = findOpenAnalyses(request.messages)
        try {
          // The host turns this round's image references into a temporary message and adds a
          // vision requirement, so a text-only model fails loudly instead of guessing.
          const projected = await api.prepareModelInput(request.messages, [ANALYZE_CASE_TOOL])
          return await handler({
            ...request,
            messages: projected.messages,
            requirements: mergeModelRequirements(request.requirements, projected.requirements)
          })
        } catch (error) {
          // The model never answered, so no suggestion can arrive for these analyses.
          for (const analysis of open) {
            await this.service.markFailed(scope, analysis.caseId, analysis.revision, 'model_call_failed')
              .catch(markError => logger.warn(`Could not mark case failed: ${String(markError)}`))
          }
          throw error
        }
      },
      afterAgent: async state => {
        // The run ended without saving suggestions (for example the model only replied in text),
        // so close the analysis now instead of leaving it to go stale.
        const messages: BaseMessage[] = Array.isArray(state?.messages) ? state.messages : []
        for (const analysis of findOpenAnalyses(messages)) {
          await this.service.markFailed(scope, analysis.caseId, analysis.revision, 'no_suggestion')
            .catch(markError => logger.warn(`Could not close analysis: ${String(markError)}`))
        }
        return undefined
      }
    }
  }

  private listCategoriesTool() {
    return tool(async () => JSON.stringify({ categories: CATEGORIES }), {
      name: LIST_CATEGORIES_TOOL,
      description:
        'List the allowed categories for a reported issue, each with an id, labels and a definition. Answer only with ids from this list.',
      schema: z.object({}).strict(),
      verboseParsingErrors: true,
      metadata: { toolName: { en_US: 'List categories', zh_Hans: '查看类别表' } }
    })
  }

  private analyzeCaseTool(scope: IntakeScope, images: () => ToolImagesApi | undefined) {
    return tool(
      async ({ caseId }) => {
        const api = images()
        if (!api) throw new Error('IMAGE_CAPABILITY_UNAVAILABLE: this Xpert host cannot show images to the model.')
        let started
        try {
          started = await this.service.startAnalysis(scope, caseId)
        } catch (error) {
          // A thrown error becomes an error tool result, which carries no image by design.
          if (error instanceof IntakeError) throw new Error(`${error.code.toUpperCase()}: ${error.message}`)
          throw error
        }
        let presentation
        try {
          presentation = await api.save({
            buffer: started.photo.buffer,
            mimeType: started.photo.mimeType as Parameters<ToolImagesApi['save']>[0]['mimeType'],
            title: started.title
          })
        } catch (error) {
          await this.service.markFailed(scope, started.caseId, started.revision, 'image_unavailable')
          throw error
        }
        const summary = {
          caseId: started.caseId,
          revision: started.revision,
          title: started.title,
          allowedCategoryIds: CATEGORY_IDS,
          message:
            `The photo of "${started.title}" is attached. Look at it, then call ${SUBMIT_SUGGESTIONS_TOOL} ` +
            `with this caseId and revision ${started.revision}. Use "unclear" if the photo does not show enough.`
        }
        return [JSON.stringify(summary), presentation]
      },
      {
        name: ANALYZE_CASE_TOOL,
        description:
          `Open one intake case for analysis and attach its photo to your next step. Call this first for every case you are asked to recognise, then call ${SUBMIT_SUGGESTIONS_TOOL} with the returned revision. Calling it again for a case under analysis returns the same revision.`,
        schema: z.object({ caseId: caseIdSchema }).strict(),
        responseFormat: 'content_and_artifact',
        verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Open case photo', zh_Hans: '查看受理单照片' } }
      }
    )
  }

  private submitSuggestionsTool(scope: IntakeScope) {
    return tool(
      async input => {
        try {
          const saved = await this.service.submitSuggestions(scope, input)
          return JSON.stringify({
            success: true,
            caseId: saved.id,
            status: saved.status,
            revision: saved.revision,
            message: 'Suggestions were saved. A person will confirm or correct the category in the workbench.'
          })
        } catch (error) {
          if (!(error instanceof IntakeError)) throw error
          return JSON.stringify({
            success: false,
            caseId: input.caseId,
            code: error.code,
            message: error.message,
            nextAction:
              error.code === 'unknown_category'
                ? 'Retry with ids from the allowed list.'
                : `Call ${ANALYZE_CASE_TOOL} again for this case and use the revision it returns.`
          })
        }
      },
      {
        name: SUBMIT_SUGGESTIONS_TOOL,
        description:
          `Save one to three category suggestions for a case you opened with ${ANALYZE_CASE_TOOL} in this turn. Base every reason on what is visible in the photo. This does not confirm the category; a person does that.`,
        schema: submitSuggestionsSchema,
        verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Save suggestions', zh_Hans: '保存类别建议' } }
      }
    )
  }
}
