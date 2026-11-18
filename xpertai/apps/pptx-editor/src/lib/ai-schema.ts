import { z } from 'zod/v3'
import type { TemplateReport } from './template-schema.js'

const title = z.string().trim().min(1).max(160)
const text = z.string().max(4000)
const color = z.string().regex(/^[0-9A-Fa-f]{6}$/)
const base = { title, notes: z.string().max(8000).default('') }
const slide = z.discriminatedUnion('layout', [
  z.object({ ...base, layout: z.literal('cover'), subtitle: z.string().max(300) }).strict(),
  z.object({ ...base, layout: z.literal('section'), subtitle: z.string().max(300) }).strict(),
  z.object({ ...base, layout: z.literal('bullets'), points: z.array(z.string().min(1).max(240)).min(1).max(6) }).strict(),
  z.object({ ...base, layout: z.literal('process'), steps: z.array(z.object({ title: z.string().min(1).max(32), detail: z.string().max(90) }).strict()).min(2).max(5) }).strict(),
  z.object({ ...base, layout: z.literal('table'), headers: z.array(z.string().min(1).max(60)).min(2).max(5),
    rows: z.array(z.array(z.string().max(100)).min(2).max(5)).min(1).max(7) }).strict()
])

export const createSchema = z.object({ operationId: z.string().uuid(), title,
  brand: z.object({ company: z.string().max(160), font: z.string().min(1).max(80).default('Microsoft YaHei'),
    primary: color.default('10263A'), background: color.default('F3EEE4'), accent: color.default('B89960') }).strict(),
  slides: z.array(slide).min(1).max(40)
}).strict().superRefine((value, ctx) => {
  value.slides.forEach((page, index) => {
    if (page.layout === 'table' && page.rows.some(row => row.length !== page.headers.length))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slides', index, 'rows'], message: 'Every row must match the header count.' })
  })
})

/** A relative Project locator is not authority; the platform resolves its current owner on every call. */
export const fileSchema = z.object({ filePath: z.string().min(1).max(500)
  .refine(path => !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(part => !part || part === '.' || part === '..') && !/[\u0000-\u001f]/.test(path), 'Use a relative Project file path.')
  .refine(path => path.toLowerCase().endsWith('.pptx'), 'Expected a PPTX file.') }).strict()
export const inspectSchema = fileSchema.extend({ offset: z.number().int().min(0).max(499).default(0), limit: z.number().int().min(1).max(3).default(1), objectOffset: z.number().int().min(0).max(10000).default(0) })
export const versionSchema = fileSchema.extend({ expectedRevision: z.string().min(1).max(300) })
const target = { slideId: z.string().min(1).max(200), objectId: z.string().min(1).max(200) }
export const operationSchema = z.discriminatedUnion('kind', [
  z.object({ ...target, kind: z.literal('setText'), text }).strict(),
  z.object({ slideId: target.slideId, kind: z.literal('setNotes'), notes: z.string().max(8000) }).strict(),
  z.object({ ...target, kind: z.literal('setBounds'), x: z.number().min(0).max(100), y: z.number().min(0).max(100),
    width: z.number().positive().max(100), height: z.number().positive().max(100) }).strict()
])
export const applySchema = versionSchema.extend({ operationId: z.string().uuid(), operations: z.array(operationSchema).min(1).max(50) })
export const renderSchema = versionSchema.extend({ offset: z.number().int().min(0).max(499).default(0), limit: z.number().int().min(1).max(5).default(1) })
export type DeckPlan = z.infer<typeof createSchema>
export type ApplyRequest = z.infer<typeof applySchema>
export type PptxOperation = z.infer<typeof operationSchema>

export type EngineInput = { buffer: Uint8Array; action: 'inspect' | 'apply' | 'validate' | 'render';
  offset?: number; limit?: number; objectOffset?: number; operations?: PptxOperation[] }
export type SlideSummary = { slideId: string; index: number; notes: string; notesTruncated: boolean; objectsTruncated: boolean;
  objects: { objectId: string; name: string; kind: string; editable: boolean; text: string; textTruncated: boolean;
    bounds: { x: number; y: number; width: number; height: number } }[] }
export type ValidationIssue = { slideId: string; objectId?: string; code: string }
export type EngineOutput = { slideCount: number; slides?: SlideSummary[]; hasMore?: boolean; buffer?: Uint8Array;
  html?: string; issues?: ValidationIssue[]; issuesTruncated?: boolean; template?: TemplateReport }
