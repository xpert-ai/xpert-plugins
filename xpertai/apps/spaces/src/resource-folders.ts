import { ConflictException } from '@nestjs/common'
import type { EntityManager } from 'typeorm'
import { SpaceItem, SpaceResourcePlacement } from './entities.js'
import { scoped, type SpaceActor } from './domain.js'

/** Folder deletion must not silently bypass a resource provider's lifecycle policy.
 * Call under the Space lock when committing a change; the early validation gives
 * the same error before the Markdown move coordinator retires editor rooms. */
export async function assertFolderHasNoResources(manager: EntityManager, actor: SpaceActor, item: SpaceItem) {
  if (item.kind !== 'folder') return
  const folders = await manager.getRepository(SpaceItem).findBy({ ...scoped(actor), spaceId: item.spaceId, kind: 'folder' })
  const inside = new Set([item.id])
  for (let i = 0; i <= folders.length; i++) for (const folder of folders) {
    if (folder.parentId && inside.has(folder.parentId)) inside.add(folder.id)
  }
  const placements = await manager.getRepository(SpaceResourcePlacement).findBy({ ...scoped(actor), spaceId: item.spaceId })
  if (placements.some(placement => placement.parentId && inside.has(placement.parentId))) {
    throw new ConflictException('spaces.folder_contains_resources')
  }
}
