import { Injectable } from '@nestjs/common'
import type { AgentMiddlewareRuntimeApi } from '@xpert-ai/plugin-sdk'
import { ClassificationError, classifyPhoto, resolveModel } from './classification.js'
import type { IntakeScope } from './domain/contracts.js'
import { MODEL_TIMEOUT_MS } from './domain/evaluation.js'
import { EvaluationService } from './evaluation.service.js'
import { IntakeService } from './intake.service.js'

@Injectable()
export class EvaluationRunner {
  timeoutMs = MODEL_TIMEOUT_MS
  constructor(private readonly service: EvaluationService, private readonly intake: IntakeService) {}

  /** Processes at most one pending item of a run: one claim, one model call, one saved attempt. */
  async next(scope: IntakeScope, runId: string, runtime: AgentMiddlewareRuntimeApi, signal?: AbortSignal) {
    const current = await this.service.get(scope, runId)
    if (current.status !== 'ready') return current
    if (signal?.aborted) throw new ClassificationError('interrupted')
    // The first call freezes the model for the whole run, so A and B are always compared on the same one.
    const claim = await this.service.claim(scope, runId, current.snapshot.model ?? await resolveModel(runtime))
    if (!claim) return this.service.get(scope, runId)
    const { run, cell, attempt } = claim
    const sample = run.snapshot.samples.find(item => item.id === cell.sampleId)!
    const result = await classifyPhoto(runtime, run.snapshot.model!, {
      prompt: run.snapshot.prompts[cell.variant],
      categories: run.snapshot.categories,
      loadPhoto: async () => {
        const stored = await this.intake.evaluationSample(scope, cell.sampleId)
        // The run compares versions on the image it was created with, not on a replaced one.
        if (stored.sample.sha256 !== sample.sha256) throw new ClassificationError('photo_missing')
        return stored.photoDataUrl
      }
    }, { signal, timeoutMs: this.timeoutMs })
    return this.service.finish(scope, runId, attempt.id, {
      ...attempt,
      status: result.output ? 'succeeded' : 'failed',
      rawOutput: result.rawOutput,
      rawOutputTruncated: result.rawOutputTruncated,
      output: result.output,
      failureCode: result.failureCode,
      usage: result.usage,
      latencyMs: result.latencyMs,
      finishedAt: this.service.now().toISOString()
    })
  }
}
