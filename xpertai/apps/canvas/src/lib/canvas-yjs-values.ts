import * as Y from 'yjs'
import type { CanvasJsonObject, CanvasJsonValue } from './types.js'

type JsonObject = CanvasJsonObject
export type CanvasSharedValue = CanvasJsonValue | Y.Map<CanvasSharedValue> | Y.Array<CanvasSharedValue> | Y.Text
const isObject = (value: CanvasJsonValue): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value)
const equal = (left: CanvasJsonValue | undefined, right: CanvasJsonValue | undefined) => JSON.stringify(left) === JSON.stringify(right)
const textPath = (path: string[]) => path[0] === 'props' && path.at(-1) === 'text'

/** Strings on tldraw text paths merge as text; identifiers/enums retain scalar semantics. */
export function createSharedValue(value: CanvasJsonValue, path: string[] = []): CanvasSharedValue {
  if (typeof value === 'string' && textPath(path)) return new Y.Text(value)
  if (Array.isArray(value)) {
    const array = new Y.Array<CanvasSharedValue>()
    array.push(value.map((item, index) => createSharedValue(item, [...path, String(index)])))
    return array
  }
  if (isObject(value)) {
    const map = new Y.Map<CanvasSharedValue>()
    for (const [key, item] of Object.entries(value)) if (item !== undefined) map.set(key, createSharedValue(item, [...path, key]))
    return map
  }
  return value
}

export function sharedValueJson(value: CanvasSharedValue): CanvasJsonValue {
  if (value instanceof Y.Text) return value.toString()
  if (value instanceof Y.Map) return Object.fromEntries([...value.entries()].map(([key, item]) => [key, sharedValueJson(item)]))
  if (value instanceof Y.Array) return value.toArray().map(sharedValueJson)
  return value
}

/** Apply only local changes relative to the editor's before-image; unrelated remote fields survive. */
export function patchSharedMap(map: Y.Map<CanvasSharedValue>, next: JsonObject, before: JsonObject, path: string[] = []) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(next)])) {
    if (equal(before[key], next[key])) continue
    const nextValue = next[key]
    if (nextValue === undefined) { map.delete(key); continue }
    const current = map.get(key)
    const value = patchSharedValue(current, nextValue, before[key], [...path, key])
    if (value !== current) map.set(key, value)
  }
}

function patchSharedValue(current: CanvasSharedValue | undefined, next: CanvasJsonValue, before: CanvasJsonValue | undefined, path: string[]): CanvasSharedValue {
  if (current instanceof Y.Map && isObject(next) && before !== undefined && isObject(before)) {
    patchSharedMap(current, next, before, path)
    return current
  }
  if (current instanceof Y.Text && typeof next === 'string' && typeof before === 'string') {
    // Applying a stale editor's numeric offsets to a newly hydrated text would corrupt its edits.
    if (current.toString() !== before) throw new Error('CANVAS_TEXT_BASE_CHANGED: reload the current text before retrying this edit.')
    const oldChars = Array.from(before), newChars = Array.from(next)
    let prefix = 0, suffix = 0
    while (prefix < oldChars.length && prefix < newChars.length && oldChars[prefix] === newChars[prefix]) prefix++
    while (suffix < oldChars.length - prefix && suffix < newChars.length - prefix && oldChars.at(-suffix - 1) === newChars.at(-suffix - 1)) suffix++
    const offset = oldChars.slice(0, prefix).join('').length
    const remove = oldChars.slice(prefix, oldChars.length - suffix).join('').length
    if (remove) current.delete(offset, remove)
    const inserted = newChars.slice(prefix, newChars.length - suffix).join('')
    if (inserted) current.insert(offset, inserted)
    return current
  }
  if (current instanceof Y.Array && Array.isArray(next) && Array.isArray(before)) {
    if (before.length === next.length && current.length === before.length) {
      for (let index = 0; index < next.length; index++) {
        if (equal(before[index], next[index])) continue
        const child = current.get(index)
        const value = patchSharedValue(child, next[index], before[index], [...path, String(index)])
        if (child !== value) { current.delete(index, 1); current.insert(index, [value]) }
      }
    } else {
      if (!equal(sharedValueJson(current), before)) throw new Error('CANVAS_ARRAY_BASE_CHANGED: reload before changing this structure.')
      let prefix = 0, suffix = 0
      while (prefix < before.length && prefix < next.length && equal(before[prefix], next[prefix])) prefix++
      while (suffix < before.length - prefix && suffix < next.length - prefix && equal(before.at(-suffix - 1), next.at(-suffix - 1))) suffix++
      const count = before.length - prefix - suffix
      if (count) current.delete(prefix, count)
      const inserted = next.slice(prefix, next.length - suffix).map((item, index) => createSharedValue(item, [...path, String(prefix + index)]))
      if (inserted.length) current.insert(prefix, inserted)
    }
    return current
  }
  return createSharedValue(next, path)
}

/** Preflight the whole mutation before Y.Doc.transact: Yjs transactions do not roll back thrown errors. */
export function assertSharedValueBase(current: CanvasSharedValue | undefined, next: CanvasJsonValue | undefined, before: CanvasJsonValue | undefined): void {
  if (next === undefined) return
  if (equal(next, before)) return
  if (current instanceof Y.Text && typeof before === 'string' && typeof next === 'string' && current.toString() !== before)
    throw new Error('CANVAS_TEXT_BASE_CHANGED: reload the current text before retrying this edit.')
  if (current instanceof Y.Map && before !== undefined && isObject(before) && isObject(next)) {
    for (const key of Object.keys(next)) assertSharedValueBase(current.get(key), next[key], before[key])
  }
  if (current instanceof Y.Array && Array.isArray(before) && Array.isArray(next)) {
    if (before.length === next.length && current.length === before.length) {
      next.forEach((value, index) => assertSharedValueBase(current.get(index), value, before[index]))
    } else if (!equal(sharedValueJson(current), before)) throw new Error('CANVAS_ARRAY_BASE_CHANGED: reload before changing this structure.')
  }
}
