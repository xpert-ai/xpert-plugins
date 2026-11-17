import { createHash } from 'node:crypto'
import { resourceV2Schema, limits, type ResourceDocumentV2 } from './resource-contract'

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** JSON is the single untrusted boundary; reject duplicate keys before applying a domain schema. */
export function parseLibraryJson(bytes: Buffer, maxBytes: number = limits.documentBytes): unknown {
  if (bytes.length > maxBytes) throw new Error('LIBRARY_DOCUMENT_LIMIT')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const stack: (Set<string> | null)[] = []
  for (const token of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]]/g)) {
    if (token[0] === '{' || token[0] === '[') {
      stack.push(token[0] === '{' ? new Set() : null)
      if (stack.length > 64) throw new Error('LIBRARY_JSON_DEPTH')
    } else if (token[0] === '}' || token[0] === ']') stack.pop()
    else if (/^\s*:/.test(text.slice(token.index! + token[0].length))) {
      const key: string = JSON.parse(token[0]), keys = stack.at(-1)
      if (!keys || keys.has(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('LIBRARY_JSON_KEY')
      keys.add(key)
    }
  }
  return JSON.parse(text, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('LIBRARY_JSON_NUMBER')
    return value
  }) as unknown
}

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue | undefined }
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}
export function resourceBytes(document: ResourceDocumentV2): Buffer {
  const bytes = Buffer.from(canonicalJson(resourceV2Schema.parse(document)))
  if (bytes.length > limits.documentBytes) throw new Error('LIBRARY_DOCUMENT_LIMIT')
  return bytes
}
export const resourceHash = (document: ResourceDocumentV2) => sha256(resourceBytes(document))
