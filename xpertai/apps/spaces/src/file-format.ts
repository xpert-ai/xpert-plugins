import type { FileContentEditorRegistration } from '@xpert-ai/contracts'

/** Discover codecs without migrating the file or changing its owning resource. */
export function fileFormat(item: { kind: string; filePath?: string | null; editorKey?: string | null },
  formats: FileContentEditorRegistration[]) {
  if (!['file', 'artifact'].includes(item.kind) || !item.filePath) return undefined
  if (item.editorKey) return formats.find(format => format.key === item.editorKey)
  const matches = formats.filter(format => item.filePath!.toLowerCase().endsWith(`.${format.extension.replace(/^\./, '').toLowerCase()}`))
  // An ambiguous extension needs an explicit choice; never silently change a stored editor.
  return matches.length === 1 ? matches[0] : undefined
}
