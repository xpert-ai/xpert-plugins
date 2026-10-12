import { z } from 'zod/v3'

export const PLUGIN = '@xpert-ai/plugin-code-review'
export const NAMESPACE = 'code_review'
export const FEATURE = 'code_review.core'
export const PROVIDER = 'code_review.provider'
export const VIEW = 'code_review.workspace'
export const MIDDLEWARE = 'code_review.tools'
export const scopeSchema = z.object({
  tenantId: z.string().min(1), organizationId: z.string().min(1), userId: z.string().min(1),
  assistantId: z.string().min(1), workspaceId: z.string().nullish()
})
export type Scope = z.infer<typeof scopeSchema>
export const idSchema = z.string().uuid()
export const shaSchema = z.string().regex(/^[a-f0-9]{40}$/)
export const refSchema = z.object({
  provider: z.literal('github'), owner: z.string().regex(/^[\w.-]+$/),
  repository: z.string().regex(/^[\w.-]+$/), number: z.number().int().positive()
}).strict()
export type PullRef = z.infer<typeof refSchema>
export const findingSchema = z.object({
  title: z.string().min(1).max(200), body: z.string().min(1).max(6000),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']), path: z.string().min(1).max(1000),
  side: z.enum(['LEFT', 'RIGHT']), line: z.number().int().positive()
}).strict()
export type Finding = z.infer<typeof findingSchema>
export const fileSchema = z.object({
  filename: z.string(), previous_filename: z.string().optional(), status: z.string(),
  additions: z.number(), deletions: z.number(), patch: z.string().optional()
})
export const snapshotSchema = z.object({
  title: z.string(), body: z.string().nullable(), url: z.string(), state: z.string(),
  author: z.string(), baseSha: shaSchema, headSha: shaSchema, files: z.array(fileSchema),
  comments: z.array(z.object({ id: z.number(), body: z.string(), author: z.string(), url: z.string() })),
  checks: z.array(z.object({ id: z.number(), name: z.string(), status: z.string(), conclusion: z.string().nullable(), url: z.string().nullable() })),
  warnings: z.array(z.string()), fetchedAt: z.string()
})
export type Snapshot = z.infer<typeof snapshotSchema>
export const resultSchema = z.object({ summary: z.string().min(1).max(12000), findings: z.array(findingSchema).max(100) }).strict()
export class ReviewError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ReviewError' }
}
export function parsePullUrl(value: string): PullRef {
  const url = new URL(value)
  const match = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\/?$/)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || !match)
    throw new ReviewError('invalid_pull_request_url')
  return refSchema.parse({ provider: 'github', owner: match[1], repository: match[2], number: Number(match[3]) })
}

/** Validate provider diff coordinates, including context lines on either side. */
export function diffLines(patch: string): Array<{ left: number | null; right: number | null; text: string; kind: 'context' | 'added' | 'removed' | 'header' }> {
  let left = 0, right = 0, active = false
  return patch.split('\n').map(text => {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) { left = Number(hunk[1]); right = Number(hunk[2]); active = true; return { left: null, right: null, text, kind: 'header' as const } }
    if (!active || text.startsWith('\\') || !/^[ +\-]/.test(text)) return { left: null, right: null, text, kind: 'header' as const }
    if (text.startsWith('+')) return { left: null, right: right++, text, kind: 'added' as const }
    if (text.startsWith('-')) return { left: left++, right: null, text, kind: 'removed' as const }
    return { left: left++, right: right++, text, kind: 'context' as const }
  })
}
export function validateFindings(snapshot: Snapshot, findings: Finding[]) {
  for (const finding of findings) {
    const file = snapshot.files.find(f => f.filename === finding.path)
    if (!file?.patch || !diffLines(file.patch).some(l => (finding.side === 'RIGHT' ? l.right : l.left) === finding.line))
      throw new ReviewError('finding_outside_diff')
  }
}
