import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

export const workspacePortableFileReferenceSchema = z
  .object({
    source: z.literal('platform.workspace.files'),
    tenantId: z.string().trim().min(1).nullish(),
    organizationId: z.string().trim().min(1).nullish(),
    catalog: z.enum(['projects', 'users', 'knowledges', 'skills', 'xperts']).nullish(),
    scopeId: z.string().trim().min(1).nullish(),
    filePath: z.string().trim().min(1),
    workspacePath: z.string().trim().min(1),
    projectId: z.string().trim().min(1).nullish(),
    knowledgeId: z.string().trim().min(1).nullish(),
    rootId: z.string().trim().min(1).nullish(),
    xpertId: z.string().trim().min(1).nullish(),
    userId: z.string().trim().min(1).nullish(),
    isolateByUser: z.boolean().nullish(),
    originalName: z.string().trim().min(1).nullish(),
    name: z.string().trim().min(1).nullish(),
    mimeType: z.string().trim().min(1).nullish(),
    size: z.number().int().nonnegative().nullish()
  })
  .strict()

export type WorkspacePortableFileReferenceInput = WorkspacePortableFileReference
