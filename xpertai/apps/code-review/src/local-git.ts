import { z } from 'zod/v3'
import { idSchema, shaSchema, fileSchema } from './domain.js'

const relativePath = z.string().min(1).max(1000).refine(value => !value.startsWith('/') && !value.includes('\\') &&
  !value.includes('\0') && !value.split('/').some(part => !part || part === '.' || part === '..' || part === '.git'), 'Repository-relative path required')
export const localGitSourcesSchema = z.array(z.object({ path: relativePath, base: z.string().max(500_000).nullable(),
  head: z.string().max(500_000).nullable() }).strict()).max(200)
export type LocalGitSources = z.output<typeof localGitSourcesSchema>
export const localGitImportSchema = z.object({ requestId: idSchema, repository: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300), baseSha: shaSchema, headSha: shaSchema,
  files: z.array(fileSchema.extend({ filename: relativePath, previous_filename: relativePath.optional(),
    patch: z.string().max(500_000).optional(), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative() }).strict()).min(1).max(200),
  sources: localGitSourcesSchema, instructions: z.string().max(6000).default('')
}).strict().superRefine((value, ctx) => {
  const names = new Set(value.files.map(file => file.filename))
  const sourceNames = new Set(value.sources.map(file => file.path))
  if (names.size !== value.files.length || sourceNames.size !== value.sources.length || value.sources.some(file => !names.has(file.path)))
    ctx.addIssue({ code: 'custom', message: 'Unique changed-file sources required' })
  if (new TextEncoder().encode(JSON.stringify(value)).length > 5_000_000) ctx.addIssue({ code: 'custom', message: 'Local review bundle exceeds 5 MB' })
})
export type LocalGitImport = z.output<typeof localGitImportSchema>
