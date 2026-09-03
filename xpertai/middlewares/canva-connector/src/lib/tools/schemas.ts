import { z } from 'zod/v3'

const boundedId = z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9:_./-]+$/)
const operationId = z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9._:-]+$/)
const confirmation = z.string().trim().min(32).max(200).optional()

export const emptySchema = z.object({}).strict()
export const connectionStatusSchema = emptySchema
export const searchDesignsSchema = z.object({ query: z.string().trim().min(1).max(240).optional(), page: z.number().int().positive().max(100_000).default(1), pageSize: z.number().int().min(1).max(50).default(20) }).strict()
export const designIdSchema = z.object({ designId: boundedId }).strict()
export const generateDesignSchema = z.object({ prompt: z.string().trim().min(5).max(1_000), designType: z.enum(['poster', 'presentation', 'xiaohongshu', 'resume']), language: z.enum(['zh-CN', 'en-US']).default('zh-CN') }).strict()
export const editingStartSchema = z.object({ designId: boundedId, operationId }).strict()
export const editingPerformSchema = z.object({ designId: boundedId, transactionId: boundedId, operationId, operations: z.array(z.object({ type: z.enum(['insert_text', 'replace_text', 'delete_element', 'set_property']), targetId: boundedId, path: z.string().trim().min(1).max(160).optional(), value: z.union([z.string().max(2_000), z.number().finite(), z.boolean(), z.null()]).optional() }).strict()).min(1).max(20) }).strict()
export const editingCommitSchema = z.object({ designId: boundedId, transactionId: boundedId, operationId, confirmation }).strict()
export const editingCancelSchema = z.object({ designId: boundedId, transactionId: boundedId }).strict()
export const exportSchema = z.object({ designId: boundedId, format: z.enum(['png', 'jpg', 'jpeg', 'pdf', 'pptx']), operationId, confirmation }).strict()
export const importSchema = z.object({ url: z.string().trim().url().max(2_000).refine(isSafeImportUrl, 'URL must be a public HTTPS URL'), operationId, confirmation }).strict()
export const jobStatusSchema = z.object({ jobId: boundedId }).strict()

function isSafeImportUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1') return false
    if (/^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
    return true
  } catch { return false }
}
