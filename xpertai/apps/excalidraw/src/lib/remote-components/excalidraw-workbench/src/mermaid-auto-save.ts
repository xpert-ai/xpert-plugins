export interface MermaidAutoSaveGuard {
  savedKeys: Set<string>
  pendingKeys: Set<string>
}

export function createMermaidAutoSaveGuard(): MermaidAutoSaveGuard {
  return {
    savedKeys: new Set<string>(),
    pendingKeys: new Set<string>()
  }
}

export function createMermaidAutoSaveKey(versionId: unknown, source: string) {
  const normalizedSource = normalizeMermaidSource(source)
  if (!normalizedSource) {
    return ''
  }
  const sourceKey = typeof versionId === 'string' && versionId.trim() ? versionId.trim() : hashMermaidSource(normalizedSource)
  return `${sourceKey}:${hashMermaidSource(normalizedSource)}`
}

export function beginMermaidAutoSave(guard: MermaidAutoSaveGuard, key: string) {
  if (!key || guard.savedKeys.has(key) || guard.pendingKeys.has(key)) {
    return false
  }
  guard.pendingKeys.add(key)
  return true
}

export function finishMermaidAutoSave(guard: MermaidAutoSaveGuard, key: string, succeeded: boolean) {
  if (!key) {
    return
  }
  guard.pendingKeys.delete(key)
  if (succeeded) {
    guard.savedKeys.add(key)
  }
}

export function normalizeMermaidSource(source: string) {
  return source.trim().replace(/\r\n/g, '\n')
}

export function hashMermaidSource(source: string) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
