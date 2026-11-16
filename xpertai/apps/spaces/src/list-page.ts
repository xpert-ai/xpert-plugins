import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { z } from 'zod/v3'
import type { Repository } from 'typeorm'
import type { SpaceItem } from './entities.js'
import { id, scoped, type SpaceActor } from './domain.js'
import type { ContentPathCoverage } from './content-coverage.js'

export const listQuery = z.object({
  trash: z.boolean().default(false), search: z.string().max(200).default(''),
  parentId: id.nullable().optional(), kind: z.enum(['folder', 'page', 'file']).optional(),
  cursor: z.string().max(1000).optional(), pageSize: z.number().int().min(1).max(100).default(50),
  page: z.number().int().min(1).max(100000).default(1)
}).strict()
export type ListQuery = z.infer<typeof listQuery>
const cursorSchema = z.object({ key: z.string(), at: z.string().datetime(), id }).strict()

/** SQL reaches only roots and their same-space descendants. Orphans/cycles cannot
 * enter the result, and a deleted ancestor hides active descendants. No per-row ACL cache. */
export async function listItems(repo: Repository<SpaceItem>, actor: SpaceActor, spaceId: string,
  input: ListQuery, coverage: ContentPathCoverage[]) {
  const key = createHash('sha256').update(JSON.stringify([actor, spaceId, input.trash, input.search, input.parentId, input.kind])).digest('hex')
  let after: z.infer<typeof cursorSchema> | undefined
  if (input.cursor) {
    try { after = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'))) }
    catch { throw new BadRequestException('spaces.invalid_cursor') }
    if (after.key !== key) throw new BadRequestException('spaces.invalid_cursor')
  }
  const query = repo.createQueryBuilder('item').where({ ...scoped(actor), spaceId, deleted: input.trash })
    .select(['item.id', 'item.spaceId', 'item.parentId', 'item.parentPageId', 'item.title', 'item.kind', 'item.version',
      'item.deleted', 'item.filePath', 'item.updatedAt', 'item.editorKey', 'item.file', 'item.importOrigin', 'item.syncStatus'])
    .andWhere(`item.id IN (WITH RECURSIVE visible AS (
      SELECT id FROM plugin_spaces_item WHERE "tenantId" = :tenantId AND "organizationId" = :organizationId
        AND "spaceId" = :spaceId AND "parentId" IS NULL ${input.trash ? '' : 'AND deleted = false'}
      UNION ALL
      SELECT child.id FROM plugin_spaces_item child JOIN visible parent ON child."parentId" = parent.id
      WHERE child."tenantId" = :tenantId AND child."organizationId" = :organizationId AND child."spaceId" = :spaceId
        ${input.trash ? '' : 'AND child.deleted = false'}
    ) SELECT id FROM visible)`, { ...scoped(actor), spaceId })
    // JSON dates have millisecond precision; use the same precision in SQL ordering
    // and seeking so a microsecond database default cannot strand equal-time rows.
    .orderBy("date_trunc('milliseconds', item.updatedAt)", 'DESC').addOrderBy('item.id', 'ASC').take(input.pageSize + 1)
    .skip(input.cursor ? 0 : (input.page - 1) * input.pageSize)
  if (input.parentId !== undefined) {
    query.andWhere(input.parentId === null ? 'item.parentId IS NULL' : 'item.parentId = :parentId', { parentId: input.parentId })
  }
  if (input.kind) query.andWhere(input.kind === 'file' ? 'item.kind IN (:...kinds)' : 'item.kind = :kind', { kind: input.kind, kinds: ['file', 'artifact'] })
  if (input.search) query.andWhere('POSITION(LOWER(:search) IN LOWER(item.title || \' \' || COALESCE(item.filePath, \'\'))) > 0', { search: input.search })
  // Date parameters use the driver's timestamp conversion, matching UpdateDateColumn.
  // Passing an ISO string directly loses timezone conversion for timestamp-without-zone columns.
  if (after) query.andWhere("(date_trunc('milliseconds', item.updatedAt) < :at OR (date_trunc('milliseconds', item.updatedAt) = :at AND item.id > :id))", { id: after.id, at: new Date(after.at) })
  if (!input.trash) query.andWhere(`(item.filePath IS NULL OR (
    split_part(item.filePath, '/', 1) NOT IN ('.xpert', '.space-history', '.space-trash') AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CAST(:coverage AS jsonb)) AS covered
      WHERE item.filePath = covered->>'path' OR ((covered->>'recursive')::boolean
        AND LEFT(item.filePath, LENGTH(covered->>'path') + 1) = (covered->>'path') || '/')
    )))`, { coverage: JSON.stringify(coverage) })
  const rows = await query.getMany(), items = rows.slice(0, input.pageSize), last = items.at(-1)
  return { items, hasMore: rows.length > input.pageSize,
    ...(rows.length > input.pageSize && last ? { nextCursor: Buffer.from(JSON.stringify({ key, at: last.updatedAt.toISOString(), id: last.id })).toString('base64url') } : {}) }
}
