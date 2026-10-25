import { createHash } from 'node:crypto'
import type { ContentActor } from '@xpert-ai/plugin-sdk'

/** Models supply readable retry keys; persistence uses a namespaced UUID v5. */
export function proposalMutationId(actor: ContentActor, resourceId: string, key: string) {
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex')
  const hash = createHash('sha1').update(namespace)
    .update(JSON.stringify(['xpert/content/proposal', actor.tenantId, actor.organizationId, actor.userId, resourceId, key])).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
