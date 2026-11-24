import { z } from 'zod/v3'

export const scopeSchema = z.object({
  tenantId: z.string().min(1), organizationId: z.string(), workspaceId: z.string(),
  userId: z.string().min(1), xpertId: z.string().min(1)
}).strict()
export type Scope = z.infer<typeof scopeSchema>
const code = z.string().regex(/^(000|001|002|003|600|601|603|605)\d{3}$/)
const timestamp = z.string().datetime({ offset: true })
export const stockSchema = z.object({
  code, name: z.string().trim().min(1).max(40), price: z.number().finite().positive(),
  amount: z.number().finite().nonnegative(), change_pct: z.number().finite(),
  turnover_pct: z.number().finite().nonnegative().nullable(), volume_ratio: z.number().finite().nonnegative().nullable(),
  pe_ratio: z.number().finite().nullable(), quote_time: timestamp
}).strict()
export const financialSchema = z.object({
  code, disclosed_at: timestamp, source: z.string().trim().min(1).max(200),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  revenue_yoy_pct: z.number().finite().nullable(), profit_yoy_pct: z.number().finite().nullable(),
  roe_pct: z.number().finite().nullable()
}).strict()
export const snapshotSchema = z.object({
  source: z.string().trim().min(1).max(200), kind: z.enum(['historical', 'live', 'synthetic']),
  cutoff: timestamp, stocks: z.array(stockSchema).min(1).max(2000),
  financials: z.array(financialSchema).max(2000)
}).strict().superRefine((data, ctx) => {
  const codes = new Set(data.stocks.map(s => s.code))
  if (codes.size !== data.stocks.length) ctx.addIssue({code:'custom', message:'duplicate_stock'})
  if (new Set(data.financials.map(f => f.code)).size !== data.financials.length) ctx.addIssue({code:'custom',message:'duplicate_financial'})
  for (const row of data.stocks) {
    if (Date.parse(row.quote_time) > Date.parse(data.cutoff)) ctx.addIssue({code:'custom',message:'future_quote'})
  }
  for (const f of data.financials) {
    if (!codes.has(f.code) || Date.parse(f.disclosed_at) > Date.parse(data.cutoff) || f.report_date > f.disclosed_at.slice(0,10)) {
      ctx.addIssue({code:'custom',message:'invalid_financial_cutoff_or_code'})
    }
  }
})
export const createSchema = z.object({
  title: z.string().trim().min(1).max(100), objective: z.string().trim().min(5).max(1000),
  snapshot: snapshotSchema, requestKey: z.string().uuid()
}).strict()
export const taskIdSchema = z.object({ taskId: z.string().uuid() }).strict()
export const revisionSchema = taskIdSchema.extend({ expectedRevision: z.number().int().positive() }).strict()
export const searchSchema = taskIdSchema.extend({
  sortBy: z.enum(['amount','change_pct','turnover_pct','volume_ratio','pe_ratio']),
  direction: z.enum(['asc','desc']), offset: z.number().int().min(0).max(2000), limit: z.number().int().min(1).max(20)
}).strict()
export const evidenceSchema = taskIdSchema.extend({ code }).strict()
export const reviewSchema = taskIdSchema.extend({
  role: z.enum(['fundamental','technical','risk','decision']),
  summary: z.string().trim().min(5).max(1800), risks: z.array(z.string().trim().min(1).max(300)).max(6),
  candidates: z.array(code).max(10), vetoes: z.array(code).max(10),
  selectedCode: code.nullable(), evidenceIds: z.array(z.string().min(1).max(80)).min(1).max(30)
}).strict()
export const failSchema = taskIdSchema.extend({ reason: z.enum(['model_failed','tool_failed','insufficient_evidence']) }).strict()
export type Snapshot = z.infer<typeof snapshotSchema>
export type Stock = Snapshot['stocks'][number]
export type Role = 'fundamental' | 'technical' | 'risk' | 'decision'
export type Review = Omit<z.infer<typeof reviewSchema>, 'taskId'> & { role: Role; createdAt: string }
export type TaskStatus = 'draft' | 'running' | 'ready' | 'abstained' | 'confirmed' | 'failed'
export interface Task {
  id: string; requestKey: string; title: string; objective: string; snapshot: Snapshot;
  snapshotHash: string; revision: number; status: TaskStatus; attempt: number;
  createdAt: string; updatedAt: string; deadline: string | null;
  observedCodes: string[]; evidenceIds: string[]; exploredDimensions: string[]; reviews: Review[];
  failureCode: string | null; confirmedAt: string | null;
  attempts: {attempt: number; reviews: Review[]; failureCode: string | null}[]
}
export class ResearchError extends Error {
  constructor(readonly code: string) { super(code) }
}
