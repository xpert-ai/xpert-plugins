import type { StoryVideoGenerationReference } from './story-video-generation.platform.js'
import type { StoryVideoGenerationRequestSnapshot } from './story-video-generation.types.js'

export interface StoryVideoSubmissionErrorClassification {
  failureCode: 'submission_rejected' | 'submission_result_unknown'
  status: 'failed' | 'submission_unknown'
  failureMessage: string
}

const TRANSPORT_ERROR_PATTERNS = [
  /\bsocket hang up\b/i,
  /\bsocket timeout\b/i,
  /\btimeout\b/i,
  /\btimed out\b/i,
  /\bfetch failed\b/i,
  /\bnetwork error\b/i,
  /\bfailed to fetch\b/i,
  /\brequest aborted\b/i,
  /\babort(?:ed|error)\b/i,
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /\bEPIPE\b/i,
  /\bETIMEDOUT\b/i,
  /\bENOTFOUND\b/i,
  /\bEAI_AGAIN\b/i
]

const DETERMINISTIC_ERROR_PATTERNS = [
  /\bvideo_generation_/i,
  /\bdid not match expected schema\b/i,
  /\brequired\b/i,
  /\bnot[_-]?available\b/i,
  /\bnot[_-]?supported\b/i,
  /\bnot[_-]?enabled\b/i,
  /\binvalid\b/i,
  /\bquota\b/i,
  /\bbalance\b/i,
  /\binsufficient\b/i,
  /\brate limit\b/i,
  /\btoo many requests\b/i,
  /\bunauthori[sz]ed\b/i,
  /\bforbidden\b/i,
  /\bpermission denied\b/i,
  /\bauthentication\b/i,
  /\bauthentication failed\b/i
]

export function buildSubmissionReferences(
  request: StoryVideoGenerationRequestSnapshot
): StoryVideoGenerationReference[] {
  const continuityFrame = request.continuity?.strength === 'first_frame'
    ? request.continuity.sourceFrame ?? findFirstFrameReference(request.references)
    : null
  if (continuityFrame) {
    // The video platform rejects first_frame mixed with generic references.
    return [{
      kind: 'image',
      purpose: 'first_frame',
      file: continuityFrame
    }]
  }

  const references = (request.references ?? []).filter((item) => item.purpose !== 'first_frame')
  if (references.length) return references

  return request.inputImage
    ? [{
        kind: 'image',
        purpose: 'reference',
        file: request.inputImage
      }]
    : []
}

export function classifySubmissionError(error: unknown): StoryVideoSubmissionErrorClassification {
  const rawMessage = errorMessage(error)
  const status = readSubmissionStatus(error, rawMessage)
  const normalizedMessage = normalizeSubmissionErrorMessage(rawMessage)

  if (isTransportSubmissionError(rawMessage)) {
    return {
      failureCode: 'submission_result_unknown',
      status: 'submission_unknown',
      failureMessage: rawMessage.slice(0, 2_000)
    }
  }

  if (isDeterministicSubmissionError(rawMessage, status)) {
    return {
      failureCode: 'submission_rejected',
      status: 'failed',
      failureMessage: normalizedMessage
    }
  }

  return {
    failureCode: 'submission_result_unknown',
    status: 'submission_unknown',
    failureMessage: rawMessage.slice(0, 2_000)
  }
}

function isDeterministicSubmissionError(message: string, status: number | null) {
  if (status != null && status >= 400 && status < 500 && status !== 408) return true
  return DETERMINISTIC_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

function isTransportSubmissionError(message: string) {
  return TRANSPORT_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

function normalizeSubmissionErrorMessage(message: string) {
  const providerMessage = readProviderErrorMessage(message)
  return sanitizeSubmissionMessage(providerMessage ?? message)
}

function readProviderErrorMessage(message: string) {
  const providerMatch = message.match(/^(?:.*\bAPI error \d+):\s*(.+)$/is)
  const body = providerMatch?.[1]?.trim()
  if (!body) return null

  const parsed = tryParseJson(body)
  if (parsed) {
    const providerMessage = readProviderErrorSummary(parsed)
    if (providerMessage) return providerMessage
  }

  return body
}

function readProviderErrorSummary(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (!isRecord(value)) return null

  const error = value.error
  if (isRecord(error)) {
    const code = readString(error.code)
    const providerMessage = readString(error.message)
    if (code && providerMessage) return `${code}: ${providerMessage}`
    if (providerMessage) return providerMessage
    if (code) return code
  }

  const code = readString(value.code)
  const providerMessage = readString(value.message)
  if (code && providerMessage) return `${code}: ${providerMessage}`
  if (providerMessage) return providerMessage
  if (code) return code
  return null
}

function sanitizeSubmissionMessage(message: string) {
  return message
    .replace(/https?:\/\/\S+/giu, '[redacted-url]')
    .replace(/[\r\n\t]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 500)
}

function findFirstFrameReference(references: StoryVideoGenerationRequestSnapshot['references']) {
  return references?.find((item) => item.kind === 'image' && item.purpose === 'first_frame')?.file ?? null
}

function readSubmissionStatus(error: unknown, message: string) {
  if (isRecord(error)) {
    const response = isRecord(error.response) ? error.response : null
    const status = readNumericValue(error.status)
      ?? readNumericValue(error.statusCode)
      ?? (response ? readNumericValue(response.status) : null)
      ?? (response ? readNumericValue(response.statusCode) : null)
    if (status != null) return status
    const getter = error.getStatus
    if (typeof getter === 'function') {
      try {
        const value = getter.call(error)
        if (typeof value === 'number' && Number.isFinite(value)) return value
      } catch {
        // ignore
      }
    }
  }

  const match = message.match(/\bAPI error\s+(\d{3})\b/i)
    ?? message.match(/\bHTTP error\s+(\d{3})\b/i)
  return match ? Number(match[1]) : null
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
