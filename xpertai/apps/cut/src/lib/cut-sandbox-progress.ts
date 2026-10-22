import type { SandboxJobSnapshot, SandboxJobProgress } from '@xpert-ai/plugin-sdk'

export function readCutSandboxProgress(snapshot: SandboxJobSnapshot | null): SandboxJobProgress | null {
  const value = snapshot?.progress
  if (!value || !Number.isFinite(value.progress) || value.progress < 0 || value.progress > 1) return null
  const current = nonNegativeInteger(value.current)
  const total = nonNegativeInteger(value.total)
  const updatedAt = normalizedUpdatedAt(value.updatedAt)
  return {
    progress: value.progress,
    ...(typeof value.stage === 'string' ? { stage: value.stage } : {}),
    ...(current !== null && total !== null && current <= total ? { current, total } : {}),
    ...(updatedAt ? { updatedAt } : {})
  }
}

export function cutTaskProgress(progress: number): number {
  return Math.min(90, Math.max(20, 20 + Math.round(progress * 70)))
}

export function cutTaskStage(stage?: string): string {
  if (stage === 'complete') return 'complete'
  if (stage === 'failed' || stage === 'cancelled') return stage
  return 'rendering'
}

function nonNegativeInteger(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function normalizedUpdatedAt(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}
