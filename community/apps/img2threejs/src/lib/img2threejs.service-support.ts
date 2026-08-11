import { createHash } from 'node:crypto'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull, type FindOptionsWhere } from 'typeorm'
import { BUILD_STAGES } from './constants.js'
import { assertBaseRevision, nextBuildStage, stableCursor } from './domain/pipeline.js'
import type {
  ReferenceCameraFrameCorrectionHint,
  SculptSpec
} from './domain/sculpt-spec.schema.js'
import type {
  BuildStage,
  HumanReviewStatus,
  NextDecision,
  Scope,
  StageGateResult
} from './domain/types.js'
import { ModelProjectEntity, PipelineRunEntity } from './entities/index.js'

const CONCURRENCY_CONTROL_FIELDS = new Set([
  'revision',
  'runRevision',
  'projectRevision',
  'baseRevision',
  'expectedRevision',
  'nextActionInput',
  'recoveredFromExpectedRevision',
  'revisionRecovery'
])

/**
 * Keep optimistic-lock counters private to the service. Callers should operate
 * on stable resource ids and let the service resolve the current entity state.
 */
export function stripConcurrencyControlFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripConcurrencyControlFields(item)) as T
  }
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
    return value
  }
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!CONCURRENCY_CONTROL_FIELDS.has(key)) {
      output[key] = stripConcurrencyControlFields(item)
    }
  }
  return output as T
}

export type RunStatusDto = {
  projectId: string
  currentSpecVersionId: string | null
  currentCodeVersionId: string | null
  runId: string | null
  revision: number
  runRevision: number | null
  status: string
  currentStage: BuildStage | null
  completedStages: BuildStage[]
  deterministicStatus: string
  visualStatus: string
  humanReviewStatus: string
  nextDecision: NextDecision
  failureCodes: string[]
  deterministicFailures: Array<{ code: string; detail: string }>
  specCorrectionHints: ReferenceCameraFrameCorrectionHint[]
  assistantCodeCandidate: {
    sourceFilePath: string
    sourceSha256: string
    size: number
  } | null
  cursor: string
  nextAction: string
}

export function statusDto(
  project: ModelProjectEntity,
  run: PipelineRunEntity | null,
  currentCodeReady = Boolean(project.currentCodeVersionId),
  currentCodeFailures: Array<{ code: string; detail: string }> = [],
  specCorrectionHints: ReferenceCameraFrameCorrectionHint[] = []
): RunStatusDto {
  // A newly persisted Sculpt Spec invalidates the previous run even before a
  // replacement run is enqueued. Never surface completed stages, artifacts, or
  // review state from a run that belongs to an older Spec version.
  const currentRun =
    run && project.currentSpecVersionId && run.specVersionId === project.currentSpecVersionId
      ? run
      : null
  const cursor = currentRun
    ? runCursor(currentRun)
    : stableCursor({ status: project.status, revision: project.revision, stageResults: [], failureCodes: project.failureReasons })
  return {
    projectId: project.id,
    currentSpecVersionId: project.currentSpecVersionId,
    currentCodeVersionId: project.currentCodeVersionId,
    runId: currentRun?.id ?? null,
    revision: project.revision,
    runRevision: currentRun?.revision ?? null,
    status: currentRun?.status ?? project.status,
    currentStage: currentRun?.currentStage ?? null,
    completedStages: currentRun?.stageResults.filter((item) => item.status === 'passed').map((item) => item.stage) ?? [],
    deterministicStatus: currentRun?.deterministicReview.status ?? 'not_run',
    visualStatus: currentRun?.visualReview.status ?? 'unavailable',
    humanReviewStatus: currentRun?.humanReviewStatus ?? project.humanReviewStatus,
    nextDecision: currentRun?.nextDecision ?? project.nextDecision,
    failureCodes: currentRun?.failureReasons.slice(0, 20) ?? project.failureReasons.slice(0, 20),
    deterministicFailures: currentRun
      ? currentRun.deterministicReview.checks
        .filter((item) => !item.passed)
        .map(({ code, detail }) => ({ code, detail }))
      : currentCodeFailures,
    specCorrectionHints,
    assistantCodeCandidate: null,
    cursor,
    nextAction: currentRun ? runNextAction(currentRun) : projectNextAction(project, currentCodeReady)
  }
}

export function runCursor(run: PipelineRunEntity): string {
  return stableCursor({
    status: run.status,
    revision: run.revision,
    stageResults: run.stageResults,
    failureCodes: run.failureReasons
  })
}

export function scopedIdWhere<T extends { id: string; tenantId: string; organizationId: string | null }>(
  scope: Scope,
  id: string
): FindOptionsWhere<T> {
  return {
    id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? IsNull()
  } as FindOptionsWhere<T>
}

export function scopedRevisionWhere<T extends { id: string; tenantId: string; organizationId: string | null; revision: number }>(
  scope: Scope,
  id: string,
  revision: number
): FindOptionsWhere<T> {
  return { ...scopedIdWhere<T>(scope, id), revision }
}

export function scopedProjectWhere<T extends { projectId: string; tenantId: string; organizationId: string | null }>(
  scope: Scope,
  projectId: string
): FindOptionsWhere<T> {
  return {
    projectId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? IsNull()
  } as FindOptionsWhere<T>
}

export function scopeFields(scope: Scope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    platformProjectId: scope.projectId,
    xpertId: scope.xpertId,
    createdById: scope.userId
  }
}

export function requireRevision(actual: number, expected: number): void {
  assertBaseRevision(actual, expected)
}

export function revisionConflict(currentRevision?: number): Error {
  return new Error(`REVISION_CONFLICT${currentRevision === undefined ? '' : `:${currentRevision}`}`)
}

export function normalizeImageMime(mimeType: string, filePath: string, buffer?: Buffer): string {
  if (['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) return mimeType
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (buffer && buffer.length >= 12) {
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return 'image/png'
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg'
    }
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      return 'image/webp'
    }
  }
  return mimeType
}

export function readImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
    if (buffer.toString('ascii', 12, 16) === 'VP8X') {
      return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) }
    }
  }
  if (mimeType === 'image/jpeg' && buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = buffer[offset + 1]
      const length = buffer.readUInt16BE(offset + 2)
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
      }
      if (length < 2) break
      offset += 2 + length
    }
  }
  return null
}

export function sha256Json(value: SculptSpec): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function mergeStageResult(results: StageGateResult[], result: StageGateResult): StageGateResult[] {
  return [...results.filter((item) => item.stage !== result.stage), result]
    .sort((left, right) => BUILD_STAGES.indexOf(left.stage) - BUILD_STAGES.indexOf(right.stage))
}

export function averageStageScore(results: StageGateResult[]): number {
  return results.length ? results.reduce((total, result) => total + result.score, 0) / results.length : 0
}

export function validateReviewDecision(
  run: PipelineRunEntity,
  review: HumanReviewStatus,
  decision: NextDecision
): void {
  if (!['review_required', 'failed'].includes(run.status)) throw new Error('REVIEW_NOT_ALLOWED')
  if (review === 'approved' && !['continue', 'stop'].includes(decision)) throw new Error('REVIEW_DECISION_MISMATCH')
  validateApprovedReviewEvidence(run, review)
  if (review === 'changes_requested' && !['refine-spec', 'refine-code', 'request-input'].includes(decision)) {
    throw new Error('REVIEW_DECISION_MISMATCH')
  }
  if (review === 'rejected' && decision !== 'stop') throw new Error('REVIEW_DECISION_MISMATCH')
}

export function validateApprovedReviewEvidence(
  run: PipelineRunEntity,
  review: HumanReviewStatus
): void {
  if (review === 'approved') {
    if (
      run.renderReport?.status !== 'succeeded' ||
      run.visualReview?.renderStatus !== 'succeeded' ||
      !run.visualReview?.comparisonAsset
    ) {
      throw new Error('VISUAL_REVIEW_APPROVAL_REQUIRES_BROWSER_RENDER')
    }
    if (run.renderReport.quality?.passed !== true) {
      const failureCodes = run.renderReport.quality?.failureCodes?.length
        ? run.renderReport.quality.failureCodes.join(',')
        : run.failureReasons.join(',') || 'unknown_reference_fidelity_failure'
      throw new Error(
        `REFERENCE_FIDELITY_GATE_BLOCKED: failureCodes=${failureCodes}; ` +
        'inspect img2threejs_read_visual_diagnostics and submit changes_requested with refine-code or refine-spec'
      )
    }
  }
}

export function isTransientWorkspaceInputVisibilityFailure(
  failure: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  return failure?.code === 'EXPORT_INPUT_INVALID' &&
    /Unable to read [^:]+:\s*(?:Conversation|Workspace) file not found/i.test(failure.message ?? '')
}

export function isAssistantSourceBuildFailure(
  failure: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (failure?.code !== 'SANDBOX_START_FAILED') return false
  return /(?:Build failed|Could not resolve|model\/model\.ts|Module not found|Syntax error)/i.test(
    failure.message ?? ''
  )
}

export function decisionToNextAction(decision: NextDecision): string {
  const mapping: Record<NextDecision, string> = {
    continue: 'enqueue_next_stage',
    'refine-spec': 'patch_spec_or_update_spec',
    'refine-code': 'read_visual_diagnostics_then_refine_code',
    'request-input': 'submit_images',
    stop: 'reply_summary'
  }
  return mapping[decision]
}

export function runNextAction(run: PipelineRunEntity): string {
  if (run.status === 'queued' || run.status === 'running') return 'wait_run'
  if (run.status === 'failed') {
    // A stage worker/infrastructure failure leaves passed stages intact and is
    // recoverable by retrying that immutable run. Semantic failures set an
    // explicit refine decision and continue to route to the Agent.
    if (run.nextDecision === 'continue') return 'retry_run'
    return decisionToNextAction(run.nextDecision)
  }
  if (run.status === 'completed' || run.status === 'cancelled') return 'reply_summary'
  if (run.renderReport?.status === 'failed') {
    const failure = run.renderReport.failure
    // A later retry can overwrite the detailed build report with a transient
    // Workspace visibility error. Preserve the safer refinement route whenever
    // this immutable run has already recorded a Sandbox/source failure.
    if (run.failureReasons.includes('SANDBOX_START_FAILED')) {
      return 'read_visual_diagnostics_then_refine_code'
    }
    if (isAssistantSourceBuildFailure(failure)) return 'read_visual_diagnostics_then_refine_code'
    if (failure?.retryable === true || isTransientWorkspaceInputVisibilityFailure(failure)) return 'retry_run'
    return 'read_visual_diagnostics_then_refine_code'
  }
  if (
    run.status === 'review_required' &&
    (run.humanReviewStatus === 'approved' || run.humanReviewStatus === 'changes_requested')
  ) {
    return decisionToNextAction(run.nextDecision)
  }
  return nextBuildStage(run.stageResults) ? 'enqueue_next_stage' : 'submit_review'
}

function projectNextAction(project: ModelProjectEntity, currentCodeReady: boolean): string {
  if (project.status === 'awaiting_images') return 'submit_images'
  if (project.status === 'awaiting_spec') return 'update_spec'
  if (project.status === 'spec_ready') return currentCodeReady ? 'enqueue_stage' : 'author_code'
  return decisionToNextAction(project.nextDecision)
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('ABORTED'))
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function scopeFromRequestContext(): Scope {
  return {
    tenantId: RequestContext.currentTenantId(),
    organizationId: RequestContext.getOrganizationId(),
    userId: RequestContext.currentUserId(),
    workspaceId: null,
    projectId: null,
    xpertId: null
  }
}

export type AssetSummary = {
  name: string
  mimeType: string
  size: number
  sha256: string
}

export function summarizeAsset(
  asset: { name: string; mimeType: string; size: number; sha256: string } | null
): AssetSummary | null {
  return asset
    ? {
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
        sha256: asset.sha256
      }
    : null
}
