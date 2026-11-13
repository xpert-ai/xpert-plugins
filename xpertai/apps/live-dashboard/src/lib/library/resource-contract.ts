import { z } from 'zod/v3'
import { analyticsFieldSchema } from '@xpert-ai/plugin-sdk/analytics'

/** @beta Portable library contracts may change incompatibly until the resource format stabilizes. */
export const LIBRARY_NAMESPACE = 'live_dashboard'
export const libraryTable = (key: string) => `plugin_${LIBRARY_NAMESPACE}_${key}`
export const LIBRARY_FILE_TYPE = 'live-dashboard-library-file'
export const limits = { documentBytes: 8_000_000, archiveBytes: 32_000_000, expandedBytes: 32_000_000,
  assetBytes: 16_000_000, resources: 100, assets: 200, compressionRatio: 500 } as const
export const keySchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/)
  .refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const versionSchema = z.string().regex(/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/)
export const kindSchema = z.enum(['example-task', 'analysis-template', 'visual-theme', 'component', 'public-dataset'])
export const licenseSchema = z.object({ identifier: z.string().min(1).max(100), attribution: z.string().max(2000) }).strict()
export const referenceSchema = z.object({ logicalId: z.string().uuid(), version: versionSchema, sha256: digestSchema }).strict()
export const dependencySchema = referenceSchema.extend({ alias: keySchema, kind: kindSchema }).strict()
export const assetSchema = z.object({ id: keySchema, sha256: digestSchema, size: z.number().int().positive().max(limits.assetBytes),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/json', 'text/csv', 'text/html', 'text/plain']),
  fileName: z.string().min(1).max(180).refine(value => !/[\\/\u0000-\u001f]/.test(value)),
  purpose: z.enum(['cover', 'preview', 'data', 'document', 'supporting']), license: licenseSchema }).strict()
const requirements = z.object({
  skills: z.array(z.object({ name: z.string().min(1).max(160), required: z.boolean() }).strict()).max(12),
  plugins: z.array(z.object({ name: z.string().min(1).max(160), versionRange: z.string().min(1).max(100) }).strict()).max(20),
  capabilities: z.array(z.string().min(1).max(160)).max(30)
}).strict()
const text = z.object({ title: z.string().min(1).max(160), description: z.string().max(4000) }).strict()
const locale = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/)
const header = z.object({ schema: z.literal('xpert.library.resource'), formatVersion: z.literal(2),
  logicalId: z.string().uuid(), version: versionSchema, catalogKey: keySchema.optional(),
  ...text.shape, locale, translations: z.record(locale, text).optional(),
  categories: z.array(keySchema).max(12), tags: z.array(z.string().min(1).max(40)).max(12), license: licenseSchema,
  provenance: z.object({ kind: z.enum(['synthetic', 'user-provided', 'open-data']), description: z.string().max(2000) }).strict(),
  presentation: z.object({ coverAssetId: keySchema.optional(), previewAssetIds: z.array(keySchema).max(12).optional(), appearance: z.enum(['light', 'dark']).optional() }).strict().optional(),
  dependencies: z.array(dependencySchema).max(30), assets: z.array(assetSchema).max(limits.assets)
}).strict()
const valueSchema = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()])
const fieldRole = z.object({ role: keySchema, label: z.string().min(1).max(160), logicalType: analyticsFieldSchema.shape.logicalType,
  required: z.boolean(), nullable: z.boolean() }).strict()
const inputSlot = z.object({ key: keySchema, fields: z.array(fieldRole).min(1).max(80), grain: z.array(keySchema).max(80) }).strict()
const presentation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('standard'), charts: z.array(z.object({ id: keySchema, title: z.string().max(160),
    type: z.enum(['bar', 'line', 'area', 'pie', 'scatter']), slot: keySchema, x: keySchema, y: keySchema, color: keySchema.optional() }).strict()).max(20),
    tables: z.array(z.object({ id: keySchema, title: z.string().max(160), slot: keySchema, fields: z.array(keySchema).min(1).max(30) }).strict()).max(20) }).strict(),
  z.object({ type: z.literal('html'), documentAssetId: keySchema }).strict()
])
export const resourceV2Schema = z.discriminatedUnion('kind', [
  header.extend({ kind: z.literal('example-task'), content: z.object({ prompt: z.string().min(1).max(16000),
    dataRequirement: z.object({ mode: z.enum(['demo', 'web', 'external']), tools: z.array(z.string().max(160)).max(20) }).strict().optional(),
    execution: z.discriminatedUnion('mode', [z.object({ mode: z.literal('template'), templateAlias: keySchema }).strict(), z.object({ mode: z.literal('agent') }).strict()]),
    dataAliases: z.array(keySchema).max(20), themeAlias: keySchema.optional(),
    inputBindings: z.array(z.object({ slot: keySchema, dataAlias: keySchema, mapping: z.record(keySchema, keySchema) }).strict()).max(12).optional(), requirements }).strict() }),
  header.extend({ kind: z.literal('analysis-template'), content: z.object({ inputSlots: z.array(inputSlot).min(1).max(12),
    parameters: z.array(z.object({ key: keySchema, label: z.string().max(160), type: z.enum(['string', 'number', 'boolean', 'date']),
      defaultValue: valueSchema, allowedValues: z.array(valueSchema).max(200).optional() }).strict()).max(24),
    metrics: z.array(z.object({ key: keySchema, label: z.string().max(160), unit: z.string().max(40), definition: z.string().max(2000) }).strict()).max(40),
    presentation, requirements }).strict() }),
  header.extend({ kind: z.literal('visual-theme'), content: z.object({ renderer: z.literal('live-dashboard.standard'),
    theme: z.enum(['system', 'slate', 'contrast']) }).strict() }),
  header.extend({ kind: z.literal('component'), content: z.object({ renderer: z.enum(['bar', 'line', 'area', 'pie', 'scatter', 'details']),
    rendererVersion: z.literal(1), title: z.string().max(160), fields: z.array(fieldRole).max(80) }).strict() }),
  header.extend({ kind: z.literal('public-dataset'), content: z.object({ dataAssetId: keySchema, format: z.enum(['csv', 'json']),
    readerOptions: z.object({ encoding: z.literal('utf-8'), delimiter: z.enum([',', ';', '\t']).optional(), rowsPath: z.array(keySchema).max(8).optional() }).strict(),
    columns: z.array(z.object({ key: keySchema, label: z.string().min(1).max(160), logicalType: analyticsFieldSchema.shape.logicalType,
      nullable: z.boolean(), role: analyticsFieldSchema.shape.role.optional() }).strict()).min(1).max(80), statistics: z.object({ rowCount: z.number().int().nonnegative().nullable() }).strict() }).strict() })
]).superRefine((document, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
  const unique = (keys: string[], label: string) => { if (new Set(keys).size !== keys.length) issue(`Duplicate ${label}`) }
  unique(document.dependencies.map(d => d.alias), 'dependency alias')
  unique(document.assets.map(a => a.id), 'asset id')
  if (document.translations && Object.keys(document.translations).length > 20) issue('Too many translations')
  const asset = (id: string, purpose: z.infer<typeof assetSchema>['purpose']) => {
    const item = document.assets.find(a => a.id === id)
    if (!item || item.purpose !== purpose) issue(`Invalid ${purpose} asset`)
    return item
  }
  if (document.presentation?.coverAssetId) asset(document.presentation.coverAssetId, 'cover')
  for (const id of document.presentation?.previewAssetIds ?? []) asset(id, 'preview')
  for (const a of document.assets) {
    if (['cover', 'preview'].includes(a.purpose) && !a.mimeType.startsWith('image/')) issue('Preview must be an image')
    if (a.purpose === 'document' && a.mimeType !== 'text/html') issue('Document must be HTML')
  }
  if (document.kind === 'example-task') {
    const dependency = (alias: string, kind: z.infer<typeof kindSchema>) => {
      if (!document.dependencies.some(d => d.alias === alias && d.kind === kind)) issue('Dependency type mismatch')
    }
    const content = document.content
    if (content.execution.mode === 'template') dependency(content.execution.templateAlias, 'analysis-template')
    content.dataAliases.forEach(alias => dependency(alias, 'public-dataset'))
    unique(content.dataAliases, 'data alias')
    unique((content.inputBindings ?? []).map(input => input.slot), 'task input slot')
    for (const input of content.inputBindings ?? []) if (!content.dataAliases.includes(input.dataAlias)) issue('Task input dataset missing')
    if (content.themeAlias) dependency(content.themeAlias, 'visual-theme')
  }
  if (document.kind === 'public-dataset') {
    const { content } = document, file = asset(content.dataAssetId, 'data')
    if (file?.mimeType !== (content.format === 'json' ? 'application/json' : 'text/csv')) issue('Dataset MIME mismatch')
    if (content.format === 'json' && content.readerOptions.delimiter || content.format === 'csv' && content.readerOptions.rowsPath) issue('Invalid reader options')
    unique(content.columns.map(c => c.key), 'dataset field')
  }
  if (document.kind === 'analysis-template') {
    const c = document.content
    unique(c.inputSlots.map(s => s.key), 'input slot'); unique(c.parameters.map(p => p.key), 'parameter'); unique(c.metrics.map(m => m.key), 'metric')
    for (const parameter of c.parameters) {
      const matches = (value: z.infer<typeof valueSchema>) => {
        if (value === null) return true
        if (parameter.type !== 'date') return typeof value === parameter.type
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
        const date = new Date(`${value}T00:00:00Z`)
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
      }
      if (!matches(parameter.defaultValue) || parameter.allowedValues?.some(value => !matches(value))) issue('Parameter type mismatch')
      if (parameter.allowedValues && !parameter.allowedValues.includes(parameter.defaultValue)) issue('Default not in allowed values')
    }
    for (const slot of c.inputSlots) {
      unique(slot.fields.map(f => f.role), 'field role'); unique(slot.grain, 'grain')
      if (slot.grain.some(role => !slot.fields.some(f => f.role === role))) issue('Grain role missing')
    }
    if (c.presentation.type === 'html') asset(c.presentation.documentAssetId, 'document')
    else {
      const views = [...c.presentation.charts, ...c.presentation.tables]
      if (!views.length) issue('Standard template requires a view')
      unique(views.map(v => v.id), 'view')
      for (const view of views) {
        const slot = c.inputSlots.find(s => s.key === view.slot)
        const roles = 'fields' in view ? view.fields : [view.x, view.y, ...(view.color ? [view.color] : [])]
        if (!slot || roles.some(r => !slot.fields.some(f => f.role === r))) issue('View role missing')
        if ('y' in view && !slot?.fields.some(f => f.role === view.y && ['int64', 'float64', 'decimal'].includes(f.logicalType))) issue('Measure must be numeric')
      }
    }
  }
})
export type ResourceDocumentV2 = z.infer<typeof resourceV2Schema>
export type AssetDescriptor = z.infer<typeof assetSchema>
export type ResourceReference = z.infer<typeof referenceSchema>
export const identity = (r: { logicalId: string; version: string }) => `${r.logicalId}@${r.version}`
export const catalogV2Query = z.object({ page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(50).default(24),
  kind: kindSchema.optional(), category: keySchema.optional(), search: z.string().max(100).default(''), audience: z.enum(['mine', 'public']).default('mine'),
  appearance: z.enum(['all', 'light', 'dark']).default('all'), locale: z.enum(['en', 'zh-Hans', 'zh-Hant']).default('en') }).strict()
