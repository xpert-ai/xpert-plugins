import { SystemMessage } from '@langchain/core/messages'
import type {
  AgentBuiltInState,
  ModelRequest,
} from '@xpert-ai/plugin-sdk'

export const MODEL_OUTPUT_VALIDATION_ERROR_CODE = 'MODEL_OUTPUT_VALIDATION_ERROR' as const

export type ModelOutputRepairContext = {
  kind: 'invalid_tool_calls'
  issues: Array<{
    toolName?: string
    error: string
    fieldName?: string
    characterOffset?: number
    hint?: string
  }>
}

export type ModelOutputValidationErrorLike = Error & {
  code: typeof MODEL_OUTPUT_VALIDATION_ERROR_CODE
  retryable: true
  repairContext: ModelOutputRepairContext
}

/**
 * Structural guard for the host/plugin boundary. Older SDKs can load the
 * middleware; hosts that support corrective retries attach this stable code
 * and compact repair context to their validation error.
 */
export function isModelOutputValidationError(
  error: unknown
): error is ModelOutputValidationErrorLike {
  if (!(error instanceof Error)) return false

  const candidate = error as Partial<ModelOutputValidationErrorLike>
  return (
    candidate.code === MODEL_OUTPUT_VALIDATION_ERROR_CODE &&
    candidate.retryable === true &&
    candidate.repairContext?.kind === 'invalid_tool_calls' &&
    Array.isArray(candidate.repairContext.issues)
  )
}

export function appendOutputRepairFeedback(
  request: ModelRequest<AgentBuiltInState>,
  repairContext: ModelOutputRepairContext,
  attempt: number
): ModelRequest<AgentBuiltInState> {
  const feedback = buildOutputRepairFeedback(repairContext, attempt)
  const existingContent = request.systemMessage?.content
  const systemMessage =
    typeof existingContent === 'string'
      ? new SystemMessage({ content: [existingContent, feedback].filter(Boolean).join('\n\n') })
      : Array.isArray(existingContent)
        ? new SystemMessage({ content: [...existingContent, { type: 'text', text: feedback }] })
        : new SystemMessage({ content: feedback })

  return {
    ...request,
    systemMessage,
  }
}

export function buildOutputRepairFeedback(
  repairContext: ModelOutputRepairContext,
  attempt: number
): string {
  const issues = repairContext.issues.map((issue, index) => {
    const details = [
      `Issue ${index + 1}`,
      issue.toolName ? `tool=${issue.toolName}` : null,
      issue.fieldName ? `field=${issue.fieldName}` : null,
      issue.characterOffset !== undefined ? `nearCharacter=${issue.characterOffset}` : null,
      `error=${issue.error}`,
      issue.hint ? `repair=${issue.hint}` : null,
    ].filter((value): value is string => Boolean(value))
    return details.join('; ')
  })

  return [
    '<tool_call_repair>',
    `Repair attempt ${attempt}. The previous model response was rejected before any tool executed.`,
    ...issues,
    'Regenerate the complete intended tool call with syntactically valid JSON arguments.',
    'Preserve the original business intent and values. Do not abbreviate or omit required content.',
    'Inside JSON string prose, escape ASCII double quotes as \\" or replace them with typographic quotation marks such as “…” or 「…」.',
    'Return the corrected tool call only. Do not claim the tool was executed.',
    '</tool_call_repair>',
  ].join('\n')
}
