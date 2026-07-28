import { createHash } from 'node:crypto'
import type { BrowserRenderReport, NextDecision } from './types.js'

type Quality = NonNullable<BrowserRenderReport['quality']>
type Correction = NonNullable<BrowserRenderReport['correction']>

export type RenderGateOutcome = {
  passed: boolean
  failureCodes: string[]
  nextDecision: NextDecision
  correction: Correction
}

export function deriveRenderGateOutcome(
  quality: Quality,
  maximumIterations: number,
  previous?: BrowserRenderReport | null
): RenderGateOutcome {
  const failureCodes = [...new Set(quality.failureCodes ?? [])].sort()
  const passed = quality.passed && failureCodes.length === 0
  const previousCorrection = previous?.correction
  const iteration = Math.min(maximumIterations, (previousCorrection?.iteration ?? 0) + 1)
  const defectSignature = defectHash(failureCodes)
  const repeatedDefectCount = !passed && previousCorrection?.defectSignature === defectSignature
    ? previousCorrection.repeatedDefectCount + 1
    : passed ? 0 : 1
  const previousScore = previous?.quality ? aggregateScore(previous.quality) : null
  const currentScore = aggregateScore(quality)
  const plateauCount = !passed && previousScore !== null && currentScore - previousScore < 0.015
    ? (previousCorrection?.plateauCount ?? 0) + 1
    : 0

  let terminalReason: Correction['terminalReason']
  let nextDecision: NextDecision
  if (passed) {
    terminalReason = 'success'
    nextDecision = 'continue'
  } else if (iteration >= maximumIterations) {
    terminalReason = 'hard_ceiling'
    nextDecision = 'request-input'
  } else if (repeatedDefectCount >= 3) {
    terminalReason = 'repeated_defect'
    nextDecision = 'request-input'
  } else if (plateauCount >= 2) {
    terminalReason = 'plateau'
    nextDecision = 'request-input'
  } else {
    nextDecision = routeFailure(failureCodes)
  }

  return {
    passed,
    failureCodes,
    nextDecision,
    correction: {
      iteration,
      maximumIterations,
      defectSignature,
      repeatedDefectCount,
      plateauCount,
      ...(terminalReason ? { terminalReason } : {}),
      recommendedDecision: nextDecision
    }
  }
}

function routeFailure(failureCodes: string[]): NextDecision {
  if (
    failureCodes.includes('reference_mask_low_confidence') ||
    failureCodes.includes('reference_view_missing')
  ) {
    return 'request-input'
  }
  if (
    failureCodes.includes('reference_camera_alignment_failed') ||
    failureCodes.includes('reference_scale_gate_failed')
  ) {
    return 'refine-spec'
  }
  return 'refine-code'
}

function aggregateScore(quality: Quality): number {
  const alignment = quality.referenceAlignment
  const values = alignment
    ? [
        alignment.silhouetteIoU,
        alignment.scaleScore,
        alignment.edgeScore,
        alignment.perceptualScore
      ]
    : []
  if (quality.multiAngle) {
    values.push(
      Math.min(1, quality.multiAngle.silhouetteRetention),
      Math.min(1, quality.multiAngle.volumeAxisRatio / Math.max(quality.multiAngle.minimumVolumeAxisRatio, 0.001))
    )
  }
  for (const feature of quality.featureResults ?? []) values.push(feature.score)
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : quality.passed ? 1 : 0
}

function defectHash(failureCodes: string[]): string {
  if (!failureCodes.length) return 'success'
  return createHash('sha256').update(failureCodes.join('|')).digest('hex').slice(0, 16)
}
