import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ClassificationError } from './classification.js'
import {
  ANALYZE_CASE_TOOL, EVALUATE_NEXT_TOOL, FEATURE, GET_RUN_TOOL, LIST_CASES_TOOL, LIST_RUNS_TOOL, MIDDLEWARE_NAME
} from './constants.js'
import { CATEGORIES } from './domain/categories.js'
import { caseIdSchema, IntakeError } from './domain/contracts.js'
import type { CaseDetail } from './domain/contracts.js'
import { evaluationMetrics, latestAttempt, runIdSchema } from './domain/evaluation.js'
import type { EvaluationRunDetail } from './domain/evaluation.js'
import { EvaluationRunner } from './evaluation.runner.js'
import { EvaluationService } from './evaluation.service.js'
import { IntakeAnalyzer } from './intake.analyzer.js'
import { IntakeService } from './intake.service.js'
import { scopeFromAgent } from './scope.js'

const CASE_NEXT_ACTION: Record<CaseDetail['status'], string> = {
  draft: `Call ${ANALYZE_CASE_TOOL} when the user asks to recognise this case.`,
  analyzing: 'An analysis is already running for this case. Wait for it; do not start another.',
  suggested: 'Tell the user the suggested category and the reason. Only a person can confirm or correct it, in the workbench.',
  failed: 'The analysis failed and the failure was saved on the case. Explain the failure code. ' +
    'Retry only when the user asks; a person can also choose the category without a suggestion.',
  confirmed: 'A person already confirmed this case. It is not analysed again.'
}

/** What the Assistant is told about a case after a tool call. The photo itself never enters the chat. */
export function caseReceipt(detail: CaseDetail) {
  return {
    caseId: detail.id, title: detail.title, status: detail.status, revision: detail.revision,
    suggestion: detail.suggestion && {
      categoryId: detail.suggestion.categoryId,
      categoryLabel: CATEGORIES.find(category => category.id === detail.suggestion?.categoryId)?.label ?? null,
      reason: detail.suggestion.reason,
      model: detail.suggestion.model,
      promptSource: detail.suggestion.promptSource
    },
    confirmedCategoryId: detail.confirmedCategoryId,
    failureCode: detail.failureCode,
    nextAction: CASE_NEXT_ACTION[detail.status]
  }
}

/** Compact factual receipts. Invocations, outputs and scores belong to the server. */
export function runReceipt(run: EvaluationRunDetail) {
  return {
    runId: run.id, title: run.title, status: run.status, revision: run.revision,
    model: run.snapshot.model?.model ?? null,
    pending: run.cells.filter(cell => latestAttempt(cell).status === 'pending').length,
    failed: run.cells.filter(cell => latestAttempt(cell).status === 'failed').length,
    canRecover: run.canRecover,
    metrics: { a: evaluationMetrics(run, 'a'), b: evaluationMetrics(run, 'b') },
    decision: run.decision,
    nextAction: run.status === 'ready' ? `Call ${EVALUATE_NEXT_TOOL} to process the next pending item.`
      : run.status === 'running' ? 'Another call is running. Wait; use the workbench to recover an expired attempt.'
        : 'Review results in the workbench. Only the human can authorize retries and save an adoption decision.'
  }
}

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class PhotoIntakeMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Photo intake', zh_Hans: '拍照受理' },
    description: {
      en_US: 'Classify the photo of an intake case into a category suggestion, and run prompt acceptance on confirmed cases.',
      zh_Hans: '识别受理单照片并给出类别建议；用已确认的受理单验收提示词改动。'
    },
    icon: { type: 'font', value: 'ri-camera-lens-line' },
    features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
  constructor(
    private readonly intake: IntakeService,
    private readonly analyzer: IntakeAnalyzer,
    private readonly service: EvaluationService,
    private readonly runner: EvaluationRunner
  ) {}

  getToolNames() { return [LIST_CASES_TOOL, ANALYZE_CASE_TOOL, LIST_RUNS_TOOL, GET_RUN_TOOL, EVALUATE_NEXT_TOOL] }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope = scopeFromAgent(context)
    return {
      name: MIDDLEWARE_NAME,
      tools: [
        tool(async () => JSON.stringify(await this.intake.listCases(scope)), {
          name: LIST_CASES_TOOL,
          description: 'List the current user\'s recent intake cases with status, suggested and confirmed category ids. Read-only.',
          schema: z.object({}).strict(), verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'List intake cases', zh_Hans: '查看受理单' } }
        }),
        tool(async ({ caseId }, config) => {
          try {
            const detail = await this.analyzer.analyze(scope, caseId, context.runtime, config?.signal)
            return JSON.stringify({ success: detail.status === 'suggested', ...caseReceipt(detail) })
          } catch (error) {
            return JSON.stringify({
              success: false, caseId,
              code: error instanceof IntakeError || error instanceof ClassificationError ? error.code : 'execution_failed',
              nextAction: 'Nothing was saved and no result was fabricated. Explain the code to the user. Do not loop on this error.'
            })
          }
        }, {
          name: ANALYZE_CASE_TOOL,
          description: 'Make ONE real paid image-model call on the stored photo of an intake case and save the result ' +
            'as a category suggestion with a reason. Use only when the user asks to recognise or re-recognise that case. ' +
            'The server loads the photo and the prompt in effect; you never see the photo. A failure is saved on the ' +
            'case and can be retried on request. The suggestion is not a decision: only a person confirms the category. ' +
            'Never state a category the tool did not return.',
          schema: caseIdSchema, verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Recognise case photo', zh_Hans: '识别受理单照片' } }
        }),
        tool(async ({ page }) => JSON.stringify(await this.service.list(scope, page)), {
          name: LIST_RUNS_TOOL,
          description: 'List saved prompt A/B acceptance runs for the current user and Assistant.',
          schema: z.object({ page: z.number().int().min(1).max(10000).default(1) }).strict(),
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'List acceptance runs', zh_Hans: '查看验收记录' } }
        }),
        tool(async ({ runId }) => JSON.stringify(runReceipt(await this.service.get(scope, runId))), {
          name: GET_RUN_TOOL,
          description: 'Read measured A/B results and progress for an acceptance run id from the workbench or list tool.',
          schema: runIdSchema, verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Read acceptance run', zh_Hans: '查看验收进度' } }
        }),
        tool(async ({ runId }, config) => {
          try {
            const run = await this.runner.next(scope, runId, context.runtime, config?.signal)
            return JSON.stringify({ success: true, ...runReceipt(run) })
          } catch (error) {
            return JSON.stringify({
              success: false, runId,
              code: error instanceof IntakeError || error instanceof ClassificationError ? error.code : 'execution_failed',
              nextAction: 'No result was fabricated. Refresh the workbench; check the configured primary vision model. Do not loop on this error.'
            })
          }
        }, {
          name: EVALUATE_NEXT_TOOL,
          description: 'Make ONE real paid image-model call for the next pending A/B item in a saved acceptance run. ' +
            'Use only when the user requests to run or continue that run. The server freezes configuration, ' +
            'saves original output, scores against the categories people confirmed and returns remaining count. ' +
            'For an authorized run, repeat while pending > 0 and status is ready. Failed items are retained; ' +
            'only a human workbench action can schedule their retry. Never generate replacement results yourself.',
          schema: runIdSchema, verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Run next acceptance item', zh_Hans: '运行下一项验收' } }
        })
      ]
    }
  }
}
