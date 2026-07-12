import * as Y from 'yjs'
import type { PencilDocumentKind, PencilDocumentStatus, PencilGraphSnapshot, PencilJsonObject, PencilJsonValue } from './types.js'

export const PENCIL_COLLABORATION_PROVIDER_KEY = 'pencil.document'
export const PENCIL_COLLABORATION_SCHEMA_VERSION = 1
export const PENCIL_COLLABORATION_MAX_STATE_BYTES = 32 * 1024 * 1024
export const PENCIL_IMAGE_CHUNK_BYTES = 512 * 1024

export type PencilCollaborativeDocument = {
  title: string
  description?: string | null
  kind: PencilDocumentKind
  status: PencilDocumentStatus
  tags: string[]
}

const DOCUMENT_MAP = 'document'
const META_MAP = 'meta'
const NODES_MAP = 'nodes'
const TEXTS_MAP = 'texts'
const CHILDREN_MAP = 'children'
const IMAGES_META_MAP = 'imageMeta'
const IMAGE_CHUNKS_MAP = 'imageChunks'
const VARIABLES_MAP = 'variables'
const VARIABLE_COLLECTIONS_MAP = 'variableCollections'
const ACTIVE_MODE_MAP = 'activeMode'
const INSTANCE_INDEX_MAP = 'instanceIndex'
const TEXT_STYLE_ATTRIBUTE = 'pencilStyle'

type YNodeMap = Y.Map<PencilJsonValue | Uint8Array>

/** Create a schema-v1 Y.Doc from the plugin's legacy JSON-safe working snapshot. */
export function createPencilCollaborationDoc(
  graphSnapshot: PencilGraphSnapshot,
  document: PencilCollaborativeDocument
) {
  const doc = new Y.Doc()
  replacePencilCollaborationState(doc, graphSnapshot, document, 'pencil:system:initialize')
  return doc
}

/** Replace the collaborative business state in one deterministic transaction. */
export function replacePencilCollaborationState(
  doc: Y.Doc,
  graphSnapshot: PencilGraphSnapshot,
  document: PencilCollaborativeDocument,
  origin: unknown
) {
  doc.transact(() => {
    syncDocumentMap(doc.getMap<PencilJsonValue>(DOCUMENT_MAP), document)
    syncMetaMap(doc.getMap<PencilJsonValue | Uint8Array>(META_MAP), graphSnapshot)
    syncNodeMaps(doc, graphSnapshot)
    syncEntryMap(doc.getMap<PencilJsonObject>(VARIABLES_MAP), graphSnapshot.variables)
    syncEntryMap(doc.getMap<PencilJsonObject>(VARIABLE_COLLECTIONS_MAP), graphSnapshot.variableCollections)
    syncStringMap(doc.getMap<string>(ACTIVE_MODE_MAP), graphSnapshot.activeMode)
    syncStringArrayMap(doc.getMap<Y.Array<string>>(INSTANCE_INDEX_MAP), graphSnapshot.instanceIndex)
    syncImages(doc, graphSnapshot.images)
  }, origin)
  assertPencilCollaborationStateSize(doc)
}

/** Decode platform state and project it into the existing Pencil business model. */
export function materializePencilCollaborationDoc(doc: Y.Doc): {
  document: PencilCollaborativeDocument
  graphSnapshot: PencilGraphSnapshot
} {
  const documentMap = doc.getMap<PencilJsonValue>(DOCUMENT_MAP)
  const meta = doc.getMap<PencilJsonValue | Uint8Array>(META_MAP)
  const nodes = doc.getMap<YNodeMap>(NODES_MAP)
  const texts = doc.getMap<Y.Text>(TEXTS_MAP)
  const children = doc.getMap<Y.Array<string>>(CHILDREN_MAP)

  const nodeEntries = Array.from(nodes.entries()).map(([nodeId, nodeMap]) => {
    const node = Object.fromEntries(nodeMap.entries()) as PencilJsonObject
    node.id = nodeId
    node.text = texts.get(nodeId)?.toString() ?? stringValue(node.text)
    node.styleRuns = styleRunsFromYText(texts.get(nodeId))
    node.childIds = []
    return [nodeId, node] as [string, PencilJsonObject]
  })
  const knownNodes = new Map(nodeEntries)
  const orderByParent = new Map<string, string[]>()

  // parentId is the winning membership field; child arrays only decide order.
  for (const [parentId, order] of children.entries()) {
    const seen = new Set<string>()
    const valid = order.toArray().filter((childId) => {
      if (seen.has(childId)) return false
      const child = knownNodes.get(childId)
      if (!child || stringValue(child.parentId) !== parentId) return false
      seen.add(childId)
      return true
    })
    orderByParent.set(parentId, valid)
  }
  for (const [nodeId, node] of nodeEntries) {
    const parentId = stringValue(node.parentId)
    if (!parentId || !knownNodes.has(parentId)) continue
    const order = orderByParent.get(parentId) ?? []
    if (!order.includes(nodeId)) order.push(nodeId)
    orderByParent.set(parentId, order)
  }
  for (const [parentId, order] of orderByParent) {
    const parent = knownNodes.get(parentId)
    if (parent) parent.childIds = order
  }

  const graphSnapshot: PencilGraphSnapshot = {
    formatVersion: 'pencil.scene-graph.v1',
    pencilVersion: stringValue(meta.get('pencilVersion')) || '0.13.2',
    rootId: stringValue(meta.get('rootId')) || 'root',
    nodes: nodeEntries,
    images: materializeImages(doc),
    variables: materializeEntryMap(doc.getMap<PencilJsonObject>(VARIABLES_MAP)),
    variableCollections: materializeEntryMap(doc.getMap<PencilJsonObject>(VARIABLE_COLLECTIONS_MAP)),
    activeMode: Array.from(doc.getMap<string>(ACTIVE_MODE_MAP).entries()),
    instanceIndex: Array.from(doc.getMap<Y.Array<string>>(INSTANCE_INDEX_MAP).entries()).map(([id, value]) => [id, value.toArray()]),
    figKiwiVersion: numberOrNull(meta.get('figKiwiVersion')),
    figSchemaDeflatedBase64: bytesValue(meta.get('figSchemaDeflated'))
      ? bytesToBase64(bytesValue(meta.get('figSchemaDeflated')) as Uint8Array)
      : null,
    documentColorSpace: stringValue(meta.get('documentColorSpace')) || 'srgb'
  }

  return {
    document: {
      title: stringValue(documentMap.get('title')) || 'Untitled Pencil',
      description: nullableString(documentMap.get('description')),
      kind: pencilKind(documentMap.get('kind')),
      status: pencilStatus(documentMap.get('status')),
      tags: stringArray(documentMap.get('tags'))
    },
    graphSnapshot
  }
}

/** Encode a complete Yjs state for the platform capability boundary. */
export function encodePencilCollaborationState(doc: Y.Doc) {
  const state = Y.encodeStateAsUpdate(doc)
  if (state.byteLength > PENCIL_COLLABORATION_MAX_STATE_BYTES) {
    throw new Error(`Pencil collaborative document exceeds the ${PENCIL_COLLABORATION_MAX_STATE_BYTES / 1024 / 1024} MB platform limit.`)
  }
  return bytesToBase64(state)
}

/** Decode the base64 DTO returned by platform.collaboration. */
export function decodePencilCollaborationState(stateBase64: string) {
  const doc = new Y.Doc()
  if (stateBase64) Y.applyUpdate(doc, base64ToBytes(stateBase64), 'pencil:system:decode')
  return doc
}

/** Apply a minimal prefix/suffix text delta and reconcile character attributes. */
export function syncPencilText(yText: Y.Text, text: string, styleRuns: PencilJsonValue | undefined) {
  const previous = yText.toString()
  let prefix = 0
  while (prefix < previous.length && prefix < text.length && previous[prefix] === text[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < text.length - prefix &&
    previous[previous.length - 1 - suffix] === text[text.length - 1 - suffix]
  ) suffix += 1
  const removed = previous.length - prefix - suffix
  const inserted = text.slice(prefix, text.length - suffix)
  if (removed) yText.delete(prefix, removed)
  if (inserted) yText.insert(prefix, inserted)
  if (yText.length) yText.format(0, yText.length, { [TEXT_STYLE_ATTRIBUTE]: null })
  for (const run of normalizeStyleRuns(styleRuns, text.length)) {
    yText.format(run.start, run.length, { [TEXT_STYLE_ATTRIBUTE]: stableStringify(run.style) })
  }
}

export function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

export function base64ToBytes(value: string) {
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'))
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function syncDocumentMap(map: Y.Map<PencilJsonValue>, document: PencilCollaborativeDocument) {
  syncMapValues(map, {
    title: document.title,
    description: document.description ?? null,
    kind: document.kind,
    status: document.status,
    tags: [...document.tags]
  })
}

function syncMetaMap(map: Y.Map<PencilJsonValue | Uint8Array>, snapshot: PencilGraphSnapshot) {
  syncMapValues(map, {
    formatVersion: snapshot.formatVersion,
    pencilVersion: snapshot.pencilVersion,
    rootId: snapshot.rootId,
    figKiwiVersion: snapshot.figKiwiVersion ?? null,
    figSchemaDeflated: snapshot.figSchemaDeflatedBase64 ? base64ToBytes(snapshot.figSchemaDeflatedBase64) : null,
    documentColorSpace: snapshot.documentColorSpace ?? 'srgb'
  })
}

function syncNodeMaps(doc: Y.Doc, snapshot: PencilGraphSnapshot) {
  const nodes = doc.getMap<YNodeMap>(NODES_MAP)
  const texts = doc.getMap<Y.Text>(TEXTS_MAP)
  const children = doc.getMap<Y.Array<string>>(CHILDREN_MAP)
  const wanted = new Set(snapshot.nodes.map(([id]) => id))
  for (const id of Array.from(nodes.keys())) if (!wanted.has(id)) nodes.delete(id)
  for (const id of Array.from(texts.keys())) if (!wanted.has(id)) texts.delete(id)
  for (const id of Array.from(children.keys())) if (!wanted.has(id)) children.delete(id)

  for (const [nodeId, rawNode] of snapshot.nodes) {
    let nodeMap = nodes.get(nodeId)
    if (!nodeMap) {
      nodeMap = new Y.Map<PencilJsonValue | Uint8Array>()
      nodes.set(nodeId, nodeMap)
    }
    const nextNode: Record<string, PencilJsonValue> = {}
    for (const [key, value] of Object.entries(rawNode)) {
      if (key !== 'id' && key !== 'text' && key !== 'styleRuns' && key !== 'childIds' && value !== undefined) nextNode[key] = value
    }
    syncMapValues(nodeMap, nextNode)
    let text = texts.get(nodeId)
    if (!text) {
      text = new Y.Text()
      texts.set(nodeId, text)
    }
    syncPencilText(text, stringValue(rawNode.text), rawNode.styleRuns)
    syncYArray(children, nodeId, stringArray(rawNode.childIds))
  }
}

function syncEntryMap(map: Y.Map<PencilJsonObject>, entries: Array<[string, PencilJsonObject]>) {
  const wanted = new Set(entries.map(([id]) => id))
  for (const id of Array.from(map.keys())) if (!wanted.has(id)) map.delete(id)
  for (const [id, value] of entries) if (!jsonEqual(map.get(id), value)) map.set(id, value)
}

function syncStringMap(map: Y.Map<string>, entries: Array<[string, string]>) {
  const wanted = new Set(entries.map(([id]) => id))
  for (const id of Array.from(map.keys())) if (!wanted.has(id)) map.delete(id)
  for (const [id, value] of entries) if (map.get(id) !== value) map.set(id, value)
}

function syncStringArrayMap(map: Y.Map<Y.Array<string>>, entries: Array<[string, string[]]>) {
  const wanted = new Set(entries.map(([id]) => id))
  for (const id of Array.from(map.keys())) if (!wanted.has(id)) map.delete(id)
  for (const [id, values] of entries) syncYArray(map, id, values)
}

function syncYArray(map: Y.Map<Y.Array<string>>, key: string, values: string[]) {
  let array = map.get(key)
  if (!array) {
    array = new Y.Array<string>()
    map.set(key, array)
  }
  if (jsonEqual(array.toArray(), values)) return
  if (array.length) array.delete(0, array.length)
  if (values.length) array.insert(0, values)
}

function syncImages(doc: Y.Doc, entries: Array<[string, string]>) {
  const meta = doc.getMap<PencilJsonObject>(IMAGES_META_MAP)
  const chunks = doc.getMap<Uint8Array>(IMAGE_CHUNKS_MAP)
  const wantedHashes = new Set(entries.map(([hash]) => hash))
  for (const hash of Array.from(meta.keys())) if (!wantedHashes.has(hash)) meta.delete(hash)
  for (const key of Array.from(chunks.keys())) {
    const hash = key.split(':')[0]
    if (!wantedHashes.has(hash)) chunks.delete(key)
  }
  for (const [hash, encoded] of entries) {
    const bytes = base64ToBytes(encoded)
    const count = Math.ceil(bytes.length / PENCIL_IMAGE_CHUNK_BYTES)
    meta.set(hash, { size: bytes.length, chunkCount: count, complete: true })
    for (let index = 0; index < count; index += 1) {
      const key = `${hash}:${index}`
      const value = bytes.slice(index * PENCIL_IMAGE_CHUNK_BYTES, (index + 1) * PENCIL_IMAGE_CHUNK_BYTES)
      const current = chunks.get(key)
      if (!current || !bytesEqual(current, value)) chunks.set(key, value)
    }
    for (const key of Array.from(chunks.keys())) {
      if (key.startsWith(`${hash}:`) && Number(key.slice(hash.length + 1)) >= count) chunks.delete(key)
    }
  }
}

function materializeImages(doc: Y.Doc): Array<[string, string]> {
  const meta = doc.getMap<PencilJsonObject>(IMAGES_META_MAP)
  const chunks = doc.getMap<Uint8Array>(IMAGE_CHUNKS_MAP)
  const result: Array<[string, string]> = []
  for (const [hash, value] of meta.entries()) {
    const count = numberValue(value.chunkCount)
    if (!value.complete || count < 0) continue
    const parts: Uint8Array[] = []
    let complete = true
    for (let index = 0; index < count; index += 1) {
      const part = chunks.get(`${hash}:${index}`)
      if (!part) {
        complete = false
        break
      }
      parts.push(part)
    }
    if (!complete) continue
    const total = parts.reduce((sum, part) => sum + part.length, 0)
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
      bytes.set(part, offset)
      offset += part.length
    }
    result.push([hash, bytesToBase64(bytes)])
  }
  return result
}

function materializeEntryMap(map: Y.Map<PencilJsonObject>): Array<[string, PencilJsonObject]> {
  return Array.from(map.entries()).map(([id, value]) => [id, value])
}

function styleRunsFromYText(text: Y.Text | undefined): PencilJsonValue[] {
  if (!text) return []
  const runs: PencilJsonValue[] = []
  let offset = 0
  for (const part of text.toDelta()) {
    const content = typeof part.insert === 'string' ? part.insert : ''
    const style = parseStyle(part.attributes?.[TEXT_STYLE_ATTRIBUTE])
    if (content && style) runs.push({ start: offset, length: content.length, style })
    offset += content.length
  }
  return runs
}

function normalizeStyleRuns(value: PencilJsonValue | undefined, textLength: number) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isObject(item)) return []
    const start = Math.max(0, Math.trunc(numberValue(item.start)))
    const length = Math.min(Math.max(0, Math.trunc(numberValue(item.length))), Math.max(0, textLength - start))
    return length && isObject(item.style) ? [{ start, length, style: item.style }] : []
  })
}

function syncMapValues<T extends PencilJsonValue | Uint8Array>(map: Y.Map<T>, values: Record<string, T>) {
  const wanted = new Set(Object.keys(values))
  for (const key of Array.from(map.keys())) if (!wanted.has(key)) map.delete(key)
  for (const [key, value] of Object.entries(values) as Array<[string, T]>) {
    const current = map.get(key)
    if (value === null) {
      if (current !== null) map.set(key, value)
    } else if (value instanceof Uint8Array) {
      if (!(current instanceof Uint8Array) || !bytesEqual(current, value)) map.set(key, value)
    } else if (!jsonEqual(current, value)) {
      map.set(key, value)
    }
  }
}

function assertPencilCollaborationStateSize(doc: Y.Doc) {
  const bytes = Y.encodeStateAsUpdate(doc).byteLength
  if (bytes > PENCIL_COLLABORATION_MAX_STATE_BYTES) {
    throw new Error(`Pencil collaborative document exceeds the ${PENCIL_COLLABORATION_MAX_STATE_BYTES / 1024 / 1024} MB platform limit.`)
  }
}

function stableStringify(value: PencilJsonObject) {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: PencilJsonValue): PencilJsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key] ?? null)]))
}

function parseStyle(value: unknown): PencilJsonObject | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(value)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isObject(value: unknown): value is PencilJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array))
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function bytesValue(value: unknown) {
  return value instanceof Uint8Array ? value : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function pencilStatus(value: unknown): PencilDocumentStatus {
  return value === 'reviewed' || value === 'archived' ? value : 'draft'
}

function pencilKind(value: unknown): PencilDocumentKind {
  return value === 'figma-import' || value === 'wireframe' || value === 'prototype' || value === 'component-library' || value === 'illustration' || value === 'other'
    ? value
    : 'design'
}
