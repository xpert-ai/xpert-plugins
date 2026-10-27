import type * as Y from 'yjs'

/** Metadata must follow the shared document even when the edit came from another
 * Assistant/conversation, where this Workbench receives no local tool event. */
export function observeDeckTitle(doc: Y.Doc, onTitle: (title: string) => void): () => void {
  const deck = doc.getMap<unknown>('deck')
  let previous: string | undefined
  const publish = () => {
    const title = deck.get('title')
    if (typeof title !== 'string' || !title.trim() || title === previous) return
    previous = title
    onTitle(title)
  }
  const observe = (event: Y.YMapEvent<unknown>) => { if (event.keysChanged.has('title')) publish() }
  deck.observe(observe)
  publish()
  return () => deck.unobserve(observe)
}
