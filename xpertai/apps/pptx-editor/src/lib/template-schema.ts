import { z } from 'zod/v3'
import { fileSchema } from './ai-schema.js'

export const templateSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), templateId: z.string().regex(/^[a-z0-9-]{1,100}$/), language: z.enum(['en', 'zh']) }).strict(),
  z.object({ kind: z.literal('file'), filePath: fileSchema.shape.filePath, expectedRevision: z.string().min(1).max(300) }).strict()
])
export const templateInspectSchema = z.object({ source: templateSourceSchema,
  offset: z.number().int().min(0).max(499).default(0), limit: z.number().int().min(1).max(3).default(1) }).strict()
const objectId = z.string().regex(/^\d{1,12}$/)
const imagePath = z.string().min(1).max(500).refine(path => !path.startsWith('/') && !path.includes('\\') &&
  !path.split('/').some(part => !part || part === '.' || part === '..') && !/[\u0000-\u001f]/.test(path))
export const templateFillSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), objectId, text: z.string().max(4000) }).strict(),
  z.object({ kind: z.literal('table'), objectId, rows: z.array(z.array(z.string().max(500)).min(1).max(20)).min(1).max(30) }).strict(),
  z.object({ kind: z.literal('chart'), objectId,
    series: z.array(z.string().min(1).max(120)).min(1).max(8),
    categories: z.array(z.object({ label: z.string().max(120), values: z.array(z.number().finite()).min(1).max(8) }).strict()).min(1).max(30) }).strict(),
  z.object({ kind: z.literal('image'), objectId, filePath: imagePath, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
])
export const templateComposeSchema = z.object({ operationId: z.string().uuid(), title: z.string().trim().min(1).max(160), source: templateSourceSchema,
  slides: z.array(z.object({ sourceSlide: z.number().int().min(1).max(500), notes: z.string().max(8000).optional(),
    fills: z.array(templateFillSchema).max(100).default([]) }).strict()).min(1).max(40)
}).strict().superRefine((value, ctx) => {
  if (value.slides.reduce((n, slide) => n + slide.fills.length, 0) > 500)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At most 500 fills per presentation.' })
  for (const [index, slide] of value.slides.entries()) {
    if (new Set(slide.fills.map(fill => fill.objectId)).size !== slide.fills.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slides', index], message: 'An object may be filled once per output slide.' })
    for (const fill of slide.fills) if (fill.kind === 'chart' && fill.categories.some(category => category.values.length !== fill.series.length))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slides', index], message: 'Chart values must match the series count.' })
  }
})
export type TemplateSource = z.infer<typeof templateSourceSchema>
export type TemplateCompose = z.infer<typeof templateComposeSchema>
export type TemplateFill = z.infer<typeof templateFillSchema>
export const templateObjectSchema = z.object({ objectId, name: z.string(), kind: z.enum(['text', 'image', 'table', 'chart', 'unsupported']),
  text: z.string(), fillable: z.boolean(), nameIndex: z.number().int(), rows: z.number().optional(), columns: z.number().optional(),
  chartType: z.string().optional(), bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional() })
export const templateReportSchema = z.object({ slideCount: z.number(), masterCount: z.number(), layoutCount: z.number(),
  issues: z.array(z.object({ code: z.string(), part: z.string(), blocking: z.boolean() })),
  slides: z.array(z.object({ number: z.number(), path: z.string(), notes: z.string(), objects: z.array(templateObjectSchema) })) })
export type TemplateReport = z.infer<typeof templateReportSchema>
export type TemplateObject = z.infer<typeof templateObjectSchema>
export type TemplateEngineInput = ({ action: 'templateInspect' } | { action: 'templateCompose' }) & { buffer: Uint8Array; plan?: TemplateCompose;
  images?: { filePath: string; buffer: Uint8Array; extension: 'png' | 'jpg' }[] }
export const templateCatalogSchema = z.object({ schemaVersion: z.literal(1), source: z.object({ repository: z.string(), commit: z.string() }),
  templates: z.array(z.object({ id: z.string(), category: z.string(), names: z.object({ en: z.string(), zh: z.string() }), description: z.string(),
    palette: z.object({ background: z.string(), text: z.string(), accent: z.string() }).passthrough(),
    variants: z.object({ en: z.object({ sha256: z.string(), bytes: z.number(), nativeObjects: z.number() }), zh: z.object({ sha256: z.string(), bytes: z.number(), nativeObjects: z.number() }) }),
    layouts: z.array(z.object({ number: z.number(), name: z.string(), family: z.string(), description: z.string(), density: z.string() }))
  })) })
export type TemplateCatalog = z.infer<typeof templateCatalogSchema>
