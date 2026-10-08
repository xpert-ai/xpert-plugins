import * as Y from 'yjs'

export const EXCALIDRAW_YJS_SCHEMA_VERSION = 1

export type ExcalidrawCollaborativeScene = {
  elements: Record<string, unknown>[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
  mermaidSource: string | null
}

export function createExcalidrawYDoc(scene: ExcalidrawCollaborativeScene) {
  const doc = new Y.Doc()
  writeExcalidrawSceneToYDoc(doc, scene, 'excalidraw:initialize')
  return doc
}

export function writeExcalidrawSceneToYDoc(
  doc: Y.Doc,
  scene: ExcalidrawCollaborativeScene,
  origin: unknown = 'excalidraw:replace-scene'
) {
  doc.transact(() => {
    const meta = doc.getMap<string | number>('scene')
    if (meta.get('schemaVersion') !== EXCALIDRAW_YJS_SCHEMA_VERSION) {
      meta.set('schemaVersion', EXCALIDRAW_YJS_SCHEMA_VERSION)
    }
    setJsonString(meta, 'appState', scene.appState)
    setText(meta, 'mermaidSource', scene.mermaidSource)

    const elements = doc.getMap<string>('elements')
    const order = doc.getArray<string>('elementOrder')
    const nextOrder: string[] = []
    const nextIds = new Set<string>()
    for (const element of scene.elements) {
      const id = readId(element)
      if (!id || nextIds.has(id)) continue
      nextIds.add(id)
      nextOrder.push(id)
      const serialized = stableStringify(element)
      if (elements.get(id) !== serialized) elements.set(id, serialized)
    }
    for (const id of [...elements.keys()]) if (!nextIds.has(id)) elements.delete(id)
    replaceArrayWhenChanged(order, nextOrder)

    const files = doc.getMap<string>('files')
    const nextFileIds = new Set(Object.keys(scene.files).sort())
    for (const id of nextFileIds) {
      const serialized = stableStringify(scene.files[id])
      if (files.get(id) !== serialized) files.set(id, serialized)
    }
    for (const id of [...files.keys()]) if (!nextFileIds.has(id)) files.delete(id)
  }, origin)
}

export function materializeExcalidrawYDoc(doc: Y.Doc): ExcalidrawCollaborativeScene {
  const elementMap = doc.getMap<string>('elements')
  const orderedIds = doc.getArray<string>('elementOrder').toArray()
  const visited = new Set<string>()
  const elements: Record<string, unknown>[] = []
  for (const id of orderedIds) {
    const value = parseJsonObject(elementMap.get(id))
    if (!value || visited.has(id)) continue
    visited.add(id)
    elements.push(value)
  }
  for (const id of [...elementMap.keys()].sort()) {
    if (visited.has(id)) continue
    const value = parseJsonObject(elementMap.get(id))
    if (value) elements.push(value)
  }

  const files: Record<string, unknown> = {}
  for (const [id, value] of [...doc.getMap<string>('files').entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const parsed = parseJson(value)
    if (parsed !== undefined) files[id] = parsed
  }
  const meta = doc.getMap<string | number>('scene')
  return {
    elements,
    appState: parseJsonObject(readString(meta.get('appState'))) ?? {},
    files,
    mermaidSource: nullableString(meta.get('mermaidSource'))
  }
}

/** Apply only changes since the last canvas observation, preserving unseen remote edits. */
export function patchExcalidrawCanvasToYDoc(
  doc: Y.Doc,
  previous: ExcalidrawCollaborativeScene,
  next: ExcalidrawCollaborativeScene,
  origin: unknown
) {
  const current = materializeExcalidrawYDoc(doc)
  const before = new Map(previous.elements.map((element) => [readId(element), element]))
  const after = new Map(next.elements.map((element) => [readId(element), element]))
  const merged = new Map(current.elements.map((element) => [readId(element), element]))
  for (const [id, element] of after) {
    if (id && stableStringify(element) !== stableStringify(before.get(id))) merged.set(id, element)
  }
  for (const [id, element] of before) {
    if (!after.has(id) && stableStringify(merged.get(id)) === stableStringify(element)) merged.delete(id)
  }
  const reordered = stableStringify([...before.keys()]) !== stableStringify([...after.keys()])
  const order = reordered ? [...after.keys(), ...merged.keys()] : [...merged.keys()]
  const ids = [...new Set(order)].filter((id) => id && merged.has(id))
  const patchRecord = (base: Record<string, unknown>, local: Record<string, unknown>, remote: Record<string, unknown>) => {
    const result = { ...remote }
    for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
      if (stableStringify(base[key]) === stableStringify(local[key])) continue
      if (Object.hasOwn(local, key)) result[key] = local[key]
      else if (stableStringify(remote[key]) === stableStringify(base[key])) delete result[key]
    }
    return result
  }
  writeExcalidrawSceneToYDoc(doc, {
    elements: ids.map((id) => merged.get(id)!),
    appState: patchRecord(previous.appState, next.appState, current.appState),
    files: patchRecord(previous.files, next.files, current.files),
    mermaidSource: previous.mermaidSource === next.mermaidSource ? current.mermaidSource : next.mermaidSource
  }, origin)
}

function setJsonString(map: Y.Map<string | number>, key: string, value: unknown) {
  const serialized = stableStringify(value)
  if (map.get(key) !== serialized) map.set(key, serialized)
}

function setText(map: Y.Map<string | number>, key: string, value: string | null | undefined) {
  const normalized = value?.trim() || ''
  if (map.get(key) !== normalized) map.set(key, normalized)
}

function replaceArrayWhenChanged(target: Y.Array<string>, next: string[]) {
  const current = target.toArray()
  if (current.length === next.length && current.every((value, index) => value === next[index])) return
  target.delete(0, target.length)
  if (next.length) target.insert(0, next)
}

function readId(value: Record<string, unknown>) {
  return typeof value.id === 'string' && value.id.trim() ? value.id.trim() : null
}

function readString(value: string | number | undefined) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: string | number | undefined) {
  const text = readString(value).trim()
  return text || null
}

function parseJsonObject(value?: string): Record<string, unknown> | null {
  const parsed = parseJson(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
}

function parseJson(value?: string): unknown | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
