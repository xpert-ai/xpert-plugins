/**
 * 业务错误：带稳定错误码和结构化参数，工具和视图据此返回“可理解、可恢复”的失败结果。
 * Python 类比：class ExpediteError(Exception): def __init__(self, code, details=None)。
 */
export const EXPEDITE_ERROR_CODES = [
  // 通用
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'INVALID_STATE',
  'CONFLICT',
  'DUPLICATE_ORDER',
  // 分析任务（工具侧）
  'JOB_NOT_FOUND',
  'JOB_NOT_ACTIVE',
  'PRODUCT_HAS_NO_BOM',
  'INVENTORY_UNAVAILABLE',
  'UNKNOWN_MATERIAL',
  'NOT_A_SHORTAGE',
  'SUGGESTED_DATE_REQUIRED',
  'SUBSTITUTE_NOT_ALLOWED',
  'MISSING_FINDINGS',
  // 确认（视图侧）
  'UNDECIDED_FINDINGS',
  'ALREADY_DECIDED',
  'FINDING_NOT_EDITABLE'
] as const
export type ExpediteErrorCode = (typeof EXPEDITE_ERROR_CODES)[number]

/** 错误附带的结构化参数（只放可以给模型和界面看的业务信息，不放内部 ID 以外的敏感数据） */
export type ExpediteErrorDetails = Record<string, string | number | boolean | null | string[] | Record<string, string>>

export class ExpediteError extends Error {
  constructor(
    readonly code: ExpediteErrorCode,
    readonly details: ExpediteErrorDetails = {}
  ) {
    super(code)
    this.name = 'ExpediteError'
  }
}

/** 判断数据库错误是否为唯一约束冲突（PostgreSQL 23505；pg-mem 也沿用这个码） */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined
  const driverCode =
    'driverError' in error ? ((error as { driverError?: { code?: unknown } }).driverError?.code ?? undefined) : undefined
  if (code === '23505' || driverCode === '23505') return true
  // pg-mem 的错误对象没有 code，只能按固定消息前缀识别（仅用于单测环境）
  return error instanceof Error && /duplicate key value violates unique constraint/i.test(error.message)
}
