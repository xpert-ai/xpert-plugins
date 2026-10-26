import * as Y from 'yjs'
import { base64ToBytes } from '@xpert-ai/plugin-sdk/collaboration-client'

/** State vectors alone do not prove that deletions were persisted. Compare canonical full
 * state with its union, including the Yjs delete set; a partial sync can only fail closed. */
export function serverContainsDocument(local: Y.Doc, updateBase64: string): boolean {
  const server = new Y.Doc()
  try {
    Y.applyUpdate(server, base64ToBytes(updateBase64))
    const before = Y.encodeStateAsUpdate(server)
    Y.applyUpdate(server, Y.encodeStateAsUpdate(local))
    const after = Y.encodeStateAsUpdate(server)
    return before.length === after.length && before.every((byte, index) => byte === after[index])
  } catch { return false } finally { server.destroy() }
}
