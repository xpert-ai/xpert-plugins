import { z } from 'zod/v3'
export const descriptorSchema = z.object({ id: z.string(), projectId: z.string(), path: z.string(), title: z.string(),
  modelKey: z.string(), schemaVersion: z.number(), epoch: z.number(), headRevisionId: z.string(), fileHash: z.string(),
  sequence: z.number(), status: z.enum(['ready', 'pending', 'conflict', 'failed', 'deleted', 'moving']) })
export const stateSchema = z.object({ document: descriptorSchema, stateBase64: z.string(), markdown: z.string(),
  blocks: z.array(z.object({ id: z.string(), type: z.string(), text: z.string() })), canWrite: z.boolean(), externalChange: z.boolean() })
export const sessionSchema = z.object({ sessionId: z.string(), clientKey: z.string(), documentId: z.string(),
  namespace: z.string(), connectionUrl: z.string().url(), access: z.enum(['read', 'write']), expiresAt: z.number(),
  actor: z.object({ presenceId: z.string(), displayName: z.string(), color: z.string(), actorType: z.enum(['user', 'agent', 'system']), avatarUrl: z.string().nullable().optional() }) })
export type DocumentState = z.infer<typeof stateSchema>
