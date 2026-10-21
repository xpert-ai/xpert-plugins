import { z } from 'zod/v3'
import type { AnalyticsLogicalType, AnalyticsValue } from '@xpert-ai/contracts'

export const databaseLocationSchema = z.object({ database: z.string().trim().min(1).max(128) }).strict()
export const mysqlPayloadSchema = z.object({
  sql: z.string().trim().min(1).max(32000),
  parameterOrder: z.array(z.string().min(1).max(128)).max(24).default([]),
  location: databaseLocationSchema.optional()
}).strict()

/** mysql/mysql2 query() formats every ? even inside quotes/comments; fail closed on ambiguous templates. */
export function bindMysqlParameters(sql: string, order: string[], parameters: Record<string, AnalyticsValue>): AnalyticsValue[] {
  if (order.some((name) => !Object.hasOwn(parameters, name)) ||
    Object.keys(parameters).some((name) => !order.includes(name))) throw new Error('MYSQL_PARAMETER_ORDER_INVALID')
  let count = 0
  for (let i = 0; i < sql.length; i++) {
    const start = i, c = sql[i]
    if (c === "'" || c === '"' || c === '`') {
      let closed = false
      while (++i < sql.length) {
        if (sql[i] === '\\') throw new Error('MYSQL_PARAMETER_TEMPLATE_INVALID')
        if (sql[i] === c) {
          if (sql[i + 1] === c) { i++; continue }
          closed = true
          break
        }
      }
      if (!closed || (order.length && sql.slice(start, i + 1).includes('?'))) throw new Error('MYSQL_PARAMETER_TEMPLATE_INVALID')
    } else if (c === '#' || (c === '-' && sql[i + 1] === '-')) {
      while (i < sql.length && sql[i] !== '\n') i++
      if (order.length && sql.slice(start, i).includes('?')) throw new Error('MYSQL_PARAMETER_TEMPLATE_INVALID')
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      if (end < 0 || sql[i + 2] === '!' || (order.length && sql.slice(i, end).includes('?')))
        throw new Error('MYSQL_PARAMETER_TEMPLATE_INVALID')
      i = end + 1
    } else if (c === '?') {
      if (sql[i + 1] === '?') throw new Error('MYSQL_IDENTIFIER_PARAMETER_DENIED')
      count++
    }
  }
  if (count !== order.length) throw new Error('MYSQL_PARAMETER_COUNT_INVALID')
  return order.map((name) => parameters[name])
}

const integers = new Set(['1', '2', '3', '8', '9', '13'])
const floating = new Set(['4', '5'])
/** Wire type codes, never sampled values, determine eligible conversions. DECIMAL/BIGINT remain exact. */
export function normalizeMysqlCell(value: AnalyticsValue, wireType: string, logicalType?: AnalyticsLogicalType): AnalyticsValue {
  if (value === null) return null
  if (logicalType === 'float64' && (floating.has(wireType) || (integers.has(wireType) && wireType !== '8')) && typeof value === 'string') {
    const number = Number(value)
    if (!value.trim() || !Number.isFinite(number)) throw new Error('MYSQL_NONFINITE_NUMBER')
    return number
  }
  if (logicalType === 'boolean' && wireType === '1') {
    if (value === '0' || value === 0) return false
    if (value === '1' || value === 1) return true
  }
  if (logicalType === 'int64' && integers.has(wireType) && typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return value
}
