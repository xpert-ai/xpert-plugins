import { t, i18n } from './i18n'
import { z } from 'zod/v3'
export const itemSchema = z.object({
  importOrigin: z.object({ provider: z.string(), documentId: z.string(), url: z.string().nullable(), revision: z.string(), importedAt: z.string(), warnings: z.array(z.string()) }).nullable().optional(),
  canWrite: z.boolean().optional(),
  sourceSync: z.object({ status: z.enum(['synced', 'pending', 'failed']), revision: z.string().optional() }).optional(),
  preview: z.object({ kind: z.literal('outline'), revision: z.string(), lines: z.array(z.string()) }).optional(),
  resourceRevision: z.string().optional(), allowedActions: z.array(z.string()).optional(),
  availability: z.enum(['available', 'provider-unavailable']).optional(), resourceTypeId: z.string().optional(),
  compatibleEditors: z.array(z.object({ key: z.string(), title: z.string() })).optional(),
  id: z.string(), spaceId: z.string().optional(), parentId: z.string().nullable().optional(), parentPageId: z.string().nullable().optional(),
  editorKey: z.string().nullable().optional(), title: z.string(), kind: z.string().optional(), version: z.number(), role: z.string().optional(),
  deleted: z.boolean().optional(), filePath: z.string().nullable().optional(), updatedAt: z.string().optional(),
  syncStatus: z.string().optional(), knowledgebaseId: z.string().nullable().optional()
})
export type Item = z.infer<typeof itemSchema>
export const listSchema = z.object({ meta: z.object({
  root: itemSchema, items: z.array(itemSchema), role: z.string(), canWrite: z.boolean(), canManage: z.boolean(),
  project: z.object({ id: z.string(), title: z.string() })
}) })
export const proposalSchema = z.object({ id: z.string(), status: z.string(), patch: z.object({ before: z.string(), after: z.string(), reason: z.string() }) })
export const commentSchema = z.object({ id: z.string(), body: z.string(), resolved: z.boolean() })
export const revisionSchema = z.object({ id: z.string(), sequence: z.number(), label: z.string(), createdAt: z.string().optional() })
export const revisionPreviewSchema = revisionSchema.extend({ markdown: z.string(), blocks: z.array(z.object({ id: z.string(), kind: z.string(), text: z.string() })) })
export const errorText = (error: unknown) => {
  if (error instanceof Error && error.name === 'AbortError') return ''
  const message = error instanceof Error ? error.message : t('error.retry')
  if (/folder_contains_resources/u.test(message)) return i18n.message('catalog.folderNotEmpty')
  if (/conflict|sources_changed|file.changed/iu.test(message)) return i18n.message('error.conflict')
  if (/denied|Forbidden|403/u.test(message)) return i18n.message('error.denied')
  if (/ai_timeout|aborted|timeout/iu.test(message)) return i18n.message('error.timeout')
  if (/model|copilot/iu.test(message)) return i18n.message('error.model')
  return error instanceof Error ? error : i18n.message('error.retry')
}
export const kindName = (kind?: string) => ({ page: t('kind.page'), folder: t('kind.folder'), file: t('kind.file'), artifact: t('kind.artifact') })[kind ?? 'file'] ?? t('kind.file')
export const dateText = (value?: string) => value ? i18n.date(value, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
