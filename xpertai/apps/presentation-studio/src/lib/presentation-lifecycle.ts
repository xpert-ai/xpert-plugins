import { ConflictException, NotFoundException } from '@nestjs/common'
import type { CollaborationApi } from '@xpert-ai/plugin-sdk'
import type { FindOptionsWhere, Repository } from 'typeorm'
import { PresentationDeck } from './entities/index.js'
import { PRESENTATION_COLLABORATION_PROVIDER_KEY } from './constants.js'

export const presentationRevision = (deck: PresentationDeck) => `${deck.revision}:${deck.lifecycleRevision ?? 0}`
export const isPresentationActive = (deck: PresentationDeck) => !deck.lifecycleState || deck.lifecycleState === 'active'

/** Durable transition states fail closed after a process interruption. Retrying the same action
 * finishes the transition. Restore retains the Yjs identity and content but advances
 * the collaboration sequence, so writes captured before archival cannot pass CAS.
 * Source/exports are retained. Revocation failures must not report successful recycling. */
export async function transitionPresentationLifecycle(input: {
  decks: Repository<PresentationDeck>; where: FindOptionsWhere<PresentationDeck>; collaboration: CollaborationApi;
  deleted: boolean; expectedRevision: string; revokeLinks: () => Promise<void>
}) {
  const { decks, where, collaboration, deleted } = input
  const pending = deleted ? 'archiving' : 'restoring'
  const destination = deleted ? 'archived' : 'active'
  let deck = await decks.findOneBy(where)
  if (!deck) throw new NotFoundException('PRESENTATION_NOT_FOUND')
  const resource = { providerKey: PRESENTATION_COLLABORATION_PROVIDER_KEY, resourceId: deck.id! }
  // Initialize before closing ordinary read/write access. Recovery uses provider/resource directly.
  if (isPresentationActive(deck)) await collaboration.ensureDocument({ ...resource, schemaVersion: 2 })
  deck = await decks.manager.transaction(async manager => {
    const repo = manager.getRepository(PresentationDeck)
    const current = await repo.findOneOrFail({ where, lock: { mode: 'pessimistic_write' } })
    if (presentationRevision(current) !== input.expectedRevision) throw new ConflictException('PRESENTATION_REVISION_CONFLICT')
    if ((current.lifecycleState ?? 'active') === destination) return current
    if (current.lifecycleState !== pending) {
      // Finish an interrupted archive before allowing restoration (and conversely).
      if (current.lifecycleState === 'archiving' || current.lifecycleState === 'restoring') throw new ConflictException('PRESENTATION_LIFECYCLE_PENDING')
      current.lifecycleState = pending
      current.lifecycleRevision = (current.lifecycleRevision ?? 0) + 1
      await repo.save(current)
    }
    return current
  })
  if ((deck.lifecycleState ?? 'active') === destination) return
  if (deleted) {
    // The native transition already fences new writes and shares. Archiving serializes
    // with any update accepted just before that fence, without rolling its state back.
    await collaboration.archiveDocument({ ...resource, expectedSequence: deck.revision })
    await input.revokeLinks()
  } else await collaboration.restoreDocument(resource)
  await decks.update({ ...where, lifecycleState: pending, lifecycleRevision: deck.lifecycleRevision }, { lifecycleState: destination })
}
