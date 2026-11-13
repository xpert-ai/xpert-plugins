import { z } from 'zod/v3'
import type { JsonValue } from '../shared/contracts.js'
const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(json), z.record(json)])
)
export const jsonObject = z.record(json)
export const toJson = (value: object) => jsonObject.parse(JSON.parse(JSON.stringify(value)))
export const datasetId = z.string().uuid().optional()
export const queryPlan = z
  .object({
    kind: z.enum(['summary', 'transactions', 'counterparties', 'trend']).optional(),
    direction: z.enum(['in', 'out', 'net']).optional(),
    accountIds: z.array(z.string().min(1).max(128)).min(1).max(20).optional(),
    accountName: z.string().min(1).max(80).optional(),
    period: z
      .enum(['all', 'this_month', 'last_month', 'this_week', 'last_week', 'custom'])
      .optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    minAmount: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/)
      .optional(),
    maxAmount: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/)
      .optional(),
    minExclusive: z.boolean().optional(),
    maxExclusive: z.boolean().optional(),
    counterpartyName: z.string().min(1).max(80).optional(),
    counterpartyAccountId: z.string().min(1).max(128).optional(),
    limit: z.number().int().min(1).max(20).optional(),
    granularity: z.enum(['day', 'week', 'month']).optional()
  })
  .strict()
export const runInput = z
  .object({
    datasetId,
    question: z.string().min(1).max(1000),
    queryId: z.string().uuid().optional(),
    baseQueryId: z.string().uuid().optional(),
    clearFilters: z
      .array(
        z.enum([
          'accountIds',
          'accountName',
          'minAmount',
          'maxAmount',
          'minExclusive',
          'maxExclusive',
          'counterpartyName',
          'counterpartyAccountId'
        ])
      )
      .max(8)
      .optional(),
    plan: queryPlan
  })
  .strict()
export const pageInput = z
  .object({
    datasetId,
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(50).default(20)
  })
  .strict()
