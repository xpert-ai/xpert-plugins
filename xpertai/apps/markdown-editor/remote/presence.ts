import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import type { CollaborationClient, CollaborationPresenceStoreSnapshot } from '@xpert-ai/plugin-sdk/collaboration-client'
import { base64ToBytes, bytesToBase64 } from '@xpert-ai/plugin-sdk/collaboration-client'

/** Only positions travel from the editor. User labels/colors come from authenticated platform presence. */
export function platformAwareness(awareness: Awareness, client: CollaborationClient) {
  const ids = new Map<string, number>()
  let next = 1
  const change = (_changes: unknown, origin: unknown) => {
    if (origin === 'platform') return
    const cursor = awareness.getLocalState()?.cursor
    client.setPresence({ selection: cursor ? { kind: 'text', fieldKey: 'body',
      anchorRelativeBase64: bytesToBase64(Y.encodeRelativePosition(cursor.anchor)),
      headRelativeBase64: bytesToBase64(Y.encodeRelativePosition(cursor.head)) } : null })
  }
  awareness.on('change', change)
  return {
    sync(snapshot: CollaborationPresenceStoreSnapshot) {
      const states = awareness.getStates(), added: number[] = [], updated: number[] = [], removed: number[] = []
      const active = new Set<string>()
      for (const entry of snapshot.remoteSessions) {
        active.add(entry.clientId)
        let id = ids.get(entry.clientId)
        if (!id) { while (next === awareness.clientID) next++; id = next++; ids.set(entry.clientId, id) }
        const cursor = entry.selection
        try {
          const value = { user: { name: entry.displayName, color: entry.color }, cursor:
            cursor?.kind === 'text' && cursor.anchorRelativeBase64 && cursor.headRelativeBase64 ? {
              anchor: Y.decodeRelativePosition(base64ToBytes(cursor.anchorRelativeBase64)),
              head: Y.decodeRelativePosition(base64ToBytes(cursor.headRelativeBase64)) } : null }
          ;(states.has(id) ? updated : added).push(id)
          states.set(id, value)
        } catch { /* An expired/invalid position must not break the editor. */ }
      }
      for (const [key, id] of ids) if (!active.has(key)) { states.delete(id); ids.delete(key); removed.push(id) }
      awareness.emit('change', [{ added, updated, removed }, 'platform'])
    },
    destroy() { awareness.off('change', change); for (const id of ids.values()) awareness.getStates().delete(id) }
  }
}
