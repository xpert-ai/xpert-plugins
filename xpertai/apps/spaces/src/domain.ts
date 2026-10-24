import { z } from 'zod/v3'
import { ForbiddenException } from '@nestjs/common'
import type { ContentActor, ContentOperation } from '@xpert-ai/plugin-sdk'

export const PLUGIN = '@xpert-ai/plugin-spaces'
export const PROVIDER = 'spaces'
export const VIEW = 'spaces.workspace'
export const id = z.string().uuid()
export const title = z.string().trim().min(1).max(200)
export const actorSchema = z.object({ tenantId: id, organizationId: id, userId: id, assistantId: id.optional(), projectId: id.optional() })
export type SpaceActor = ContentActor & { assistantId?: string; projectId?: string }
export const roleSchema = z.enum(['viewer', 'commenter', 'editor', 'manager', 'owner'])
export type Role = z.infer<typeof roleSchema>
export const rank: Record<Role, number> = { viewer: 1, commenter: 2, editor: 3, manager: 4, owner: 5 }
export const required: Record<ContentOperation, number> = { read: 1, comment: 2, write: 3, manage: 4 }
export const kindSchema = z.enum(['folder', 'page', 'file', 'artifact'])
export type ItemKind = z.infer<typeof kindSchema>
export const blockSchema = z.object({
  id, kind: z.enum(['paragraph', 'heading', 'code', 'bullet']), text: z.string().max(100000)
}).strict()
export const blocksSchema = z.array(blockSchema).min(1).max(1000)
export type Block = z.infer<typeof blockSchema>
export const patchSchema = z.object({
  itemId: id, mutationId: id, expectedSequence: z.number().int().nonnegative(),
  blockId: id, before: z.string().max(100000), after: z.string().max(100000),
  reason: z.string().max(2000).default('')
}).strict()
export type PagePatch = z.infer<typeof patchSchema>
export const scoped = (actor: ContentActor) => ({ tenantId: actor.tenantId, organizationId: actor.organizationId })
export const denied = () => new ForbiddenException('spaces.access_denied')
