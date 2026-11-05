import { z } from 'zod/v3'

const identity = z.object({ id: z.string().min(1), label: z.string().nullable() }).strict()
const repository = z.object({ owner: z.string(), name: z.string() }).strict()
// Ownership metadata is a separate projection, never a repository/settings DTO.
export const repositoryConflictSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('other_tenant'), repository }).strict(),
  z.object({
    kind: z.enum(['other_organization', 'other_assistant']), repository,
    organization: identity, configuredBy: identity, maintainer: identity.nullable(),
    assistant: identity.nullable(), enabled: z.boolean(),
    createdAt: z.string().datetime(), updatedAt: z.string().datetime()
  }).strict()
])
export type RepositoryConflict = z.infer<typeof repositoryConflictSchema>
