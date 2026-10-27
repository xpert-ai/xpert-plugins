import { BadRequestException, Injectable } from '@nestjs/common'
import type { ContentSourceInput, ContentReferenceProvider } from '@xpert-ai/plugin-sdk'
import type { ContentReferenceEntry, ContentReferenceTarget } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { SpaceAccess } from './access.js'
import { SpaceFiles } from './files.js'
import { SpaceDocuments } from './documents.js'
import type { SpaceItem } from './entities.js'
import { denied, scoped } from './domain.js'

/** Raster previews only. MIME supplied by a browser is not evidence of file content. */
export function rasterMime(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes)
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg'
  if (['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}
const querySchema = z.object({ kind: z.enum(['image', 'file', 'page']), query: z.string().trim().max(200),
  cursor: z.string().uuid().optional(), pageSize: z.number().int().min(1).max(50) })
const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** The document stores identity; this provider supplies its current authorized location.
 * Folder moves and renames therefore do not rewrite every referencing document.
 * The initial adapter deliberately limits references to the containing Project.
 */
@Injectable()
export class SpaceReferences implements ContentReferenceProvider {
  constructor(private readonly access: SpaceAccess, private readonly files: SpaceFiles, private readonly documents: SpaceDocuments) {}
  private actor(input: ContentSourceInput) { return { ...input.actor, projectId: input.projectId, assistantId: input.assistantId } }
  private async parent(input: ContentSourceInput, write = false) {
    const result = await this.access.resource(this.actor(input), input.sourceResourceId, write ? 'write' : 'read')
    if (!result.item || result.item.kind !== 'page' || result.space.projectId !== input.projectId) throw denied()
    return { ...result, item: result.item }
  }
  private entry(item: SpaceItem, kind: ContentReferenceTarget['kind']): ContentReferenceEntry {
    return { kind, providerKey: 'spaces', resourceId: item.id, title: item.title, path: item.filePath!,
      mimeType: kind === 'page' ? 'text/markdown' : item.file?.mimeType ?? 'application/octet-stream', size: item.file?.size ?? null }
  }
  listReferences: NonNullable<ContentReferenceProvider['listReferences']> = async (input) => {
    const query = querySchema.parse(input), { space } = await this.parent(input), actor = this.actor(input)
    const builder = this.access.items.createQueryBuilder('item').where({ ...scoped(actor), spaceId: space.id, deleted: false })
      .andWhere('item.filePath IS NOT NULL').andWhere('item.syncStatus = :ready', { ready: 'ready' })
      .andWhere('item.kind = :kind', { kind: query.kind === 'page' ? 'page' : 'file' })
    if (query.kind === 'page') builder.andWhere('item.editorKey = :editor', { editor: 'markdown.tiptap' })
    if (query.kind === 'image') builder.andWhere("item.file->>'mimeType' IN (:...mimes)", { mimes: imageTypes })
    if (query.cursor) builder.andWhere('item.id > :cursor', { cursor: query.cursor })
    // Position() treats %, _ and backslash literally, unlike an unescaped ILIKE.
    if (query.query) builder.andWhere('POSITION(LOWER(:search) IN LOWER(item.title)) > 0', { search: query.query })
    const rows = await builder.orderBy('item.id', 'ASC').take(query.pageSize + 1).getMany()
    const candidates = rows.slice(0, query.pageSize), items: ContentReferenceEntry[] = []
    for (const candidate of candidates) {
      try { await this.access.resource(actor, candidate.id, 'read'); items.push(this.entry(candidate, query.kind)) }
      catch (error) { if (!(error instanceof Error && error.message === 'spaces.access_denied')) throw error }
    }
    // Cursor advances over scanned rows, including inaccessible children of trashed folders.
    return { items, nextCursor: rows.length > query.pageSize ? candidates.at(-1)!.id : null }
  }
  uploadReference: NonNullable<ContentReferenceProvider['uploadReference']> = async (input) => {
    const { item, space } = await this.parent(input, true), actor = this.actor(input)
    if (!input.buffer.length || input.buffer.length > 25 * 1024 * 1024) throw new BadRequestException('spaces.file_too_large')
    const mime = input.kind === 'image' ? rasterMime(input.buffer) : 'application/octet-stream'
    if (!mime) throw new BadRequestException('spaces.image_format_unsupported')
    const name = z.string().trim().min(1).max(180).regex(/^[^/\\\u0000-\u001f]+$/u).parse(input.fileName)
    const uploaded = await this.files.upload(actor, space.id, item.parentId, name, mime, input.buffer)
    const saved = await this.access.items.findOneByOrFail({ ...scoped(actor), id: uploaded.item.id })
    return this.entry(saved, input.kind)
  }
  resolveReference: NonNullable<ContentReferenceProvider['resolveReference']> = async (input) => {
    const { space } = await this.parent(input), actor = this.actor(input)
    if (input.target.providerKey !== 'spaces') throw denied()
    const target = await this.access.resource(actor, input.target.resourceId, 'read')
    if (target.space.id !== space.id || !target.item || target.item.kind !== 'file' || input.target.kind === 'page') throw denied()
    const file = await this.files.current(actor, target.item.id)
    if (input.target.kind === 'image') {
      // Recheck actual bytes on each grant/redemption: project file writers may replace content.
      const disk = await this.documents.read(actor, target.space, target.item), mime = disk && rasterMime(disk.buffer)
      if (!mime) throw new BadRequestException('spaces.image_format_unsupported')
      return { ...file, mimeType: mime }
    }
    return { ...file, mimeType: 'application/octet-stream' }
  }
}
