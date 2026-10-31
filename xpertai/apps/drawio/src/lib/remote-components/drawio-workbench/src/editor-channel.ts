export const DRAWIO_ORIGIN = 'https://embed.diagrams.net'

/** Nested editors inherit the Remote View's opaque sandbox origin. Replies still target only its bound window. */
export function editorReplyOrigin(event: { source: object | null; origin: string }, editorWindow: object | null | undefined): string | null {
  if (!editorWindow || event.source !== editorWindow) return null
  if (event.origin === DRAWIO_ORIGIN) return DRAWIO_ORIGIN
  return event.origin === 'null' ? '*' : null
}

/** draw.io uses export/xml for host-initiated reads and save events for its own Save button. */
export function editorSceneXml(message: unknown): string | null {
  if (!message || typeof message !== 'object' || !('event' in message)) return null
  if (message.event !== 'save' && !(message.event === 'export' && 'format' in message && message.format === 'xml')) return null
  return 'xml' in message && typeof message.xml === 'string' && message.xml.trim() ? message.xml : null
}
