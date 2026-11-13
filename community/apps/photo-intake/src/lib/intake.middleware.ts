import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { EVALUATE_NEXT_TOOL, FEATURE, GET_RUN_TOOL, LIST_RUNS_TOOL, MIDDLEWARE_NAME } from './constants.js'
import { IntakeError } from './domain/contracts.js'
import { evaluationMetrics, latestAttempt, runIdSchema } from './domain/evaluation.js'
import type { EvaluationRunDetail } from './domain/evaluation.js'
import { EvaluationCallError, EvaluationRunner } from './evaluation.runner.js'
import { EvaluationService } from './evaluation.service.js'
import { scopeFromAgent } from './scope.js'

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
    label: { en_US: 'Image version acceptance', zh_Hans: '图片分类版本验收' },
    description: {
      en_US: 'Run independent A/B image classifications and read saved evaluation results.',
      zh_Hans: '独立运行 A/B 图片分类，读取已保存的评测结果。'
    },
    icon: { type: 'font', value: 'ri-camera-lens-line' },
    features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
  constructor(private readonly service: EvaluationService, private readonly runner: EvaluationRunner) {}

  getToolNames() { return [LIST_RUNS_TOOL, GET_RUN_TOOL, EVALUATE_NEXT_TOOL] }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope = scopeFromAgent(context)
    return {
      name: MIDDLEWARE_NAME,
      tools: [
        tool(async ({ page }) => JSON.stringify(await this.service.list(scope, page)), {
          name: LIST_RUNS_TOOL,
          description: 'List saved image-classification A/B evaluations for the current user and Assistant.',
          schema: z.object({ page: z.number().int().min(1).max(10000).default(1) }).strict(),
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'List evaluations', zh_Hans: '查看验收记录' } }
        }),
        tool(async ({ runId }) => JSON.stringify(runReceipt(await this.service.get(scope, runId))), {
          name: GET_RUN_TOOL,
          description: 'Read measured A/B results and progress for an evaluation id from the workbench or list tool.',
          schema: runIdSchema, verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Read evaluation', zh_Hans: '查看验收进度' } }
        }),
        tool(async ({ runId }, config) => {
          try {
            const run = await this.runner.next(scope, runId, context.runtime, config?.signal)
            return JSON.stringify({ success: true, ...runReceipt(run) })
          } catch (error) {
            return JSON.stringify({
              success: false, runId,
              code: error instanceof IntakeError || error instanceof EvaluationCallError ? error.code : 'execution_failed',
              nextAction: 'No result was fabricated. Refresh the workbench; check the configured primary vision model. Do not loop on this error.'
            })
          }
        }, {
          name: EVALUATE_NEXT_TOOL,
          description: 'Make ONE real paid image-model call for the next pending A/B item in a saved evaluation. ' +
            'Use only when the user requests to run or continue that evaluation. The server freezes configuration, ' +
            'saves original output, scores against hidden references and returns remaining count. ' +
            'For an authorized run, repeat while pending > 0 and status is ready. Failed items are retained; ' +
            'only a human workbench action can schedule their retry. Never generate replacement results yourself.',
          schema: runIdSchema, verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Evaluate next image', zh_Hans: '运行下一项图片评测' } }
        })
      ]
    }
  }
}
