import { Injectable } from '@nestjs/common'
import type { AgentMiddlewareRuntimeApi } from '@xpert-ai/plugin-sdk'
import { ClassificationError, classifyPhoto, resolveModel } from './classification.js'
import { categoryDefinitions } from './domain/categories.js'
import type { CaseDetail, FailureCode, IntakeScope } from './domain/contracts.js'
import { MODEL_TIMEOUT_MS } from './domain/evaluation.js'
import { EvaluationService } from './evaluation.service.js'
import { IntakeService } from './intake.service.js'

@Injectable()
export class IntakeAnalyzer {
  timeoutMs = MODEL_TIMEOUT_MS
  constructor(private readonly intake: IntakeService, private readonly evaluations: EvaluationService) {}

  /**
   * Classifies one case photo with the prompt currently in effect: one claim, one model call,
   * one saved outcome. The result is a suggestion only; recording the category is left to a person.
   * A failure is saved on the case so it can be seen and retried. A result that arrives after the
   * case moved on is rejected with a `conflict` error and nothing is overwritten.
   */
  async analyze(scope: IntakeScope, caseId: string, runtime: AgentMiddlewareRuntimeApi, signal?: AbortSignal): Promise<CaseDetail> {
    if (signal?.aborted) throw new ClassificationError('interrupted')
    const prompt = await this.evaluations.activePrompt(scope)
    const started = await this.intake.startAnalysis(scope, caseId)
    let failure: FailureCode | null
    try {
      const model = await resolveModel(runtime)
      const result = await classifyPhoto(runtime, model, {
        prompt: prompt.text,
        categories: categoryDefinitions(),
        loadPhoto: async () => started.photoDataUrl
      }, { signal, timeoutMs: this.timeoutMs })
      failure = result.failureCode
      if (result.output) {
        await this.intake.saveSuggestion(scope, caseId, started.revision, {
          ...result.output, model: model.model, promptSource: prompt.source
        })
      }
    } catch (error) {
      // Anything else (a rejected late result, a storage error) must not be recorded as a model failure.
      if (!(error instanceof ClassificationError)) throw error
      failure = error.code
    }
    if (failure) await this.intake.markFailed(scope, caseId, started.revision, failure)
    return this.intake.getCaseDetail(scope, caseId)
  }
}
