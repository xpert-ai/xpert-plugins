import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod/v3'
import type { Repository } from 'typeorm'
import { ProjectFilesRuntimeCapability, WORKSPACE_FILES_SOURCE, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PresentationAsset, PresentationDeck } from './entities/index.js'
import { DASHIAI_UPSTREAM_COMMIT, PRESENTATION_THEME_PACKS } from './constants.js'
import { assertPresentationProject } from './presentation-project-access.js'
import { createPresentationYDoc, decodeYDoc, encodeYDoc, materializePresentationYDoc } from './presentation-yjs.js'
import type { PresentationJsonValue, PresentationScope } from './types.js'

const MAX_SOURCE_BYTES = 64 * 1024 * 1024
const json: z.ZodType<PresentationJsonValue> = z.lazy(() => z.union([z.string().max(MAX_SOURCE_BYTES), z.number().finite(), z.boolean(), z.null(), z.array(json), z.record(json)]))
const object = z.record(json)
const spec = z.object({ kind: z.literal('standard').optional(), title: z.string().min(1).max(1000), goal: z.string().max(100000),
  audience: z.string().nullable().optional(), owner: z.string().nullable().optional(), themePack: z.enum(PRESENTATION_THEME_PACKS),
  pageCount: z.number().int().min(0).max(100), allowMediaReuse: z.boolean().optional(), preview: object.optional(),
  slides: z.array(z.object({ id: z.string().min(1), layout: z.string().min(1), status: z.enum(['active', 'skipped', 'deleted']), sourceSlideId: z.string().nullable().optional(), props: object }).strict()).max(100) }).strict()
const editor = z.object({ slideOrder: z.array(z.string()), skippedSlides: z.array(z.string()), deletedSlides: z.array(z.string()),
  duplicatedSlides: z.array(z.object({ sourceId: z.string(), copyId: z.string(), copyKey: z.string().optional() }).strict()),
  text: z.record(z.string()), props: z.record(object), preview: object }).strict()
const sourceSchema = z.object({ format: z.literal('presentation-studio.source'), schemaVersion: z.literal(2), rendererCommit: z.literal(DASHIAI_UPSTREAM_COMMIT),
  deckId: z.string().uuid(), revision: z.number().int().nonnegative(), deckSpec: spec, editorState: editor, yjsStateBase64: z.string().min(1),
  assets: z.array(z.object({ id: z.string().uuid(), slideId: z.string().nullish(), role: z.string().min(1), fileName: z.string().min(1).max(255),
    mimeType: z.string().nullish(), sha256: z.string().regex(/^[a-f0-9]{64}$/), encoding: z.literal('base64'), content: z.string() }).strict()).max(500) }).strict()
const digest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')

/** Recovery creates a new editable resource. It never reuses an old collaboration room,
 * publishes a link, or overwrites another live Deck. Unknown model/renderer versions fail closed. */
export function parsePresentationSource(buffer: Buffer) {
  try {
    if (buffer.length > MAX_SOURCE_BYTES) throw new Error('limit')
    const source = sourceSchema.parse(JSON.parse(buffer.toString('utf8')))
    if (new Set(source.assets.map(asset => asset.id)).size !== source.assets.length ||
      new Set(source.deckSpec.slides.map(slide => slide.id)).size !== source.deckSpec.slides.length) throw new Error('duplicate')
    for (const asset of source.assets) {
      const bytes = Buffer.from(asset.content, 'base64')
      if (bytes.toString('base64') !== asset.content || digest(bytes) !== asset.sha256) throw new Error('asset')
    }
    // The backup stores both the model and Yjs state. Reject disagreement instead of
    // silently choosing a stale copy when someone edited only half of a source file.
    const fromState = decodeYDoc(source.yjsStateBase64), fromModel = createPresentationYDoc(source.deckSpec, source.editorState)
    try {
      const a = materializePresentationYDoc(fromState), b = materializePresentationYDoc(fromModel)
      if (!isDeepStrictEqual(a.spec, b.spec) || !isDeepStrictEqual(a.editorState, b.editorState)) throw new Error('state')
    } finally { fromState.destroy(); fromModel.destroy() }
    return source
  } catch { throw new BadRequestException('PRESENTATION_SOURCE_INVALID') }
}

/** RFC 4122 UUIDv5 keeps asset identities deterministic for retries of the same import. */
function assetIdentity(namespace: string, name: string) {
  const hash = createHash('sha1').update(Buffer.from(namespace.replaceAll('-', ''), 'hex')).update(name).digest().subarray(0, 16)
  hash[6] = (hash[6] & 15) | 80; hash[8] = (hash[8] & 63) | 128
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
function remap(value: PresentationJsonValue, identities: Map<string, string>): PresentationJsonValue {
  if (typeof value === 'string') return value.replace(/asset:\/\/([0-9a-f-]{36})/gi, (_match, id: string) => {
    const next = identities.get(id)
    if (!next) throw new BadRequestException('PRESENTATION_SOURCE_ASSET_MISSING')
    return `asset://${next}`
  })
  if (Array.isArray(value)) return value.map(child => remap(child, identities))
  return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remap(child, identities)])) : value
}
export async function recoverPresentationSource(runtime: RuntimeCapabilityRegistry, decks: Repository<PresentationDeck>, scope: PresentationScope,
  requestId: string, buffer: Buffer, validateAsset: (name: string, mime?: string) => void, limits: { maxAssetBytes: number; maxDeckMediaBytes: number }, copy?: { sourceId: string; title: string }) {
  await assertPresentationProject(runtime, scope, 'write')
  if (!scope.projectId || !scope.tenantId || !scope.organizationId || !scope.userId) throw new ForbiddenException('PRESENTATION_PROJECT_REQUIRED')
  z.string().uuid().parse(requestId)
  const { tenantId, organizationId, projectId, userId } = scope
  const where = { tenantId, organizationId, projectId, id: requestId }, sourceHash = digest(copy ? Buffer.concat([buffer, Buffer.from(JSON.stringify(copy))]) : buffer)
  const existing = await decks.findOneBy(where)
  if (existing) {
    if (existing.recoverySourceHash !== sourceHash) throw new ConflictException('PRESENTATION_SOURCE_REQUEST_CONFLICT')
    return { deckId: requestId, revision: existing.revision }
  }
  const source = parsePresentationSource(buffer)
  const identities = new Map(source.assets.map(asset => [asset.id, assetIdentity(requestId, asset.id)]))
  const mappedSpec = spec.parse(remap(source.deckSpec, identities)), mappedEditor = editor.parse(remap(source.editorState, identities))
  if (copy) mappedSpec.title = copy.title
  const total = source.assets.reduce((sum, asset) => sum + Buffer.from(asset.content, 'base64').length, 0)
  if (total > limits.maxDeckMediaBytes) throw new BadRequestException('PRESENTATION_SOURCE_MEDIA_LIMIT')
  for (const asset of source.assets) {
    validateAsset(asset.fileName, asset.mimeType ?? undefined)
    if (Buffer.from(asset.content, 'base64').length > limits.maxAssetBytes) throw new BadRequestException('PRESENTATION_SOURCE_MEDIA_LIMIT')
  }
  const files = runtime.require(ProjectFilesRuntimeCapability), fileScope = { actor: { tenantId, organizationId, userId }, projectId }
  const folder = `.xpert/presentations/${requestId}/recovered-assets`
  await files.mkdir({ ...fileScope, path: folder })
  const assets: PresentationAsset[] = []
  for (const asset of source.assets) {
    const bytes = Buffer.from(asset.content, 'base64'), id = identities.get(asset.id)!, path = `${folder}/${id}-${asset.sha256}`
    // Staged immutable files may remain after a failed database commit. A retry reuses
    // exactly those bytes; it cannot overwrite a concurrently edited live resource.
    try { await files.write({ ...fileScope, path, buffer: bytes, expectedHash: null }) }
    catch (error) { if ((await files.read({ ...fileScope, path })).sha256 !== asset.sha256) throw error }
    assets.push(Object.assign(new PresentationAsset(), { id, tenantId, organizationId, projectId, deckId: requestId,
      slideId: asset.slideId, role: asset.role, fileName: asset.fileName, mimeType: asset.mimeType, size: bytes.length, sha256: asset.sha256, createdById: userId,
      fileReference: { fileName: asset.fileName, mimeType: asset.mimeType, size: bytes.length, sha256: asset.sha256, workspacePath: path,
        reference: { source: WORKSPACE_FILES_SOURCE, tenantId, organizationId, projectId, catalog: 'projects', filePath: path, workspacePath: path } } }))
  }
  const doc = createPresentationYDoc(mappedSpec, mappedEditor), encoded = encodeYDoc(doc), canonical = materializePresentationYDoc(doc)
  doc.destroy()
  await decks.manager.transaction(async manager => {
    const repo = manager.getRepository(PresentationDeck)
    const inserted = await repo.createQueryBuilder().insert().values({ ...where, title: mappedSpec.title, goal: mappedSpec.goal,
      themePack: mappedSpec.themePack, status: 'draft', recoverySourceHash: sourceHash, copiedFromId: copy?.sourceId, revision: 0, currentVersionNumber: 0,
      deckSpec: () => ':spec', editorState: () => ':editor', yjsStateBase64: encoded.stateBase64, yjsStateVectorBase64: encoded.stateVectorBase64,
      yjsUpdateCount: 0, checksum: digest(Buffer.from(JSON.stringify(canonical.spec))), createdById: userId, lastEditedById: userId, lastEditedAt: new Date() })
      .setParameters({ spec: JSON.stringify(canonical.spec), editor: JSON.stringify(canonical.editorState) }).orIgnore().returning('id').execute()
    const current = await repo.findOneBy(where)
    if (!current || current.recoverySourceHash !== sourceHash) throw new ConflictException('PRESENTATION_SOURCE_REQUEST_CONFLICT')
    if (inserted.raw.length && assets.length) await manager.getRepository(PresentationAsset).save(assets)
  })
  return { deckId: requestId, revision: 0 }
}
