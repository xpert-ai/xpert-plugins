import { z } from 'zod'
const text = z.string().max(12000).regex(/^[^\r\n\u0000]*$/, 'Use separate blocks for paragraphs')
const path = z.string().min(1).max(2000).refine(value => !value.startsWith('/') && !value.includes('\\') && !value.includes('\u0000') && value.split('/').every(part => part !== '..' && part !== '.') && value.toLowerCase().endsWith('.docx'), 'Use a project-relative DOCX path')
const revision = z.string().min(1).max(300)
export const templates = [
  { id: 'report', title: { en_US: 'Business report', zh_Hans: '业务报告' }, color: '#10263A' },
  { id: 'proposal', title: { en_US: 'Project proposal', zh_Hans: '项目方案' }, color: '#116A67' },
  { id: 'minutes', title: { en_US: 'Meeting minutes', zh_Hans: '会议纪要' }, color: '#374151' }
] as const
export const createSchema = z.object({ operationId: z.string().uuid(), title: text.min(1).max(200),
  templateId: z.enum(['report', 'proposal', 'minutes']),
  blocks: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('heading'), text, level: z.number().int().min(1).max(3) }).strict(),
    z.object({ kind: z.literal('paragraph'), text }).strict(),
    z.object({ kind: z.literal('list'), items: z.array(text).min(1).max(40) }).strict(),
    z.object({ kind: z.literal('table'), rows: z.array(z.array(text.max(2000)).min(1).max(12)).min(1).max(40).refine(rows => rows.every(row => row.length === rows[0].length), 'Table rows must have equal width') }).strict()
  ])).min(1).max(120) }).strict().refine(input => JSON.stringify(input).length <= 500_000, 'Document plan is too large')
export const inspectSchema = z.object({ filePath: path, offset: z.number().int().min(0).max(10000).default(0), limit: z.number().int().min(1).max(30).default(20) }).strict()
export const versionSchema = z.object({ filePath: path, expectedRevision: revision }).strict()
export const applySchema = versionSchema.extend({ operationId: z.string().uuid(),
  edits: z.array(z.object({ paragraphId: z.string().regex(/^[A-Fa-f0-9]{8}$/), expectedText: text,
    text, style: z.enum(['preserve', 'Title', 'Heading 1', 'Heading 2', 'Heading 3', 'Normal']).default('preserve') }).strict()).min(1).max(30) }).strict()
export const templateSchema = versionSchema.extend({ operationId: z.string().uuid(), title: text.min(1).max(200),
  slots: z.array(z.object({ tag: z.string().min(1).max(200), text }).strict()).min(1).max(60) }).strict()
export type CreateInput = z.infer<typeof createSchema>
export type EditInput = z.infer<typeof applySchema>
export type TemplateInput = z.infer<typeof templateSchema>
export type EngineInput = { buffer?: Uint8Array } & (
  { action: 'create'; input: CreateInput } | { action: 'inspect'; offset: number; limit: number } |
  { action: 'apply'; edits: EditInput['edits'] } | { action: 'fill'; slots: TemplateInput['slots'] })
export interface EngineOutput {
  buffer?: Uint8Array
  paragraphs?: { paragraphId: string; text: string; truncated: boolean }[]
  total?: number
  slots?: { tag: string; title: string; type: string; lock: string }[]
}
