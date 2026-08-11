import { isAxiosError } from 'axios'
import type { BaiduParserEngine } from './types.js'

export type BaiduOcrErrorContext = {
  engine?: BaiduParserEngine
  status?: number
  code?: string | number
  taskId?: string
  logId?: string
  batchIndex?: number
  batchCount?: number
  sourcePageStart?: number
  sourcePageEnd?: number
  retryable?: boolean
}

export class BaiduOcrError extends Error {
  readonly provider = 'baidu-cloud' as const
  readonly engine?: BaiduParserEngine
  readonly status?: number
  readonly code?: string | number
  readonly taskId?: string
  readonly logId?: string
  readonly batchIndex?: number
  readonly batchCount?: number
  readonly sourcePageStart?: number
  readonly sourcePageEnd?: number
  readonly retryable: boolean

  constructor(message: string, context: BaiduOcrErrorContext = {}) {
    super(message)
    this.name = 'BaiduOcrError'
    this.engine = context.engine
    this.status = context.status
    this.code = context.code
    this.taskId = context.taskId
    this.logId = context.logId
    this.batchIndex = context.batchIndex
    this.batchCount = context.batchCount
    this.sourcePageStart = context.sourcePageStart
    this.sourcePageEnd = context.sourcePageEnd
    this.retryable = context.retryable ?? false
  }
}

export function normalizeBaiduError(
  engine: BaiduParserEngine | undefined,
  error: unknown,
  fallbackMessage: string
): BaiduOcrError {
  if (error instanceof BaiduOcrError) {
    return error
  }
  const structural = readStructuralError(error)
  if (structural) {
    return new BaiduOcrError(structural.message, { ...structural, engine: structural.engine ?? engine })
  }
  if (isAxiosError(error)) {
    const status = error.response?.status
    return new BaiduOcrError(safeMessage(error) ?? fallbackMessage, {
      engine,
      status,
      code: error.code,
      retryable: !status || status === 408 || status === 429 || status === 502 || status === 503 || status === 504
    })
  }
  return new BaiduOcrError(safeMessage(error) ?? fallbackMessage, { engine })
}

export function documentConversionError(
  engine: BaiduParserEngine,
  error: unknown,
  fallbackMessage: string
): BaiduOcrError {
  const normalized = normalizeBaiduError(engine, error, fallbackMessage)
  const details = [
    'provider=baidu-cloud',
    `engine=${normalized.engine ?? engine}`,
    normalized.status === undefined ? undefined : `httpStatus=${normalized.status}`,
    normalized.code === undefined ? undefined : `code=${normalized.code}`,
    normalized.taskId ? `taskId=${normalized.taskId}` : undefined,
    normalized.logId ? `logId=${normalized.logId}` : undefined
  ].filter((value): value is string => Boolean(value))
  const reason = normalized.message.trim()
  const message =
    reason && reason !== fallbackMessage
      ? `${fallbackMessage}: ${reason} [${details.join(', ')}]`
      : `${fallbackMessage} [${details.join(', ')}]`
  return new BaiduOcrError(message, {
    engine: normalized.engine ?? engine,
    status: normalized.status,
    code: normalized.code,
    taskId: normalized.taskId,
    logId: normalized.logId,
    batchIndex: normalized.batchIndex,
    batchCount: normalized.batchCount,
    sourcePageStart: normalized.sourcePageStart,
    sourcePageEnd: normalized.sourcePageEnd,
    retryable: normalized.retryable
  })
}

type StructuralError = BaiduOcrErrorContext & { message: string }

function readStructuralError(error: unknown): StructuralError | null {
  if (!isRecord(error) || error.name !== 'BaiduOcrError' || typeof error.message !== 'string') {
    return null
  }
  return {
    message: error.message,
    engine: isEngine(error.engine) ? error.engine : undefined,
    status: finiteNumber(error.status),
    code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : undefined,
    taskId: nonEmptyString(error.taskId),
    logId: nonEmptyString(error.logId),
    batchIndex: finiteNumber(error.batchIndex),
    batchCount: finiteNumber(error.batchCount),
    sourcePageStart: finiteNumber(error.sourcePageStart),
    sourcePageEnd: finiteNumber(error.sourcePageEnd),
    retryable: typeof error.retryable === 'boolean' ? error.retryable : undefined
  }
}

function safeMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) return error.message.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isEngine(value: unknown): value is BaiduParserEngine {
  return value === 'paddleocr-vl' || value === 'unlimited-ocr'
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
