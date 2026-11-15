import { createHash } from 'node:crypto'
// JSONB does not preserve insertion order. Host evidence hashes sort object keys at every depth.
export function digest(value: object | string): string {
  const encoded = JSON.stringify(value, (_, v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, Reflect.get(v, k)]),
        )
      : v,
  )
  return createHash('sha256').update(encoded).digest('hex')
}
