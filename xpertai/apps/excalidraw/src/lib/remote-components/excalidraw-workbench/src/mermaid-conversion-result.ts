export function isSingleImageMermaidResult(elements: unknown[], files: Record<string, unknown>) {
  if (!Array.isArray(elements) || elements.length !== 1) {
    return false
  }
  const element = elements[0]
  if (!isRecord(element) || element.type !== 'image' || typeof element.fileId !== 'string') {
    return false
  }
  return isRecord(files[element.fileId])
}

export function countSceneFiles(files: Record<string, unknown>) {
  return Object.keys(files).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
