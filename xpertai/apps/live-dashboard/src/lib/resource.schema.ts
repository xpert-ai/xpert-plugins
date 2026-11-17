/** @internal Offline content-authoring adapter. Runtime storage and transport use library/resource-contract V2. */
import { z } from 'zod/v3'
import { exploreKeySchema } from './explore.schema'

export const RESOURCE_TYPE = 'live-dashboard-library-resource'
export const RESOURCE_MAX_BYTES = 8_000_000
export const LIBRARY_MAX_BYTES = 32_000_000
export const LIBRARY_MAX_RESOURCES = 100
export const resourceKinds = ['analysis-template', 'public-dataset', 'visual-theme', 'component', 'example-task'] as const
export const resourceKindSchema = z.enum(resourceKinds)
export const resourceKey = z.string().uuid()
export const resourceVersion = z.string().regex(/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/)
export const fieldKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).refine(v => !['constructor','prototype','__proto__'].includes(v))
const scalar = z.union([z.string().max(4096), z.number().finite(), z.boolean(), z.null()])
export const resourceRefSchema = z.object({ logicalId: resourceKey, version: resourceVersion, role: fieldKey }).strict()
export const resourcePresentationSchema = z.object({ cover: exploreKeySchema.optional(), category: z.string().max(60).optional() }).strict()
export const resourceHeaderSchema = z.object({
  schema: z.literal('xpert.library.resource'), formatVersion: z.literal(1), logicalId: resourceKey, version: resourceVersion,
  title: z.string().min(1).max(160), description: z.string().max(4000), tags: z.array(z.string().min(1).max(40)).max(12),
  license: z.object({ identifier: z.string().min(1).max(100), attribution: z.string().max(2000) }).strict(),
  presentation: resourcePresentationSchema.optional(),
  provenance: z.enum(['synthetic', 'user-provided', 'open-data']), dependencies: z.array(resourceRefSchema).max(30)
}).strict()
export const resourceColumnSchema = z.object({ key: fieldKey, label: z.string().min(1).max(160),
  type: z.enum(['string','number','boolean','date']), nullable: z.boolean() }).strict()
const dataset = z.object({ columns: z.array(resourceColumnSchema).min(1).max(80), rows: z.array(z.record(fieldKey, scalar)).max(50_000) }).strict()
export const hotelRoles = ['booking_id','arrival_date','is_cancelled','adr','nights','hotel','channel','lead_time','deposit_type','country','reserved_room','assigned_room'] as const
export const resourceSchema = z.discriminatedUnion('kind', [
  resourceHeaderSchema.extend({ kind: z.literal('public-dataset'), content: dataset }),
  resourceHeaderSchema.extend({ kind: z.literal('analysis-template'), content: z.object({ recipe: z.literal('hotel-operations'),
    roles: z.array(z.object({ role: z.enum(hotelRoles), required: z.boolean(), type: resourceColumnSchema.shape.type }).strict()).min(3).max(12),
    currency: z.string().regex(/^[A-Z]{3}$/) }).strict() }),
  resourceHeaderSchema.extend({ kind: z.literal('visual-theme'), content: z.object({ theme: z.enum(['system','slate','contrast']) }).strict() }),
  resourceHeaderSchema.extend({ kind: z.literal('component'), content: z.object({ chart: z.enum(['bar','line','area','pie','details']) }).strict() }),
  resourceHeaderSchema.extend({ kind: z.literal('example-task'), content: z.object({ execution: z.enum(['managed-template','agent-task']).optional(), question: z.string().min(1).max(8000), skills: z.array(z.string().min(1).max(160)).max(12).optional() }).strict() })
]).superRefine((r, ctx) => {
  if (new Set(r.dependencies.map(d => d.role)).size !== r.dependencies.length) ctx.addIssue({ code:'custom', message:'Duplicate dependency role' })
  if (r.kind === 'analysis-template') {
    if (new Set(r.content.roles.map(item => item.role)).size !== r.content.roles.length ||
      ['booking_id','arrival_date','is_cancelled'].some(role => !r.content.roles.some(item => item.role === role && item.required)))
      ctx.addIssue({code:'custom',message:'Hotel template requires unique roles and the three core fields'})
  }
  if (r.kind !== 'public-dataset') return
  const {columns,rows} = r.content
  if (new Set(columns.map(c=>c.key)).size !== columns.length) ctx.addIssue({code:'custom',message:'Duplicate dataset column'})
  for (const row of rows) {
    if (Object.keys(row).length !== columns.length || columns.some(c => !Object.hasOwn(row,c.key) ||
      (row[c.key] === null ? !c.nullable : c.type === 'date' ? typeof row[c.key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(row[c.key])) || !isIsoDate(String(row[c.key])) : typeof row[c.key] !== c.type))) {
      ctx.addIssue({code:'custom',message:'Dataset row does not match declared columns'}); break
    }
  }
})
export type LibraryResourceDocument = z.output<typeof resourceSchema>
export type LibraryResourceKind = z.output<typeof resourceKindSchema>
export const resourceIdentity = (r: {logicalId:string;version:string}) => `${r.logicalId}@${r.version}`
export const catalogQuerySchema = z.object({ page:z.number().int().min(1).max(100000).default(1), pageSize:z.number().int().min(1).max(50).default(24),
  search:z.string().max(100).default(''), tag:z.string().max(40).optional(), kind:resourceKindSchema.optional(), audience:z.enum(['mine','public']).default('mine') }).strict()
export const catalogTargetSchema = z.object({ releaseId:z.string().uuid() }).strict()

/** Sort keys for stable digests; semantic array order remains significant. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

function isIsoDate(value:string):boolean {
  const time=Date.parse(value)
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value
}
