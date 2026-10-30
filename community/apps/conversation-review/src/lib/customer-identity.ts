/**
 * Resolves which customer a filed conversation belongs to.
 *
 * A name alone cannot carry this: two different customers can share a name by coincidence, and
 * the same customer's name can get typed two different ways across imports. Neither is something
 * text matching can tell apart. When the source system hands over its own customer id (a CRM
 * number, a WeCom external contact id, a "客户编号" column), that id is the actual signal and takes
 * priority — two rows with the same name but different source ids resolve to two different
 * customers here. Rows with no source id (manual entry, or an export that never carried one) fall
 * back to matching by name, which is what the workbench did before this existed.
 *
 * The result is a deterministic hash, not a random id: the same scope and the same seed (source id,
 * or name) always resolve to the same uuid, so re-importing an unchanged export or filing a second
 * conversation by hand for a known customer lands on the same identity instead of minting a new one
 * every time.
 */
import { createHash } from 'node:crypto'
import type { ConversationReviewScope } from './types'

/** Arbitrary but fixed namespace, so hashing is stable across process restarts and deployments. */
const NAMESPACE = '6f2b1c4d-3a7e-4b8f-9c2d-8e6f1a2b3c4d'

/** Case- and whitespace-insensitive customer name key. Nothing fuzzier — see the entity comment. */
export function historyKey(customerName: string | undefined | null) {
  return (customerName ?? '').trim().toLowerCase()
}

export function resolveCustomerId(
  scope: ConversationReviewScope,
  customerName: string | undefined,
  customerExternalId?: string | null
) {
  const externalKey = (customerExternalId ?? '').trim().toLowerCase()
  const seed = externalKey ? `id:${externalKey}` : `name:${historyKey(customerName)}`
  return hashToUuid(`${scopeKey(scope)}|${seed}`)
}

function scopeKey(scope: ConversationReviewScope) {
  return `${scope.tenantId ?? ''}:${scope.organizationId ?? ''}:${scope.userId ?? ''}`
}

/** RFC4122-shaped (version 5, variant bits set) but hand-rolled to avoid a new dependency. */
function hashToUuid(input: string): string {
  const hash = createHash('sha1').update(`${NAMESPACE}:${input}`).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
