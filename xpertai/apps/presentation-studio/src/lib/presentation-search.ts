import { createPresentationYDoc, decodeYDoc, materializePresentationYDoc } from './presentation-yjs.js'
import type { ContentSearchProjection } from '@xpert-ai/contracts'
import type { PresentationDeck } from './entities/index.js'
import { presentationRevision } from './presentation-lifecycle.js'
import type { PresentationJsonValue } from './types.js'
/** Follow only text paths declared by the native layout contract. Never infer
 * searchable text from a property name or stringify arbitrary layout configuration. */
function declaredText(value: PresentationJsonValue, path: string): string[] {
  if (!path) return typeof value === 'string' ? [value] : []
  const [head, ...tail] = path.split('.')
  if (!value || Array.isArray(value) || typeof value !== 'object') return []
  const child = value[head.replace(/\[\]$/, '')]
  if (head.endsWith('[]')) return Array.isArray(child) ? child.flatMap(item => declaredText(item, tail.join('.'))) : []
  return child === undefined ? [] : declaredText(child, tail.join('.'))
}
/** Uses stable slide identities, and the native layout/copy key for text overrides.
 * Internal layout flags and media references are not searchable text. */
export function presentationSearchProjection(deck: PresentationDeck, textFields: Record<string, string[]> = {}): ContentSearchProjection {
  if (!deck.deckSpec) return { revision: presentationRevision(deck), sections: [] }
  const doc = deck.yjsStateBase64 ? decodeYDoc(deck.yjsStateBase64) : createPresentationYDoc(deck.deckSpec)
  const { spec, editorState: state } = materializePresentationYDoc(doc)
  doc.destroy()
  const sections = (spec?.slides ?? []).filter(slide => slide.status === 'active' && !state?.deletedSlides.includes(slide.id) && !state?.skippedSlides.includes(slide.id)).map(slide => {
    const copy = state?.duplicatedSlides.find(item => item.copyId === slide.id)
    const textKey = copy?.copyKey ?? slide.layout
    const overrides = Object.entries(state?.text ?? {}).filter(([key]) => key.startsWith(`text:${textKey}:`)).map(([, value]) => value)
    return { anchor: { kind: 'slide', id: slide.id }, text: [...(textFields[slide.layout] ?? []).flatMap(path => declaredText(slide.props, path)), ...overrides].join('\n').slice(0, 100000) }
  }).filter(section => section.text)
  return { revision: presentationRevision(deck), sections: [{ anchor: { kind: 'document', id: deck.id! }, text: [deck.title, deck.goal].filter(Boolean).join('\n') }, ...sections] }
}
