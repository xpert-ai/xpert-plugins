import { z } from 'zod/v3'

export const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const contentIdSchema = z.string().min(1).max(512)
export const requestIdSchema = z.string().uuid()
export const managerOptionsSchema = z.object({
  allowMixedOrientation: z.boolean(),
  floatingWindowMinWidth: z.number().finite().min(1).max(10000),
  floatingWindowMinHeight: z.number().finite().min(1).max(10000)
}).strict()
export const workspaceStateSchema = z.object({
  layoutJson: z.string().min(1).max(4 * 1024 * 1024),
  theme: z.enum(['dark', 'light', 'aero', 'vs2010', 'metro', 'contrast']),
  preset: z.enum(['development', 'focus', 'design', 'debug']),
  options: managerOptionsSchema,
  sources: z.array(z.object({ ContentId: z.string().min(1).max(512), Title: z.string().max(512), message: z.string().max(4000) }).strict()).max(10000).optional()
}).strict()
export type WorkspaceState = z.infer<typeof workspaceStateSchema>
export type ManagerOptions = WorkspaceState['options']

// Trusted identity is supplied only by the host adapter, never by View or model inputs.
export const scopeSchema = z.object({
  tenantId: z.string().min(1).max(128),
  organizationId: z.string().max(128),
  workspaceId: z.string().max(128),
  userId: z.string().min(1).max(128),
  xpertId: z.string().min(1).max(128)
}).strict()
export type WorkspaceScope = z.infer<typeof scopeSchema>
export const saveWorkspaceSchema = z.object({ expectedRevision: revisionSchema, state: workspaceStateSchema }).strict()
export const saveBuffersSchema = z.object({
  expectedRevision: revisionSchema,
  buffers: z.array(z.object({ contentId: contentIdSchema, text: z.string().max(4 * 1024 * 1024) }).strict())
    .max(10000)
    .superRefine((items, ctx) => {
      if (new Set(items.map(item => item.contentId)).size !== items.length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate buffer contentId' })
      if (items.reduce((n, item) => n + item.text.length, 0) > 16 * 1024 * 1024)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Buffer save exceeds 16 MiB' })
    })
}).strict()
export const saveScratchpadSchema = z.object({ expectedRevision: revisionSchema, text: z.string().max(4 * 1024 * 1024) }).strict()
export type BufferEntry = z.infer<typeof saveBuffersSchema>['buffers'][number]

export const workspaceLoadSchema = z.object({
  workspace: z.object({ revision: revisionSchema, state: workspaceStateSchema.nullable() }).strict(),
  buffers: z.object({ revision: revisionSchema, items: saveBuffersSchema.shape.buffers }).strict(),
  scratchpad: z.object({ revision: revisionSchema, text: saveScratchpadSchema.shape.text.nullable() }).strict(),
  proposal: z.null()
}).strict()

export type DomainErrorCode = 'not_found' | 'conflict' | 'invalid_layout' | 'invalid_target' |
  'capability_denied' | 'expired' | 'invalid_state' | 'request_key_reused' | 'not_initialized'
export class DockyardError extends Error {
  constructor(readonly code: DomainErrorCode, readonly contentId?: string) {
    super(code)
    this.name = 'DockyardError'
  }
}
