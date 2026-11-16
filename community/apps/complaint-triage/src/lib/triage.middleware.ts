import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { FEATURE, MIDDLEWARE_NAME, TOOL_GET_TICKET, TOOL_NAMES, TOOL_REPORT_FAILURE, TOOL_SAVE_ANALYSIS } from './constants.js'
import { TriageError, getTicketSchema, reportFailureSchema, saveAnalysisSchema } from './domain/contracts.js'
import { scopeFromAgent } from './scope.js'
import { ComplaintTriageService } from './triage.service.js'

type EmptyOptions = Record<string, never>

// The Assistant's only way to touch tickets. Activating this middleware also activates the Workbench
// view through FEATURE, so an Assistant either has the whole triage desk or none of it.
@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class ComplaintTriageMiddleware implements IAgentMiddlewareStrategy<EmptyOptions> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Complaint triage desk', zh_Hans: '客诉分诊台' },
    description: {
      en_US: 'Enables the triage workbench and the tools that read a complaint and save an analysis for human review.',
      zh_Hans: '启用客诉分诊工作台，以及读取客诉、保存待人工确认分析结果的工具。'
    },
    icon: { type: 'font', value: 'ri-customer-service-2-line' },
    features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }

  constructor(private readonly service: ComplaintTriageService) {}

  getToolNames() {
    return [...TOOL_NAMES]
  }

  createMiddleware(_options: EmptyOptions, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope = scopeFromAgent(context)
    // Tool results are compact JSON strings: ids, status and the next step. A domain error becomes a
    // structured result the model can act on; anything else is a real fault and propagates.
    const run = async (work: () => Promise<object>) => {
      try {
        return JSON.stringify(await work())
      } catch (error) {
        if (error instanceof TriageError) {
          return JSON.stringify({ success: false, code: error.code, retryable: false, message: 'The ticket changed meanwhile. Nothing was saved.' })
        }
        throw error
      }
    }

    return {
      name: MIDDLEWARE_NAME,
      tools: [
        tool((input) => run(() => this.service.openTicketForAgent(scope, input.ticketNo)), {
          name: TOOL_GET_TICKET,
          description:
            'Step 1. Open a complaint ticket for triage. Returns the complaint as numbered sentences (s1, s2, ...) and the company triage policy. Always call this before complaint_save_analysis, and cite evidence only by these sentence ids.',
          schema: getTicketSchema,
          verboseParsingErrors: true
        }),
        tool((input) => run(() => this.service.saveAnalysis(scope, input)), {
          name: TOOL_SAVE_ANALYSIS,
          description:
            'Step 2. Save your triage of the ticket as a suggestion for human review. Grade category and severity strictly by the policy from complaint_get_ticket. Evidence is cited by sentence id only; the server restores the quotes. Call once per ticket; the result is never final until a human confirms it in the workbench.',
          schema: saveAnalysisSchema,
          verboseParsingErrors: true
        }),
        tool((input) => run(() => this.service.reportFailure(scope, input)), {
          name: TOOL_REPORT_FAILURE,
          description:
            'Use instead of complaint_save_analysis when the text cannot be triaged (not a complaint, unreadable, or too little information). Records the reason on the ticket so the user can fix the input and retry.',
          schema: reportFailureSchema,
          verboseParsingErrors: true
        })
      ]
    }
  }
}
