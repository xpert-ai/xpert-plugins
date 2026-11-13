import { z } from 'zod/v3'
import type { Workbench, QueryResult } from './contracts.js'
import { queryPlan } from '../lib/schemas.js'
const dataset = z.object({
  id: z.string(),
  name: z.string(),
  rowCount: z.number(),
  amount: z.string(),
  currency: z.literal('CNY'),
  firstAt: z.string(),
  lastAt: z.string(),
  createdAt: z.string(),
  sheet: z.string()
})
const account = z.object({ accountId: z.string(), name: z.string(), aliases: z.array(z.string()) })
const transfer = z.object({
  transactionId: z.string(),
  time: z.string(),
  payerAccount: z.string(),
  payerName: z.string(),
  payeeAccount: z.string(),
  payeeName: z.string(),
  amount: z.string(),
  summary: z.string(),
  sourceRow: z.number()
})
const evidence = z.object({
  items: z.array(transfer),
  total: z.number(),
  page: z.number(),
  pageSize: z.number()
})
export const resultSchema: z.ZodType<QueryResult, z.ZodTypeDef, unknown> = z.object({
  status: z.enum(['completed', 'needs_clarification', 'pending', 'failed', 'waiting_timeout', 'answered']),
  queryId: z.string(),
  question: z.string().optional(),
  kind: z.string().optional(),
  direction: z.string().optional(),
  amount: z.string().optional(),
  count: z.number().optional(),
  currency: z.string().optional(),
  groups: z
    .array(
      z.object({
        label: z.string(),
        amount: z.string(),
        count: z.number(),
        accountId: z.string().optional()
      })
    )
    .optional(),
  groupsTruncated: z.boolean().optional(),
  accounts: z.array(account).optional(),
  window: z
    .object({
      startInclusive: z.string().nullable(),
      endExclusive: z.string().nullable(),
      timezone: z.string()
    })
    .optional(),
  plan: queryPlan.optional(),
  dataset: dataset.optional(),
  evidence: evidence.optional(),
  policy: z.string().optional(),
  referenceTime: z.string().optional(),
  message: z.string().optional(),
  candidates: z.array(account).optional(),
  // Python serializes an empty database error as null while a query is pending.
  error: z.string().nullish().transform((value) => value ?? undefined)
})
export const conversationSchema = z.object({
  id: z.string().uuid(), datasetId: z.string().uuid(), title: z.string(),
  createdAt: z.string(), updatedAt: z.string(), conversationId: z.string().nullable(),
  threadId: z.string().nullable(), turnCount: z.number().int().nonnegative(), running: z.boolean()
})
export const turnSchema = z.object({
  queryId: z.string().uuid(), sessionId: z.string().uuid(), question: z.string(),
  createdAt: z.string(), updatedAt: z.string(), status: z.enum(['completed', 'needs_clarification', 'pending', 'failed', 'waiting_timeout', 'answered']),
  stage: z.enum(['submitted', 'thinking', 'reading_context', 'finding_accounts', 'analyzing', 'replying', 'completed', 'failed']),
  reply: z.string(), replyStatus: z.enum(['pending', 'completed', 'unconfirmed', 'rejected', 'unavailable']),
  baseQueryId: z.string().nullable(), result: resultSchema
})
const page = <T extends z.ZodTypeAny>(item: T) => z.object({items: z.array(item), total: z.number(), page: z.number(), pageSize: z.number()})
export const workbenchSchema: z.ZodType<Workbench, z.ZodTypeDef, unknown> = z.object({
  context: z.object({
    currentDataset: dataset.nullable(),
    datasets: z.object({
      items: z.array(dataset),
      total: z.number(),
      page: z.number(),
      pageSize: z.number()
    }),
    now: z.string(),
    timezone: z.string()
  }),
  preview: evidence.optional(),
  history: z
    .object({
      items: z.array(
        z.object({
          queryId: z.string(),
          question: z.string(),
          status: z.string(),
          created_at: z.string(),
          updated_at: z.string(),
          error: z.string().nullable(),
          baseQueryId: z.string().nullable().optional()
        })
      ),
      total: z.number(),
      page: z.number(),
      pageSize: z.number()
    })
    .optional(),
  result: resultSchema.optional(),
  dataset: dataset.optional(),
  session: conversationSchema.optional(),
  sessions: page(conversationSchema).optional(),
  turns: page(turnSchema).optional()
})
