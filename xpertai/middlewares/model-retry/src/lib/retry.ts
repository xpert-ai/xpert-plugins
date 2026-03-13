import { z } from 'zod/v3'
import type { InferInteropZodInput } from '@langchain/core/utils/types'
import type { RetryOnFailureMode } from './types.js'

export const retryBaseSchema = z
  .object({
    maxRetries: z.number().int().min(0).default(2),
    initialDelayMs: z.number().min(0).default(1000),
    backoffFactor: z.number().min(0).default(2),
    maxDelayMs: z.number().min(0).default(60000),
    jitter: z.boolean().default(true),
    retryAllErrors: z.boolean().default(true),
    retryableErrorNames: z.array(z.string().trim().min(1)).optional(),
    retryableStatusCodes: z.array(z.number().int()).optional(),
    retryableMessageIncludes: z.array(z.string().trim().min(1)).optional(),
    onFailure: z.enum(['continue', 'error']).default('continue'),
  })
  .superRefine((data, ctx) => {
    const hasMatchers =
      (data.retryableErrorNames?.length ?? 0) > 0 ||
      (data.retryableStatusCodes?.length ?? 0) > 0 ||
      (data.retryableMessageIncludes?.length ?? 0) > 0

    if (!data.retryAllErrors && !hasMatchers) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retryAllErrors'],
        message:
          'When retryAllErrors is false, at least one retry matcher must be configured.',
      })
    }
  })

export type RetryBaseConfigInput = InferInteropZodInput<typeof retryBaseSchema>

export interface NormalizedRetryConfig {
  maxRetries: number
  initialDelayMs: number
  backoffFactor: number
  maxDelayMs: number
  jitter: boolean
  retryAllErrors: boolean
  retryableErrorNames: string[]
  retryableStatusCodes: number[]
  retryableMessageIncludes: string[]
  onFailure: RetryOnFailureMode
}

const normalizeStringList = (values?: string[], lowercase = false): string[] => {
  const normalized = (values ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => (lowercase ? value.toLowerCase() : value))

  return Array.from(new Set(normalized))
}

const normalizeNumberList = (values?: number[]): number[] =>
  Array.from(new Set((values ?? []).filter((value) => Number.isFinite(value))))

export function normalizeRetryConfig(input: RetryBaseConfigInput): NormalizedRetryConfig {
  return {
    maxRetries: input.maxRetries ?? 2,
    initialDelayMs: input.initialDelayMs ?? 1000,
    backoffFactor: input.backoffFactor ?? 2,
    maxDelayMs: input.maxDelayMs ?? 60000,
    jitter: input.jitter ?? true,
    retryAllErrors: input.retryAllErrors ?? true,
    retryableErrorNames: normalizeStringList(input.retryableErrorNames),
    retryableStatusCodes: normalizeNumberList(input.retryableStatusCodes),
    retryableMessageIncludes: normalizeStringList(input.retryableMessageIncludes, true),
    onFailure: input.onFailure ?? 'continue',
  }
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>
    const normalized = new Error(
      typeof candidate.message === 'string' ? candidate.message : String(error)
    )
    normalized.name = typeof candidate.name === 'string' ? candidate.name : 'Error'
    Object.assign(normalized, candidate)
    return normalized
  }

  return new Error(typeof error === 'string' ? error : String(error))
}

const toStatusCode = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }
  return null
}

const extractStatusCodes = (error: Error): number[] => {
  const candidate = error as Error & {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown } | null
    cause?: { status?: unknown; statusCode?: unknown; response?: { status?: unknown } | null } | null
  }

  const values = [
    candidate.status,
    candidate.statusCode,
    candidate.response?.status,
    candidate.cause?.status,
    candidate.cause?.statusCode,
    candidate.cause?.response?.status,
  ]

  return values
    .map((value) => toStatusCode(value))
    .filter((value): value is number => value !== null)
}

export function shouldRetryError(error: Error, config: NormalizedRetryConfig): boolean {
  if (config.retryAllErrors) {
    return true
  }

  if (config.retryableErrorNames.includes(error.name)) {
    return true
  }

  const statusCodes = extractStatusCodes(error)
  if (config.retryableStatusCodes.some((statusCode) => statusCodes.includes(statusCode))) {
    return true
  }

  const message = error.message.toLowerCase()
  return config.retryableMessageIncludes.some((fragment) => message.includes(fragment))
}

export function calculateRetryDelay(
  config: Pick<NormalizedRetryConfig, 'initialDelayMs' | 'backoffFactor' | 'maxDelayMs' | 'jitter'>,
  attempt: number
): number {
  const growth = config.backoffFactor === 0 ? 1 : Math.pow(config.backoffFactor, attempt)
  const baseDelay = Math.min(config.maxDelayMs, config.initialDelayMs * growth)

  if (!config.jitter || baseDelay <= 0) {
    return Math.max(0, Math.round(baseDelay))
  }

  const jitterFactor = 0.75 + Math.random() * 0.5
  return Math.max(0, Math.round(Math.min(config.maxDelayMs, baseDelay * jitterFactor)))
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
