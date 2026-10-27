import { createHash } from 'node:crypto'
import type { Repository } from 'typeorm'
import { ProjectFilesRuntimeCapability, WorkspaceFilesRuntimeCapability, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PresentationAsset, PresentationDeck } from './entities/index.js'
import type { PresentationScope } from './types.js'
import { DASHIAI_UPSTREAM_COMMIT } from './constants.js'

export const presentationSourceRoot = (id: string) => `.xpert/presentations/${id}`
/** Immutable, self-contained snapshots. No source file is overwritten on retry or conflict.
 * Yjs remains authoritative; callers can propagate a recorded failure to the
 * platform materialization worker without rolling back the accepted CRDT update. */
export async function persistPresentationSource(runtime: RuntimeCapabilityRegistry | undefined,
  decks: Repository<PresentationDeck>, assets: Repository<PresentationAsset>, scope: PresentationScope, deckId: string): Promise<'synced' | 'skipped' | 'failed'> {
  if (!scope.projectId || !runtime || !scope.tenantId || !scope.organizationId || !scope.userId) return 'skipped'
  const { projectId, tenantId, organizationId, userId } = scope
  const where = { id: deckId, projectId, tenantId, organizationId }
  // Serialize the snapshot pointer with Deck materialization and asset registration.
  // Deck revision alone cannot order two uploads made without a text edit.
  return decks.manager.transaction(async manager => {
    const lockedDecks = manager.getRepository(PresentationDeck)
    const lockedAssets = manager.getRepository(PresentationAsset)
    const deck = await lockedDecks.findOne({ where, lock: { mode: 'pessimistic_write' } })
    if (!deck) return 'skipped'
    try {
      const records = await lockedAssets.find({ where: { deckId, projectId, tenantId, organizationId }, order: { id: 'ASC' } })
      const media = await Promise.all(records.map(async asset => {
        const file = await runtime.require(WorkspaceFilesRuntimeCapability).readBuffer(asset.fileReference.reference)
        if (createHash('sha256').update(file.buffer).digest('hex') !== asset.sha256) throw new Error('PRESENTATION_SOURCE_ASSET_CHANGED')
        return { id: asset.id, slideId: asset.slideId, role: asset.role, fileName: asset.fileName, mimeType: asset.mimeType,
          sha256: asset.sha256, encoding: 'base64' as const, content: file.buffer.toString('base64') }
      }))
      const buffer = Buffer.from(JSON.stringify({ format: 'presentation-studio.source', schemaVersion: 2, rendererCommit: DASHIAI_UPSTREAM_COMMIT,
        deckId, revision: deck.revision, deckSpec: deck.deckSpec, editorState: deck.editorState, yjsStateBase64: deck.yjsStateBase64, assets: media }))
      const files = runtime.require(ProjectFilesRuntimeCapability), scoped = { actor: { tenantId, organizationId, userId }, projectId }
      const hash = createHash('sha256').update(buffer).digest('hex')
      const folder = `${presentationSourceRoot(deckId)}/snapshots`, path = `${folder}/${deck.revision}-${hash}.json`
      if (deck.sourceSnapshotPath === path && !deck.sourceSyncFailed) return 'synced'
      await files.mkdir({ ...scoped, path: folder })
      try { await files.write({ ...scoped, path, buffer, expectedHash: null }) }
      catch (error) { const current = await files.read({ ...scoped, path }); if (current.sha256 !== hash) throw error }
      // An older materialization cannot mark a newer Deck as synchronized.
      await lockedDecks.update({ ...where, revision: deck.revision }, { sourceRevision: deck.revision, sourceSnapshotPath: path, sourceSyncFailed: false })
      return 'synced'
    } catch {
      await lockedDecks.update({ ...where, revision: deck.revision }, { sourceSyncFailed: true })
      return 'failed'
    }
  })
}
